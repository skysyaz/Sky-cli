import { resolve, relative, isAbsolute } from 'node:path';

/** Resolve a possibly-relative path against the session cwd. */
export function resolveInCwd(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

/** True if `path` is inside `cwd` (used to enforce the write sandbox, §6.3). */
export function isInsideCwd(cwd: string, path: string): boolean {
  const rel = relative(resolve(cwd), resolveInCwd(cwd, path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
