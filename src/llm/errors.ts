import { ErrorCode, SkyError } from '../errors/index.js';

/** Map a provider HTTP status (and message) onto the 5xxx error catalog (§B.5). */
export function providerErrorFromStatus(status: number | undefined, detail: string, cause?: unknown): SkyError {
  const lower = detail.toLowerCase();
  // OpenCode / free-tier proxies often wrap upstream outages as HTTP 400.
  const upstreamFlake =
    lower.includes('upstream request failed') ||
    lower.includes('upstream error') ||
    lower.includes('provider (console)');

  switch (status) {
    case 429:
      return new SkyError(ErrorCode.ProviderRateLimited, {}, cause);
    case 503:
      return new SkyError(ErrorCode.ProviderUnavailable, {}, cause);
    case 400:
      if (upstreamFlake) {
        return new SkyError(
          ErrorCode.ProviderRequestFailed,
          {
            detail:
              `${detail} — free/upstream model blip. Retry the message, /new for a clean session, or /provider free with another model.`,
          },
          cause,
        );
      }
      return new SkyError(
        ErrorCode.ProviderBadRequest,
        {
          detail: `${detail} — try /compact or /new if the session is huge; forge listing needs the \`forge\` tool (not shell).`,
        },
        cause,
      );
    case 401:
      return new SkyError(
        ErrorCode.ProviderAuthFailed,
        {
          detail:
            ' — for OpenCode free models: `/keys clear opencode` (stale key overrides guest token), or get a Zen key at https://opencode.ai/auth',
        },
        cause,
      );
    case 403:
      return new SkyError(ErrorCode.ProviderForbidden, { detail }, cause);
    case 451:
      return new SkyError(ErrorCode.ProviderContentFilter, {}, cause);
    default:
      if (status && status >= 500) return new SkyError(ErrorCode.ProviderUnavailable, {}, cause);
      return new SkyError(ErrorCode.ProviderRequestFailed, { detail }, cause);
  }
}
