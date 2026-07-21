/**
 * Forge HTTP API helpers — list/whoami against GitHub or Gitea using the
 * stored PAT. Separated from git HTTPS auth so the agent can browse remotes
 * without shelling out to `gh`.
 */

import { readForgeToken, normalizeForgeBaseUrl, listForgeRows } from './index.js';
import type { ForgeRemote, SkyConfig } from '../config/schema.js';

export interface ResolvedForge {
  id: string;
  remote: ForgeRemote;
  token: string;
}

/** Pick a forge by id, or default, or the first that has a token. */
export function resolveForge(config: SkyConfig, forgeId?: string): ResolvedForge | null {
  const { remotes, default: def } = config.forge;
  const tryId = (id: string | undefined): ResolvedForge | null => {
    if (!id || !remotes[id]) return null;
    const token = readForgeToken(id);
    if (!token) return null;
    return { id, remote: remotes[id]!, token };
  };

  if (forgeId) return tryId(forgeId);
  const fromDefault = tryId(def);
  if (fromDefault) return fromDefault;
  for (const id of Object.keys(remotes)) {
    const hit = tryId(id);
    if (hit) return hit;
  }
  return null;
}

/** API root for REST calls (GitHub → api.github.com, Gitea → {base}/api/v1). */
export function forgeApiBase(remote: ForgeRemote): string {
  const base = normalizeForgeBaseUrl(remote.baseUrl);
  if (remote.type === 'github') {
    try {
      const host = new URL(base).host.toLowerCase();
      if (host === 'github.com' || host === 'www.github.com') return 'https://api.github.com';
      // GitHub Enterprise
      return `${base}/api/v3`;
    } catch {
      return 'https://api.github.com';
    }
  }
  return `${base}/api/v1`;
}

export function forgeAuthHeaders(remote: ForgeRemote, token: string): Record<string, string> {
  if (remote.type === 'github') {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Sky-CLI',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }
  return {
    Authorization: `token ${token}`,
    Accept: 'application/json',
    'User-Agent': 'Sky-CLI',
  };
}

export interface ForgeRepoSummary {
  fullName: string;
  private: boolean;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string;
}

function mapGithubRepo(r: Record<string, unknown>): ForgeRepoSummary {
  return {
    fullName: String(r.full_name ?? r.name ?? ''),
    private: Boolean(r.private),
    description: String(r.description ?? ''),
    htmlUrl: String(r.html_url ?? r.clone_url ?? ''),
    defaultBranch: String(r.default_branch ?? 'main'),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function mapGiteaRepo(r: Record<string, unknown>): ForgeRepoSummary {
  const owner = (r.owner as { login?: string } | undefined)?.login;
  const name = String(r.name ?? '');
  return {
    fullName: owner ? `${owner}/${name}` : name,
    private: Boolean(r.private),
    description: String(r.description ?? ''),
    htmlUrl: String(r.html_url ?? r.clone_url ?? ''),
    defaultBranch: String(r.default_branch ?? 'main'),
    updatedAt: String(r.updated_at ?? ''),
  };
}

async function forgeFetch(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const res = await fetch(url, { headers, signal });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { ok: res.ok, status: res.status, body, text };
}

/** Authenticated user login for the forge. */
export async function forgeWhoami(
  forge: ResolvedForge,
  signal?: AbortSignal,
): Promise<{ login: string; name?: string; htmlUrl?: string }> {
  const api = forgeApiBase(forge.remote);
  const headers = forgeAuthHeaders(forge.remote, forge.token);
  const path = forge.remote.type === 'github' ? '/user' : '/user';
  const res = await forgeFetch(api + path, headers, signal);
  if (!res.ok) {
    throw new Error(`forge whoami failed (${res.status}): ${res.text.slice(0, 200)}`);
  }
  const u = res.body as Record<string, unknown>;
  return {
    login: String(u.login ?? u.username ?? ''),
    name: u.name ? String(u.name) : undefined,
    htmlUrl: u.html_url ? String(u.html_url) : undefined,
  };
}

/** List repositories visible to the authenticated user. */
export async function forgeListRepos(
  forge: ResolvedForge,
  options: { limit?: number; signal?: AbortSignal } = {},
): Promise<ForgeRepoSummary[]> {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const api = forgeApiBase(forge.remote);
  const headers = forgeAuthHeaders(forge.remote, forge.token);
  const url =
    forge.remote.type === 'github'
      ? `${api}/user/repos?per_page=${limit}&sort=updated&affiliation=owner,collaborator,organization_member`
      : `${api}/user/repos?limit=${limit}`;
  const res = await forgeFetch(url, headers, options.signal);
  if (!res.ok) {
    throw new Error(`forge repos failed (${res.status}): ${res.text.slice(0, 240)}`);
  }
  const list = Array.isArray(res.body) ? res.body : [];
  const mapper = forge.remote.type === 'github' ? mapGithubRepo : mapGiteaRepo;
  return list.map((r) => mapper(r as Record<string, unknown>));
}

/** Fetch one repository by owner/name. */
export async function forgeGetRepo(
  forge: ResolvedForge,
  ownerRepo: string,
  signal?: AbortSignal,
): Promise<ForgeRepoSummary> {
  const cleaned = ownerRepo.replace(/^\/+/, '').replace(/\.git$/, '');
  const api = forgeApiBase(forge.remote);
  const headers = forgeAuthHeaders(forge.remote, forge.token);
  const url =
    forge.remote.type === 'github'
      ? `${api}/repos/${cleaned}`
      : `${api}/repos/${cleaned}`;
  const res = await forgeFetch(url, headers, signal);
  if (!res.ok) {
    throw new Error(`forge repo failed (${res.status}): ${res.text.slice(0, 240)}`);
  }
  const mapper = forge.remote.type === 'github' ? mapGithubRepo : mapGiteaRepo;
  return mapper(res.body as Record<string, unknown>);
}

/** Human summary of configured forges (no tokens). */
export function formatForgeStatus(config: SkyConfig): string {
  const rows = listForgeRows(config);
  if (rows.length === 0) {
    return (
      'No forges connected. Open `sky dashboard` → Source Control → Connect GitHub/Gitea,\n' +
      'or: sky forge add github --type github --url https://github.com --token <pat>'
    );
  }
  return rows
    .map((r) => {
      const star = r.isDefault ? ' ★' : '';
      const tok = r.hasToken ? 'token:set' : 'token:MISSING';
      const user = r.username ? ` user=${r.username}` : '';
      return `${r.id}${star}\t${r.type}\t${r.baseUrl}${user}\t${tok}`;
    })
    .join('\n');
}
