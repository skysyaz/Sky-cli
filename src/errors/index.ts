/**
 * The `errors/` module — the root of the dependency graph (§2.3). It depends on
 * nothing and is depended on by every other module.
 */
export { ErrorCode, ERROR_CATALOG, type ErrorMeta } from './codes.js';
export { SkyError, type ErrorContext } from './SkyError.js';
