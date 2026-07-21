import { describe, it, expect } from 'vitest';
import { ErrorCode, ERROR_CATALOG, SkyError } from '../src/errors/index.js';

describe('error catalog', () => {
  it('has an entry for every ErrorCode', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ERROR_CATALOG[code], `missing catalog entry for ${code}`).toBeDefined();
    }
  });

  it('renders message templates from context', () => {
    const err = new SkyError(ErrorCode.NoApiKey, { name: 'openai', hint: '' });
    expect(err.message).toBe('No API key configured for provider openai.');
    expect(err.code).toBe('SKY-E-1002');
    expect(err.exitCode).toBe(64);
    expect(err.retryable).toBe(false);
  });

  it('omits unset placeholders', () => {
    const err = new SkyError(ErrorCode.UnknownModel, { name: 'x' });
    expect(err.message).toBe('Unknown model: x for provider ');
  });

  it('marks provider rate-limit as retryable with exit 66', () => {
    const err = new SkyError(ErrorCode.ProviderRateLimited);
    expect(err.retryable).toBe(true);
    expect(err.exitCode).toBe(66);
  });

  it('SkyError.from passes through SkyError and wraps others', () => {
    const original = new SkyError(ErrorCode.ShellDenied, { command: 'rm -rf /' });
    expect(SkyError.from(original)).toBe(original);
    const wrapped = SkyError.from(new Error('boom'));
    expect(wrapped.code).toBe(ErrorCode.InternalError);
    expect(wrapped.message).toContain('boom');
  });

  it('produces a bracketed user message', () => {
    const err = new SkyError(ErrorCode.ProviderAuthFailed);
    expect(err.toUserMessage()).toBe('[SKY-E-5011] Provider authentication failed (401)');
  });

  it('includes OpenCode auth hint on 401 detail', () => {
    const err = new SkyError(ErrorCode.ProviderAuthFailed, {
      detail: ' — clear stale key with /keys clear opencode',
    });
    expect(err.toUserMessage()).toContain('/keys clear opencode');
  });
});
