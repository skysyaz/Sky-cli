/**
 * Lightweight local dashboard server (127.0.0.1 only).
 * Integrations-style UI (Cursor-like) for API keys + GitHub/Gitea forges.
 * Single HTML page — no SPA build, no Electron.
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
<title>Sky · Integrations</title>
<style>
  :root {
    --bg: #0a0a0a;
    --surface: #111111;
    --surface-2: #161616;
    --border: #2a2a2a;
    --border-hover: #3a3a3a;
    --text: #f5f5f5;
    --muted: #a0a0a0;
    --muted-2: #6b6b6b;
    --btn: #1f1f1f;
    --btn-hover: #2a2a2a;
    --accent: #e8e8e8;
    --ok: #3ecf8e;
    --danger: #f07178;
    --focus: #4c8bf5;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: "Geist", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  .top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--border);
  }
  .back {
    color: var(--muted); font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.35rem;
  }
  .back:hover { color: var(--text); }
  .local-badge {
    font-size: 0.72rem; color: var(--muted-2);
    border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.55rem;
  }
  main { max-width: 720px; margin: 0 auto; padding: 1.75rem 1.25rem 4rem; }
  h1 {
    margin: 0 0 0.35rem; font-size: 1.65rem; font-weight: 600; letter-spacing: -0.02em;
  }
  .subtitle { margin: 0 0 1.75rem; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }

  .category { margin-top: 1.75rem; }
  .category-title {
    margin: 0 0 0.65rem; font-size: 0.78rem; font-weight: 600;
    letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted-2);
  }
  .list {
    border: 1px solid var(--border); border-radius: 12px; overflow: hidden;
    background: var(--surface);
  }
  .row {
    display: flex; align-items: center; gap: 0.9rem;
    padding: 0.95rem 1rem; border-bottom: 1px solid var(--border);
    position: relative;
  }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--surface-2); }
  .icon {
    width: 36px; height: 36px; border-radius: 8px; flex: none;
    display: grid; place-items: center;
    background: #1a1a1a; border: 1px solid var(--border); color: #ddd;
  }
  .icon svg { width: 20px; height: 20px; display: block; }
  .meta { flex: 1; min-width: 0; }
  .name { font-weight: 600; font-size: 0.98rem; margin: 0 0 0.15rem; }
  .desc {
    margin: 0; color: var(--muted); font-size: 0.82rem; line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis;
  }
  .desc .ok { color: var(--ok); }
  .actions { flex: none; position: relative; }

  .btn {
    appearance: none; font: inherit; cursor: pointer;
    border-radius: 8px; border: 1px solid var(--border);
    background: var(--btn); color: var(--text);
    padding: 0.42rem 0.75rem; font-size: 0.85rem; font-weight: 500;
    display: inline-flex; align-items: center; gap: 0.35rem;
  }
  .btn:hover { background: var(--btn-hover); border-color: var(--border-hover); }
  .btn:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .btn .chev { opacity: 0.7; font-size: 0.7rem; }
  .btn .ext { opacity: 0.75; font-size: 0.85rem; }
  .btn.danger { color: var(--danger); border-color: #3a2222; }
  .btn.primary {
    background: var(--accent); color: #0a0a0a; border-color: transparent; font-weight: 600;
  }
  .btn.primary:hover { filter: brightness(0.95); }

  .menu {
    display: none; position: absolute; right: 0; top: calc(100% + 6px); z-index: 20;
    min-width: 11.5rem; background: #1a1a1a; border: 1px solid var(--border);
    border-radius: 10px; padding: 0.35rem; box-shadow: 0 12px 40px rgba(0,0,0,0.45);
  }
  .menu.open { display: grid; gap: 0.15rem; }
  .menu button {
    appearance: none; border: none; background: transparent; color: var(--text);
    text-align: left; padding: 0.5rem 0.65rem; border-radius: 7px;
    font: inherit; font-size: 0.85rem; cursor: pointer;
  }
  .menu button:hover { background: #252525; }
  .menu button.danger { color: var(--danger); }

  /* Modal */
  .overlay {
    display: none; position: fixed; inset: 0; z-index: 40;
    background: rgba(0,0,0,0.65); align-items: flex-end; justify-content: center;
    padding: 1rem;
  }
  .overlay.open { display: flex; }
  @media (min-width: 560px) {
    .overlay { align-items: center; }
  }
  .modal {
    width: min(420px, 100%); background: #141414; border: 1px solid var(--border);
    border-radius: 14px; padding: 1.15rem 1.15rem 1rem;
    box-shadow: 0 24px 80px rgba(0,0,0,0.55);
  }
  .modal h3 { margin: 0 0 0.25rem; font-size: 1.05rem; }
  .modal p.lead { margin: 0 0 1rem; color: var(--muted); font-size: 0.85rem; line-height: 1.4; }
  .field { margin-bottom: 0.75rem; }
  .field label {
    display: block; font-size: 0.75rem; color: var(--muted); margin-bottom: 0.3rem;
  }
  .field input, .field select {
    width: 100%; font: inherit; color: var(--text);
    background: #0e0e0e; border: 1px solid var(--border); border-radius: 8px;
    padding: 0.55rem 0.65rem;
  }
  .field input:focus, .field select:focus {
    outline: none; border-color: var(--focus);
  }
  .modal-actions {
    display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;
  }

  #toast {
    position: fixed; bottom: 1.1rem; left: 50%; transform: translateX(-50%);
    background: #1f1f1f; border: 1px solid var(--border);
    padding: 0.65rem 0.95rem; border-radius: 999px; display: none;
    font-size: 0.85rem; max-width: 90vw; z-index: 50;
  }

  .providers-hint {
    margin: 0.65rem 0 0; color: var(--muted-2); font-size: 0.78rem; line-height: 1.4;
  }
</style>
</head>
<body>
  <div class="top">
    <span class="back">Sky CLI</span>
    <span class="local-badge">127.0.0.1 only</span>
  </div>
  <main>
    <h1>Integrations</h1>
    <p class="subtitle">Connect external tools so Sky can read repos, commit, and push with your credentials.</p>

    <section class="category" aria-labelledby="sc-title">
      <h2 class="category-title" id="sc-title">Source Control</h2>
      <div class="list" id="source-control"></div>
    </section>

    <section class="category" aria-labelledby="prov-title">
      <h2 class="category-title" id="prov-title">LLM Providers</h2>
      <div class="list" id="providers"></div>
      <p class="providers-hint">Keys stay in <code>~/.sky/secrets.json</code> (mode 0600). Switch in the CLI with <code>/provider</code> or <code>/keys</code>.</p>
    </section>
  </main>

  <div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal">
      <h3 id="modal-title">Connect</h3>
      <p class="lead" id="modal-lead"></p>
      <form id="connect-form">
        <input type="hidden" id="f-type" />
        <input type="hidden" id="f-id" />
        <div class="field" id="field-url">
          <label for="f-url">Base URL</label>
          <input id="f-url" placeholder="https://gitea.example.com" autocomplete="off" />
        </div>
        <div class="field" id="field-user">
          <label for="f-user">Username</label>
          <input id="f-user" placeholder="optional" autocomplete="username" />
        </div>
        <div class="field">
          <label for="f-token">Personal access token</label>
          <input id="f-token" type="password" placeholder="ghp_… / gitea token" autocomplete="off" required />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" id="modal-cancel">Cancel</button>
          <button type="submit" class="btn primary" id="modal-submit">Connect</button>
        </div>
      </form>
    </div>
  </div>

  <div id="toast"></div>

<script>
const TOKEN = ${JSON.stringify(token)};

const ICONS = {
  github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85.004 1.71.12 2.51.35 1.91-1.32 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.81 0 .27.18.59.69.48A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>',
  gitea: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.9 12.9c.2 1.6.9 3.1 2 4.3 2.2 2.4 5.5 3.3 8.6 2.5 1.3-.3 2.5-1 3.5-1.8.4-.4.8-.8 1.1-1.3.9-1.4 1.3-3.1 1.1-4.7-.1-.9-.4-1.8-.9-2.6L11.3 2.3c-.3-.5-.9-.7-1.4-.5L2.6 5.2c-.5.2-.8.8-.6 1.3l1 6.4zm3.3-5.5 6.4-2.7 6.1 9.1c.3.5.2 1.1-.2 1.5-.9.9-2.1 1.5-3.4 1.7-2.5.5-5-.2-6.7-1.9-1.4-1.4-2-3.5-1.6-5.4.1-.7.4-1.4.8-2 .2-.3.4-.5.6-.7z"/><circle cx="9.2" cy="11.2" r="1.3"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="14" r="3.2"/><path d="M10.5 12.5 20 3.5M16.5 4.5l2.5 2.5M14.5 6.5l2 2"/></svg>',
};

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
  setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function closeMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
}

function findForge(forges, type, preferredId) {
  return (
    forges.find((f) => f.id === preferredId) ||
    forges.find((f) => f.type === type && f.hasToken) ||
    forges.find((f) => f.type === type) ||
    null
  );
}

function connectedDesc(f) {
  const who = f.username ? \`Connected as \${f.username}\` : 'Connected';
  const star = f.isDefault ? ' · default' : '';
  return \`<span class="ok">\${who}</span> · \${f.baseUrl}\${star}\`;
}

function renderSourceControl(forges) {
  const root = document.getElementById('source-control');
  const github = findForge(forges, 'github', 'github');
  const gitea = findForge(forges, 'gitea', 'gitea');
  const extras = forges.filter((f) => {
    if (github && f.id === github.id) return false;
    if (gitea && f.id === gitea.id) return false;
    return true;
  });

  const rows = [
    {
      type: 'github',
      id: github?.id || 'github',
      title: 'GitHub',
      icon: ICONS.github,
      connected: Boolean(github?.hasToken),
      forge: github,
      idle: 'Connect GitHub so Sky can clone, commit, and push to your repositories.',
    },
    {
      type: 'gitea',
      id: gitea?.id || 'gitea',
      title: 'Gitea',
      icon: ICONS.gitea,
      connected: Boolean(gitea?.hasToken),
      forge: gitea,
      idle: 'Connect a Gitea instance (self-hosted welcome) for git push / pull / fetch.',
    },
    ...extras.map((f) => ({
      type: f.type,
      id: f.id,
      title: f.id,
      icon: f.type === 'github' ? ICONS.github : ICONS.gitea,
      connected: f.hasToken,
      forge: f,
      idle: \`Connect \${f.type} at \${f.baseUrl}\`,
    })),
  ];

  root.innerHTML = rows.map((r) => {
    const desc = r.connected && r.forge ? connectedDesc(r.forge) : r.idle;
    const action = r.connected
      ? \`<button type="button" class="btn" data-manage="\${r.id}">Manage <span class="chev">▾</span></button>
         <div class="menu" data-menu="\${r.id}">
           <button type="button" data-act="token" data-id="\${r.id}" data-type="\${r.type}">Update token</button>
           <button type="button" data-act="default" data-id="\${r.id}">Set as default</button>
           <button type="button" class="danger" data-act="disconnect" data-id="\${r.id}">Disconnect</button>
         </div>\`
      : \`<button type="button" class="btn" data-connect="\${r.type}" data-id="\${r.id}">Connect <span class="ext">↗</span></button>\`;
    return \`<div class="row">
      <div class="icon">\${r.icon}</div>
      <div class="meta">
        <p class="name">\${r.title}</p>
        <p class="desc">\${desc}</p>
      </div>
      <div class="actions">\${action}</div>
    </div>\`;
  }).join('');

  root.querySelectorAll('[data-connect]').forEach((btn) => {
    btn.onclick = () => openConnect({
      type: btn.dataset.connect,
      id: btn.dataset.id,
      mode: 'connect',
    });
  });
  root.querySelectorAll('[data-manage]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const menu = root.querySelector('[data-menu="' + btn.dataset.manage + '"]');
      const open = menu.classList.contains('open');
      closeMenus();
      if (!open) menu.classList.add('open');
    };
  });
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      closeMenus();
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      try {
        if (act === 'disconnect') {
          await api('/api/forge/' + encodeURIComponent(id), { method: 'DELETE' });
          toast('Disconnected ' + id);
          refresh();
        } else if (act === 'default') {
          await api('/api/forge/default', { method: 'POST', body: JSON.stringify({ id }) });
          toast('Default forge → ' + id);
          refresh();
        } else if (act === 'token') {
          const f = forges.find((x) => x.id === id);
          openConnect({
            type: btn.dataset.type || f?.type || 'github',
            id,
            mode: 'update',
            url: f?.baseUrl,
            user: f?.username,
          });
        }
      } catch (err) {
        toast(String(err.message || err));
      }
    };
  });
}

function renderProviders(keys) {
  const root = document.getElementById('providers');
  // Prefer showing actionable providers first: missing keys, then ready, keyless last.
  const order = { missing: 0, ready: 1, keyless: 2 };
  const sorted = [...keys].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  root.innerHTML = sorted.map((k) => {
    let desc = 'No API key configured.';
    if (k.status === 'keyless') desc = '<span class="ok">Keyless</span> — ready without a personal key.';
    else if (k.status === 'ready') desc = \`<span class="ok">Connected</span> · \${k.source}\${k.masked ? ' ' + k.masked : ''}\`;
    const action =
      k.status === 'ready' && k.source === 'secrets'
        ? \`<button type="button" class="btn" data-manage-key="\${k.provider}">Manage <span class="chev">▾</span></button>
           <div class="menu" data-menu-key="\${k.provider}">
             <button type="button" data-key-act="set" data-provider="\${k.provider}">Update key</button>
             <button type="button" class="danger" data-key-act="clear" data-provider="\${k.provider}">Disconnect</button>
           </div>\`
        : k.status === 'keyless'
          ? \`<button type="button" class="btn" disabled style="opacity:.45;cursor:default">Ready</button>\`
          : \`<button type="button" class="btn" data-key-act="set" data-provider="\${k.provider}">Connect <span class="ext">↗</span></button>\`;
    return \`<div class="row">
      <div class="icon">\${ICONS.key}</div>
      <div class="meta">
        <p class="name">\${k.provider}</p>
        <p class="desc">\${desc}</p>
      </div>
      <div class="actions">\${action}</div>
    </div>\`;
  }).join('');

  root.querySelectorAll('[data-manage-key]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const menu = root.querySelector('[data-menu-key="' + btn.dataset.manageKey + '"]');
      const open = menu.classList.contains('open');
      closeMenus();
      if (!open) menu.classList.add('open');
    };
  });
  root.querySelectorAll('[data-key-act]').forEach((btn) => {
    btn.onclick = async () => {
      closeMenus();
      const provider = btn.dataset.provider;
      if (btn.dataset.keyAct === 'clear') {
        await api('/api/keys/' + encodeURIComponent(provider), { method: 'DELETE' });
        toast('Cleared ' + provider);
        refresh();
        return;
      }
      openKeyModal(provider);
    };
  });
}

function openConnect({ type, id, mode, url, user }) {
  document.getElementById('f-type').value = type;
  document.getElementById('f-id').value = id || type;
  document.getElementById('modal-title').textContent =
    mode === 'update' ? 'Update ' + (type === 'github' ? 'GitHub' : 'Gitea') : 'Connect ' + (type === 'github' ? 'GitHub' : 'Gitea');
  document.getElementById('modal-lead').textContent =
    type === 'github'
      ? 'Paste a GitHub personal access token with repo scope. Sky uses it for HTTPS git only on this machine.'
      : 'Enter your Gitea base URL and an access token. Works with self-hosted instances.';
  document.getElementById('f-url').value = url || (type === 'github' ? 'https://github.com' : '');
  document.getElementById('f-user').value = user || '';
  document.getElementById('f-token').value = '';
  document.getElementById('field-url').style.display = type === 'github' && mode !== 'update' ? 'none' : 'block';
  if (type === 'github' && !url) document.getElementById('field-url').style.display = 'none';
  if (type === 'gitea') document.getElementById('field-url').style.display = 'block';
  document.getElementById('modal-submit').textContent = mode === 'update' ? 'Save token' : 'Connect';
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('f-token').focus(), 50);
}

function openKeyModal(provider) {
  document.getElementById('f-type').value = 'provider';
  document.getElementById('f-id').value = provider;
  document.getElementById('modal-title').textContent = 'Connect ' + provider;
  document.getElementById('modal-lead').textContent =
    'Save an API key for ' + provider + '. Stored in ~/.sky/secrets.json (mode 0600).';
  document.getElementById('field-url').style.display = 'none';
  document.getElementById('field-user').style.display = 'none';
  document.getElementById('f-token').value = '';
  document.getElementById('f-token').placeholder = 'API key';
  document.getElementById('modal-submit').textContent = 'Save key';
  document.getElementById('overlay').classList.add('open');
  setTimeout(() => document.getElementById('f-token').focus(), 50);
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('field-url').style.display = 'block';
  document.getElementById('field-user').style.display = 'block';
  document.getElementById('f-token').placeholder = 'ghp_… / gitea token';
}

document.getElementById('modal-cancel').onclick = closeModal;
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target.id === 'overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeMenus(); }
});
document.addEventListener('click', () => closeMenus());

document.getElementById('connect-form').onsubmit = async (e) => {
  e.preventDefault();
  const type = document.getElementById('f-type').value;
  const id = document.getElementById('f-id').value.trim();
  const tokenVal = document.getElementById('f-token').value;
  try {
    if (type === 'provider') {
      await api('/api/keys', { method: 'POST', body: JSON.stringify({ provider: id, key: tokenVal }) });
      toast('Key saved for ' + id);
    } else {
      const baseUrl =
        document.getElementById('f-url').value.trim() ||
        (type === 'github' ? 'https://github.com' : '');
      if (!baseUrl) { toast('Base URL required'); return; }
      await api('/api/forge', {
        method: 'POST',
        body: JSON.stringify({
          id: id || type,
          type,
          baseUrl,
          username: document.getElementById('f-user').value.trim() || undefined,
          token: tokenVal,
          makeDefault: true,
        }),
      });
      toast((type === 'github' ? 'GitHub' : 'Gitea') + ' connected');
    }
    closeModal();
    refresh();
  } catch (err) {
    toast(String(err.message || err));
  }
};

async function refresh() {
  const state = await api('/api/state');
  renderSourceControl(state.forges || []);
  renderProviders(state.keys || []);
}

refresh().catch((err) => toast(String(err.message || err)));
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
