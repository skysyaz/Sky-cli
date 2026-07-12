import { ErrorCode, SkyError } from '../errors/index.js';

/** Map a provider HTTP status (and message) onto the 5xxx error catalog (§B.5). */
export function providerErrorFromStatus(status: number | undefined, detail: string, cause?: unknown): SkyError {
  switch (status) {
    case 429:
      return new SkyError(ErrorCode.ProviderRateLimited, {}, cause);
    case 503:
      return new SkyError(ErrorCode.ProviderUnavailable, {}, cause);
    case 400:
      return new SkyError(ErrorCode.ProviderBadRequest, { detail }, cause);
    case 401:
      return new SkyError(ErrorCode.ProviderAuthFailed, {}, cause);
    case 403:
      return new SkyError(ErrorCode.ProviderForbidden, { detail }, cause);
    case 451:
      return new SkyError(ErrorCode.ProviderContentFilter, {}, cause);
    default:
      if (status && status >= 500) return new SkyError(ErrorCode.ProviderUnavailable, {}, cause);
      return new SkyError(ErrorCode.ProviderRequestFailed, { detail }, cause);
  }
}
