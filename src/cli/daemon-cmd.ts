/**
 * CLI commands: `sky serve`, `sky daemon`, `sky attach`.
 */

import chalk from 'chalk';
import type { GlobalOptions } from './runtime.js';
import { buildRuntime, attachMcp } from './runtime.js';
import { startDaemonHttp, generateDaemonToken } from '../server/http.js';
import {
  writeDaemonState,
  clearDaemonState,
  readDaemonState,
  isDaemonHealthy,
  startDetachedDaemon,
  stopDaemon,
  daemonStateTemplate,
} from '../server/daemon.js';
import { attachAndRun } from './client.js';

/** Foreground API server (OpenCode `serve`). */
export async function serveCommand(
  opts: { port?: number; register?: boolean; yolo?: boolean },
  global: GlobalOptions,
): Promise<number> {
  const runtime = buildRuntime({ ...global, yolo: opts.yolo || global.yolo }, false);
  await attachMcp(runtime);
  const token = generateDaemonToken();
  const http = await startDaemonHttp({
    runtime,
    global: { ...global, yolo: opts.yolo || global.yolo, force: opts.yolo || global.force },
    token,
    port: opts.port,
  });

  if (opts.register) {
    writeDaemonState(
      daemonStateTemplate({
        url: http.url,
        pid: process.pid,
        token,
        host: http.host,
        port: http.port,
      }),
    );
  }

  const line = opts.register
    ? `Sky daemon listening on ${http.url} (registered)`
    : `Sky serve listening on ${http.url}`;
  process.stderr.write(chalk.cyan(`${line}\n`));
  process.stderr.write(chalk.gray(`Token: export SKY_DAEMON_TOKEN=${token}\n`));
  process.stderr.write(chalk.gray(`Health: curl -H "X-Sky-Token: $SKY_DAEMON_TOKEN" ${http.url}/health\n`));

  const shutdown = async () => {
    if (opts.register) clearDaemonState();
    await http.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await new Promise(() => {
    /* run until signal */
  });
  return 0;
}

export async function daemonCommand(
  action: string | undefined,
  opts: { port?: number; yolo?: boolean },
  global: GlobalOptions,
): Promise<number> {
  const act = (action ?? 'status').toLowerCase();
  if (act === 'start') {
    const state = await startDetachedDaemon({
      port: opts.port,
      yolo: opts.yolo || global.yolo,
      cwd: global.cwd,
    });
    process.stdout.write(`daemon started\nurl: ${state.url}\npid: ${state.pid}\n`);
    process.stdout.write(`export SKY_DAEMON_URL=${state.url}\nexport SKY_DAEMON_TOKEN=${state.token}\n`);
    return 0;
  }
  if (act === 'stop') {
    const ok = await stopDaemon();
    process.stdout.write(ok ? 'daemon stopped\n' : 'no daemon running\n');
    return 0;
  }
  if (act === 'status') {
    const state = readDaemonState();
    if (!state) {
      process.stdout.write('daemon: not running\n');
      return 1;
    }
    const healthy = await isDaemonHealthy(state);
    process.stdout.write(
      `daemon: ${healthy ? 'healthy' : 'unreachable'}\nurl: ${state.url}\npid: ${state.pid}\nversion: ${state.version}\n`,
    );
    return healthy ? 0 : 1;
  }
  process.stderr.write(`Unknown daemon action: ${act} (use start|stop|status)\n`);
  return 2;
}

/** One-shot client: create session, stream turn as NDJSON. */
export async function attachCommand(prompt: string | undefined, global: GlobalOptions): Promise<number> {
  if (!prompt?.trim()) {
    process.stderr.write('Usage: sky attach <prompt>\n');
    return 2;
  }
  return attachAndRun({
    prompt: prompt.trim(),
    cwd: global.cwd,
    yolo: global.yolo,
    force: global.force,
    onEvent: (event, data) => {
      process.stdout.write(JSON.stringify({ event, data }) + '\n');
    },
  });
}
