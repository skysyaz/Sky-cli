/**
 * Lightweight API-key dashboard helpers (no web UI — TUI/CLI only).
 * Lists which providers have keys, where they come from, and masked previews.
 */

import { existsSync, readFileSync } from 'node:fs';
import { providerNameSchema, type ProviderConfig } from './schema.js';
import { hasApiKey, readSecret, secretsPath } from './secrets.js';
import { isKeylessProvider, providerAuthSetupCard } from './provider-auth.js';

export interface KeyRow {
  provider: string;
  status: 'ready' | 'missing' | 'keyless';
  source: 'none' | 'keyless' | 'secrets' | 'env' | 'config';
  masked?: string;
}

const WELL_KNOWN: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  zenmux: 'ZENMUX_API_KEY',
  'ollama-cloud': 'OLLAMA_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
  'qwen-web': 'DASHSCOPE_API_KEY',
  'zai-web': 'ZAI_API_KEY',
  'kimi-web': 'MOONSHOT_API_KEY',
  custom: 'SKY_CUSTOM_API_KEY',
};

/** Mask a secret for display: sk-…xxxx */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function readAllSecrets(): Record<string, string> {
  const path = secretsPath();
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function resolveSource(
  name: string,
  cfg: ProviderConfig | undefined,
  env: NodeJS.ProcessEnv,
): KeyRow['source'] {
  if (isKeylessProvider(name)) return 'keyless';
  if (cfg?.apiKey) return 'config';
  if (cfg?.apiKeyEnv && env[cfg.apiKeyEnv]) return 'env';
  if (readSecret(name)) return 'secrets';
  const envName = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (env[`SKY_PROVIDERS_${envName}_API_KEY`]) return 'env';
  const well = WELL_KNOWN[name];
  if (well && env[well]) return 'env';
  return 'none';
}

/** Snapshot of key status for built-ins + configured customs. */
export function listKeyRows(
  providers: Record<string, ProviderConfig | undefined> = {},
  env: NodeJS.ProcessEnv = process.env,
  activeProvider?: string,
): KeyRow[] {
  const builtins = providerNameSchema.options;
  const names = new Set<string>([...builtins, ...Object.keys(providers)]);
  if (activeProvider) names.add(activeProvider);
  const secrets = readAllSecrets();
  const rows: KeyRow[] = [];
  for (const name of [...names].sort()) {
    if (name === 'free') continue;
    const cfg = providers[name];
    const source = resolveSource(name, cfg, env);
    if (isKeylessProvider(name)) {
      rows.push({ provider: name, status: 'keyless', source: 'keyless' });
      continue;
    }
    const ready = hasApiKey(name, cfg, env);
    const raw = secrets[name] ?? cfg?.apiKey;
    rows.push({
      provider: name,
      status: ready ? 'ready' : 'missing',
      source,
      masked: raw ? maskSecret(raw) : undefined,
    });
  }
  return rows;
}

/** Render a compact dashboard for the TUI / `sky keys`. */
export function formatKeysDashboard(
  providers: Record<string, ProviderConfig | undefined> = {},
  env: NodeJS.ProcessEnv = process.env,
  activeProvider?: string,
): string {
  const rows = listKeyRows(providers, env, activeProvider);
  const lines = [
    'API keys dashboard  (~/.sky/secrets.json)',
    '────────────────────────────────────────',
  ];
  for (const row of rows) {
    const mark = row.status === 'ready' ? '✓' : row.status === 'keyless' ? '○' : '·';
    const active = row.provider === activeProvider ? ' ← active' : '';
    const detail =
      row.status === 'keyless'
        ? 'no key needed'
        : row.status === 'ready'
          ? `${row.source}${row.masked ? ` ${row.masked}` : ''}`
          : 'missing — /keys set <provider> <key>';
    lines.push(`${mark} ${row.provider.padEnd(14)} ${detail}${active}`);
  }
  lines.push(
    '',
    'Commands:',
    '  /keys                      show this dashboard',
    '  /keys set <provider> <key> save key (secrets file)',
    '  /keys clear <provider>     remove stored key',
    '  /keys use <provider>       switch provider (+ model defaults)',
    '  /provider free             keyless OpenCode free models',
  );
  return lines.join('\n');
}

export function keysHelpForProvider(name: string): string {
  return providerAuthSetupCard(name);
}
