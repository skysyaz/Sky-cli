import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  logger?: Logger;
  /** Injectable sleep so tests need not wait real time. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a provider call with exponential backoff and jitter (§8.7). Only
 * retryable {@link SkyError}s (429, 503, timeouts, transient network) are
 * retried; everything else fails fast. Defaults: 4 retries, 1s base, 30s max.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 4;
  const baseDelay = options.baseDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 30_000;
  const logger = options.logger ?? nullLogger;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const skyError = SkyError.from(error, ErrorCode.ProviderRequestFailed);
      if (!skyError.retryable || attempt === retries) throw skyError;

      const backoff = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = Math.random() * backoff * 0.25;
      const delay = Math.round(backoff + jitter);
      logger.warn('provider.retry', { attempt: attempt + 1, code: skyError.code, delayMs: delay });
      await sleep(delay);
    }
  }
  throw SkyError.from(lastError, ErrorCode.ProviderRequestFailed);
}
