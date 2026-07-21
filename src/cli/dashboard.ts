/**
 * Lightweight local dashboard server (127.0.0.1 only).
 * One HTML page — no SPA build, no Electron — manage API keys + GitHub/Gitea forges.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { loadConfig, writeConfig, writeSecret, clearSecret, listKeyRows, maskSecret } from '../config/index.js';
import {
  listForgeRows,
  writeForgeToken,
  clearForgeToken,
  readForgeToken,
  normalizeForgeBaseUrl,
} from '../forge/index.js';
import type { ForgeRemote } from '../config/schema.js';

export interface DashboardOptions {
  port?: number;
  openBrowser?: boolean;
  cwd?: string;
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

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* best-effort */
  });
}

function dashboardHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Sky CLI Dashboard</title>
<style>
  :root {
    --bg: #0f1419;
    --panel: #1a2332;
    --border: #2a3a4f;
    --text: #e7ecf3;
    --muted: #8b9bb4;
    --accent: #3d9cfd;
    --ok: #3dd68c;
    --warn: #f5a524;
    --danger: #f76e6e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1b2a44, var(--bg));
    color: var(--text); min-height: 100vh;
  }
  header {
    padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
    display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap;
  }
  header h1 { margin: 0; font-size: 1.35rem; letter-spacing: 0.02em; }
  header span { color: var(--muted); font-size: 0.9rem; }
  main { max-width: 960px; margin: 0 auto; padding: 1.25rem 1.5rem 3rem; display: grid; gap: 1.25rem; }
  section {
    background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.1rem;
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
  p.hint { margin: 0 0 0.85rem; color: var(--muted); font-size: 0.88rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.45rem 0.35rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
  .pill { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 999px; font-size: 0.75rem; }
  .pill.ok { background: #1d3b2f; color: var(--ok); }
  .pill.miss { background: #3a2a2a; color: var(--danger); }
  .pill.keyless { background: #243044; color: var(--accent); }
  form.row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.85rem; align-items: center; }
  input, select, button {
    font: inherit; border-radius: 8px; border: 1px solid var(--border);
    background: #121a24; color: var(--text); padding: 0.45rem 0.6rem;
  }
  input { min-width: 10rem; flex: 1; }
  button {
    background: var(--accent); color: #041018; border: none; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
  button.danger { background: var(--danger); color: #1a0808; }
  #toast {
    position: fixed; bottom: 1rem; right: 1rem; background: #243044; border: 1px solid var(--border);
    padding: 0.65rem 0.9rem; border-radius: 10px; display: none; max-width: 22rem;
  }
</style>
</head>
<body>
<header>
  <h1>Sky</h1>
  <span>Local dashboard · 127.0.0.1 only · keys stay in ~/.sky/secrets.json</span>
</header>
<main>
  <section>
    <h2>Providers & API keys</h2>
    <p class="hint">Same data as <code>/keys</code>. Set a key, then in the CLI: <code>/provider &lt;name&gt;</code> or <code>/provider free</code>.</p>
    <div id="keys"></div>
    <form class="row" id="key-form">
      <select id="key-provider" aria-label="Provider"></select>
      <input id="key-value" type="password" placeholder="API key" autocomplete="off" required />
      <button type="submit">Save key</button>
    </form>
  </section>
  <section>
    <h2>GitHub / Gitea</h2>
    <p class="hint">Connect a forge so Sky can <code>git push</code> / <code>pull</code> / <code>fetch</code> with a token (self-hosted Gitea welcome).</p>
    <div id="forges"></div>
    <form class="row" id="forge-form">
      <input id="forge-id" placeholder="id (github / work)" required pattern="[a-zA-Z][a-zA-Z0-9_-]*" />
      <select id="forge-type">
        <option value="github">GitHub</option>
        <option value="gitea">Gitea</option>
      </select>
      <input id="forge-url" placeholder="https://gitea.example.com" required />
      <input id="forge-user" placeholder="username (optional)" />
      <input id="forge-token" type="password" placeholder="PAT / access token" autocomplete="off" />
      <button type="submit">Save forge</button>
    </form>
  </section>
</main>
<div id="toast"></div>
<script>
const TOKEN = ${JSON.stringify(token)};
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Sky-Token': TOKEN,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 2800);
}
function pill(status) {
  if (status === 'ready') return '<span class="pill ok">ready</span>';
  if (status === 'keyless') return '<span class="pill keyless">keyless</span>';
  return '<span class="pill miss">missing</span>';
}
async function refresh() {
  const state = await api('/api/state');
  const keysEl = document.getElementById('keys');
  const sel = document.getElementById('key-provider');
  sel.innerHTML = '';
  keysEl.innerHTML = '<table><thead><tr><th>Provider</th><th>Status</th><th>Source</th><th></th></tr></thead><tbody>' +
    state.keys.map(k => {
      const opt = document.createElement('option');
      opt.value = k.provider; opt.textContent = k.provider;
      sel.appendChild(opt);
      const clear = k.status === 'ready' && k.source === 'secrets'
        ? \`<button class="secondary danger" data-clear="\${k.provider}">Clear</button>\`
        : '';
      return \`<tr><td>\${k.provider}</td><td>\${pill(k.status)}</td><td>\${k.source}\${k.masked ? ' ' + k.masked : ''}</td><td>\${clear}</td></tr>\`;
    }).join('') + '</tbody></table>';

  const forgesEl = document.getElementById('forges');
  if (!state.forges.length) {
    forgesEl.innerHTML = '<p class="hint">No forges yet — add GitHub or your Gitea URL below.</p>';
  } else {
    forgesEl.innerHTML = '<table><thead><tr><th>Id</th><th>Type</th><th>URL</th><th>Token</th><th></th></tr></thead><tbody>' +
      state.forges.map(f => \`<tr>
        <td>\${f.id}\${f.isDefault ? ' ★' : ''}</td>
        <td>\${f.type}</td>
        <td>\${f.baseUrl}</td>
        <td>\${f.hasToken ? '<span class="pill ok">set</span>' : '<span class="pill miss">missing</span>'}</td>
        <td>
          <button class="secondary" data-default="\${f.id}">Default</button>
          <button class="secondary danger" data-forget="\${f.id}">Remove</button>
        </td>
      </tr>\`).join('') + '</tbody></table>';
  }

  keysEl.querySelectorAll('[data-clear]').forEach(btn => btn.onclick = async () => {
    await api('/api/keys/' + encodeURIComponent(btn.dataset.clear), { method: 'DELETE' });
    toast('Cleared key'); refresh();
  });
  forgesEl.querySelectorAll('[data-default]').forEach(btn => btn.onclick = async () => {
    await api('/api/forge/default', { method: 'POST', body: JSON.stringify({ id: btn.dataset.default }) });
    toast('Default forge updated'); refresh();
  });
  forgesEl.querySelectorAll('[data-forget]').forEach(btn => btn.onclick = async () => {
    await api('/api/forge/' + encodeURIComponent(btn.dataset.forget), { method: 'DELETE' });
    toast('Forge removed'); refresh();
  });
}
document.getElementById('key-form').onsubmit = async (e) => {
  e.preventDefault();
  await api('/api/keys', {
    method: 'POST',
    body: JSON.stringify({
      provider: document.getElementById('key-provider').value,
      key: document.getElementById('key-value').value,
    }),
  });
  document.getElementById('key-value').value = '';
  toast('Key saved'); refresh();
};
document.getElementById('forge-type').onchange = () => {
  const type = document.getElementById('forge-type').value;
  const url = document.getElementById('forge-url');
  if (type === 'github' && !url.value) url.value = 'https://github.com';
  if (type === 'gitea' && url.value === 'https://github.com') url.value = '';
};
document.getElementById('forge-form').onsubmit = async (e) => {
  e.preventDefault();
  await api('/api/forge', {
    method: 'POST',
    body: JSON.stringify({
      id: document.getElementById('forge-id').value.trim(),
      type: document.getElementById('forge-type').value,
      baseUrl: document.getElementById('forge-url').value.trim(),
      username: document.getElementById('forge-user').value.trim() || undefined,
      token: document.getElementById('forge-token').value || undefined,
    }),
  });
  document.getElementById('forge-token').value = '';
  toast('Forge saved'); refresh();
};
refresh().catch(err => toast(String(err.message || err)));
</script>
</body>
</html>`;
}

/** Start the dashboard; resolves when the server is closed. */
export async function startDashboard(options: DashboardOptions = {}): Promise<number> {
  const token = randomBytes(16).toString('hex');
  const cwd = options.cwd ?? process.cwd();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      // CSRF-ish gate for mutating APIs
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.headers['x-sky-token'] !== token) {
          return json(res, 401, { error: 'unauthorized' });
        }
      }

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(dashboardHtml(token));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        const config = loadConfig({ cwd });
        return json(res, 200, {
          keys: listKeyRows(config.providers, process.env, config.defaultProvider),
          forges: listForgeRows(config),
          defaultProvider: config.defaultProvider,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/keys') {
        const body = JSON.parse(await readBody(req)) as { provider?: string; key?: string };
        if (!body.provider || !body.key) return json(res, 400, { error: 'provider and key required' });
        writeSecret(body.provider, body.key);
        return json(res, 200, { ok: true, masked: maskSecret(body.key) });
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/keys/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/keys/'.length));
        clearSecret(id);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/api/forge') {
        const body = JSON.parse(await readBody(req)) as {
          id?: string;
          type?: ForgeRemote['type'];
          baseUrl?: string;
          username?: string;
          token?: string;
          makeDefault?: boolean;
        };
        if (!body.id || !body.type || !body.baseUrl) {
          return json(res, 400, { error: 'id, type, baseUrl required' });
        }
        const config = loadConfig({ cwd });
        config.forge.remotes[body.id] = {
          type: body.type,
          baseUrl: normalizeForgeBaseUrl(body.baseUrl),
          username: body.username,
        };
        if (!config.forge.default || body.makeDefault) config.forge.default = body.id;
        writeConfig(config);
        if (body.token) writeForgeToken(body.id, body.token);
        return json(res, 200, { ok: true, hasToken: Boolean(readForgeToken(body.id)) });
      }

      if (req.method === 'POST' && url.pathname === '/api/forge/default') {
        const body = JSON.parse(await readBody(req)) as { id?: string };
        if (!body.id) return json(res, 400, { error: 'id required' });
        const config = loadConfig({ cwd });
        if (!config.forge.remotes[body.id]) return json(res, 404, { error: 'unknown forge' });
        config.forge.default = body.id;
        writeConfig(config);
        return json(res, 200, { ok: true });
      }

      if (req.method === 'DELETE' && url.pathname.startsWith('/api/forge/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/forge/'.length));
        const config = loadConfig({ cwd });
        delete config.forge.remotes[id];
        if (config.forge.default === id) config.forge.default = undefined;
        writeConfig(config);
        clearForgeToken(id);
        return json(res, 200, { ok: true });
      }

      json(res, 404, { error: 'not found' });
    } catch (error) {
      json(res, 500, { error: (error as Error).message });
    }
  });

  const port = options.port ?? 0;
  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}/`;
  process.stdout.write(`Sky dashboard → ${url}\nCtrl+C to stop.\n`);
  if (options.openBrowser !== false) openBrowser(url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      server.close(() => resolve());
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}
