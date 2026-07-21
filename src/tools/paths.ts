import { resolve, relative, isAbsolute } from 'node:path';
import { ErrorCode, SkyError } from '../errors/index.js';

/** Resolve a possibly-relative path against the session cwd. */
export function resolveInCwd(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** True if `path` is inside `cwd` (used to enforce the write sandbox, §6.3). */
export function isInsideCwd(cwd: string, path: string): boolean {
  const rel = relative(resolve(cwd), resolveInCwd(cwd, path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Throw (or return a structured failure path) when a tool tries to leave cwd
 * without an explicit allow-outside flag. Shared by read/write/edit/search.
 */
export function assertInsideCwd(cwd: string, path: string, allowOutside = false): void {
  if (allowOutside) return;
  const abs = resolveInCwd(cwd, path);
  if (!isInsideCwd(cwd, abs)) {
    throw new SkyError(ErrorCode.WritePathOutsideCwd, { path });
  }
}

/** Whether a path escapes the working directory (absolute or `..`). */
export function pathEscapesCwd(cwd: string, path: string | undefined): boolean {
  if (path === undefined || path === '' || path === '.') return false;
  return !isInsideCwd(cwd, resolveInCwd(cwd, path));
}
