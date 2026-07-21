/**
 * Daemon process control: register URL/PID/token, start/stop/status
 * (OpenCode-style detached background server).
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { daemonStatePath, daemonPidPath } from '../config/paths.js';

export interface DaemonState {
  url: string;
  pid: number;
  token: string;
  version: string;
  startedAt: string;
  host: string;
  port: number;
}

const VERSION = '1.1.0';

export function readDaemonState(path = daemonStatePath()): DaemonState | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DaemonState;
  } catch {
    return null;
  }
}

export function writeDaemonState(state: DaemonState, path = daemonStatePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
}

export function clearDaemonState(path = daemonStatePath()): void {
  if (existsSync(path)) unlinkSync(path);
}

/** True when a process with this PID is still alive. */
export function isPidAlive(pid: number): boolean {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire exclusive daemon PID lock under `~/.sky/daemon.pid`.
 * Returns false when another healthy daemon still holds the lock.
 */
export function acquireDaemonLock(pid = process.pid): boolean {
  const path = daemonPidPath();
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const raw = readFileSync(path, 'utf8').trim();
    const old = Number.parseInt(raw, 10);
    if (isPidAlive(old) && old !== pid) return false;
  }
  writeFileSync(path, `${pid}\n`, { encoding: 'utf8', mode: 0o600 });
  return true;
}

export function releaseDaemonLock(pid = process.pid): void {
  const path = daemonPidPath();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, 'utf8').trim();
    const owner = Number.parseInt(raw, 10);
    if (owner === pid || !isPidAlive(owner)) unlinkSync(path);
  } catch {
    /* best-effort */
  }
}

export function readDaemonPid(): number | null {
  const path = daemonPidPath();
  if (!existsSync(path)) return null;
  const n = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export async function isDaemonHealthy(state: DaemonState): Promise<boolean> {
  try {
    const res = await fetch(`${state.url}/health`, {
      headers: { 'X-Sky-Token': state.token },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; version?: string };
    return Boolean(body.ok);
  } catch {
    return false;
  }
}

/** Stop a registered daemon (SIGTERM then SIGKILL). */
export async function stopDaemon(): Promise<boolean> {
  const state = readDaemonState();
  const pid = state?.pid ?? readDaemonPid();
  if (!pid) {
    clearDaemonState();
    releaseDaemonLock();
    return false;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    clearDaemonState();
    releaseDaemonLock(pid);
    return false;
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      process.kill(pid, 0);
    } catch {
      clearDaemonState();
      releaseDaemonLock(pid);
      return true;
    }
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* gone */
  }
  clearDaemonState();
  releaseDaemonLock(pid);
  return true;
}

/**
 * Spawn `sky serve --register` detached. Polls until health OK or timeout.
 */
export async function startDetachedDaemon(options: {
  port?: number;
  yolo?: boolean;
  cwd?: string;
}): Promise<DaemonState> {
  const existing = readDaemonState();
  if (existing && (await isDaemonHealthy(existing))) return existing;
  if (existing) await stopDaemon();

  // Stale PID lock without state → clear so serve can register.
  const locked = readDaemonPid();
  if (locked && !isPidAlive(locked)) releaseDaemonLock(locked);

  const reexec = reexecServeArgs({
    port: options.port,
    yolo: options.yolo,
    cwd: options.cwd,
  });
  const child = spawn(reexec.execPath, reexec.args, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const state = readDaemonState();
    if (state && (await isDaemonHealthy(state))) return state;
  }
  throw new Error('daemon failed to become healthy within timeout');
}

/** Build argv to re-exec this CLI as `serve --register`. */
export function reexecServeArgs(options: {
  port?: number;
  yolo?: boolean;
  cwd?: string;
}): { execPath: string; args: string[] } {
  const execPath = process.execPath;
  const argv = process.argv.slice(1);
  // Drop trailing user args after the node entry; keep loaders + entry script.
  // Examples:
  //   dist/cli/main.js daemon start  → entry = dist/cli/main.js
  //   .../tsx src/cli/main.ts daemon → entry = tsx + src/cli/main.ts
  const out: string[] = [];
  let i = 0;
  if (argv[0] && /tsx/.test(argv[0])) {
    out.push(argv[0]!);
    i = 1;
  }
  if (argv[i]) {
    out.push(argv[i]!);
    i += 1;
  }
  out.push('serve', '--register');
  if (options.port) out.push('--port', String(options.port));
  if (options.yolo) out.push('--yolo');
  if (options.cwd) out.push('--cwd', options.cwd);
  return { execPath, args: out };
}

export function daemonStateTemplate(partial: Omit<DaemonState, 'version' | 'startedAt'>): DaemonState {
  return {
    ...partial,
    version: VERSION,
    startedAt: new Date().toISOString(),
  };
}
