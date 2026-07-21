import { ErrorCode, ERROR_CATALOG, type ErrorMeta } from './codes.js';

/** Values that can be interpolated into an error message template. */
export type ErrorContext = Record<string, string | number | boolean | undefined>;

/**
 * The single error type used across Sky. It carries a stable {@link ErrorCode},
 * a rendered human-readable message, an optional cause, and a `retryable` flag
 * so that the agent loop, the TUI, and the CLI exit-code handler can all switch
 * on the same discriminant (§11.1).
 *
 * @example
 * ```ts
 * throw new SkyError(ErrorCode.NoApiKey, { name: 'openai' });
 * ```
 */
export class SkyError extends Error {
  /** The stable code, e.g. `SKY-E-1002`. */
  readonly code: ErrorCode;
  /** Whether the operation that produced this error may be retried. */
  readonly retryable: boolean;
  /** Process exit code to use if this error terminates the process. */
  readonly exitCode: number;
  /** The originating error, if this wraps a lower-level failure. */
  readonly cause?: unknown;
  /** The interpolation context used to render the message. */
  readonly context: ErrorContext;

  constructor(code: ErrorCode, context: ErrorContext = {}, cause?: unknown) {
    const meta: ErrorMeta = ERROR_CATALOG[code];
    super(SkyError.render(meta.message, context));
    this.name = 'SkyError';
    this.code = code;
    this.retryable = meta.retryable;
    this.exitCode = meta.exitCode;
    this.context = context;
    if (cause !== undefined) this.cause = cause;
    // Restore the prototype chain when compiled to older targets.
    Object.setPrototypeOf(this, SkyError.prototype);
  }

  /** Fill `{placeholders}` in a template from the supplied context. */
  static render(template: string, context: ErrorContext): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = context[key];
      // Optional placeholders (e.g. auth hint) omit cleanly when unset.
      return value === undefined || value === null ? '' : String(value);
    });
  }

  /** Type guard for narrowing an unknown thrown value to a {@link SkyError}. */
  static is(value: unknown): value is SkyError {
    return value instanceof SkyError;
  }

  /**
   * Wrap an arbitrary thrown value in a SkyError. If it is already a SkyError it
   * is returned unchanged; otherwise it becomes an {@link ErrorCode.InternalError}.
   */
  static from(value: unknown, fallback: ErrorCode = ErrorCode.InternalError): SkyError {
    if (SkyError.is(value)) return value;
    const detail = value instanceof Error ? value.message : String(value);
    return new SkyError(fallback, { detail }, value);
  }

  /** A structured, log-friendly representation. */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      exitCode: this.exitCode,
    };
  }

  /**
   * A user-facing message in the "what / why / what to do" style of §11.8,
   * prefixed with the bracketed code for bug reports.
   */
  toUserMessage(): string {
    return `[${this.code}] ${this.message}`;
  }
}
