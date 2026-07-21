/**
 * Localhost daemon HTTP API (OpenCode-style): sessions, messages, SSE, approvals.
 * Bound to 127.0.0.1 only; authenticated with a bearer/token header.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Mode } from '../session/types.js';
import {
  createSessionBodySchema,
  postMessageBodySchema,
  resolveApprovalBodySchema,
  formatSse,
} from '../protocol/api.js';
import type { Runtime, GlobalOptions } from '../cli/runtime.js';
import { SessionHub } from './session-hub.js';
import { runDaemonTurn } from './session-runner.js';

const VERSION = '1.1.0';

export interface DaemonHttpOptions {
  runtime: Runtime;
  global: GlobalOptions;
  token: string;
  port?: number;
  host?: string;
}

export interface DaemonHttpServer {
  server: Server;
  port: number;
  host: string;
  token: string;
  url: string;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function unauthorized(res: ServerResponse): void {
  json(res, 401, { error: 'unauthorized' });
}

function checkAuth(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? req.headers['x-sky-token'];
  if (!header) return false;
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === token) return true;
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim() === token;
  return false;
}

export async function startDaemonHttp(options: DaemonHttpOptions): Promise<DaemonHttpServer> {
  const host = options.host ?? '127.0.0.1';
  const hubs = new Map<string, SessionHub>();
  const { runtime, global: gopts, token } = options;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      if (url.pathname === '/health') {
        return json(res, 200, { ok: true, version: VERSION, pid: process.pid });
      }

      if (!checkAuth(req, token)) return unauthorized(res);

      if (req.method === 'POST' && url.pathname === '/sessions') {
        const raw = await readBody(req);
        const body = createSessionBodySchema.parse(raw ? JSON.parse(raw) : {});
        const mode = body.mode as Mode;
        const cwd = body.cwd ?? runtime.cwd;
        const provider = body.provider ?? gopts.provider ?? runtime.config.defaultProvider;
        const model =
          body.model ??
          gopts.model ??
          runtime.config.providers[provider]?.defaultModel ??
          'gpt-4o';
        const session = runtime.store.create({ mode, cwd, provider, model });
        hubs.set(session.id, new SessionHub(session.id));
        return json(res, 201, {
          id: session.id,
          mode: session.mode,
          cwd: session.cwd,
          provider: session.provider,
          model: session.model,
        });
      }

      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)(.*)$/);
      if (sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]!);
        const rest = sessionMatch[2] ?? '';
        const session = runtime.store.load(id);
        let hub = hubs.get(id);
        if (!hub) {
          hub = new SessionHub(id);
          hubs.set(id, hub);
        }

        if (req.method === 'GET' && rest === '') {
          return json(res, 200, {
            id: session.id,
            mode: session.mode,
            cwd: session.cwd,
            provider: session.provider,
            model: session.model,
            messages: session.messages.length,
            busy: hub.busy,
          });
        }

        if (req.method === 'GET' && rest === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          const unsub = hub.subscribe(res);
          req.on('close', unsub);
          return;
        }

        if (req.method === 'POST' && rest === '/message') {
          const raw = await readBody(req);
          const body = postMessageBodySchema.parse(JSON.parse(raw || '{}'));
          // Open SSE on the same response for one-shot clients.
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          });
          const unsub = hub.subscribe(res);
          try {
            await runDaemonTurn({
              runtime,
              global: gopts,
              session,
              hub,
              prompt: body.prompt,
              yolo: body.yolo,
              force: body.force,
            });
            res.write(formatSse('done', { ok: true }));
          } catch (error) {
            res.write(
              formatSse('error', {
                message: (error as Error).message,
              }),
            );
          } finally {
            unsub();
            res.end();
          }
          return;
        }

        if (req.method === 'POST' && rest === '/abort') {
          hub.cancel();
          return json(res, 200, { ok: true });
        }
      }

      const approvalMatch = url.pathname.match(/^\/approvals\/([^/]+)$/);
      if (req.method === 'POST' && approvalMatch) {
        const approvalId = decodeURIComponent(approvalMatch[1]!);
        const raw = await readBody(req);
        const body = resolveApprovalBodySchema.parse(JSON.parse(raw || '{}'));
        for (const hub of hubs.values()) {
          if (hub.resolveApproval(approvalId, body.answer)) {
            return json(res, 200, { ok: true });
          }
        }
        return json(res, 404, { error: 'unknown approval id' });
      }

      json(res, 404, { error: 'not found' });
    } catch (error) {
      json(res, 500, { error: (error as Error).message });
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('failed to bind daemon port'));
    });
  });

  return {
    server,
    port,
    host,
    token,
    url: `http://${host}:${port}`,
    async close() {
      for (const hub of hubs.values()) hub.close();
      hubs.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export function generateDaemonToken(): string {
  return randomBytes(24).toString('hex');
}
