import { mkdirSync, createWriteStream, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The `logging/` module (§2.4.8). Structured JSON logging with secret
 * redaction, injected into every other module via the {@link Logger} interface.
 *
 * The implementation is a thin, dependency-light structured logger. In the full
 * build this is backed by `pino`; here we keep a compatible shape so the rest of
 * the codebase depends only on the interface, never on the concrete logger.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/** Structured payload attached to a log line. */
export type LogData = Record<string, unknown>;

/**
 * The logging surface every module receives. Methods take a message and an
 * optional structured payload (§11.5). `child()` returns a logger with bound
 * context (e.g. a module name or session id) merged into every line.
 */
export interface Logger {
  trace(msg: string, data?: LogData): void;
  debug(msg: string, data?: LogData): void;
  info(msg: string, data?: LogData): void;
  warn(msg: string, data?: LogData): void;
  error(msg: string, data?: LogData): void;
  fatal(msg: string, data?: LogData): void;
  child(bindings: LogData): Logger;
  readonly level: LogLevel;
}

/** Patterns matched (case-insensitively) against keys and values for redaction. */
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|authorization|bearer)/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/g, // OpenAI-style keys
  /sk-ant-[A-Za-z0-9-]{16,}/g, // Anthropic-style keys
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi, // bearer tokens
];

const REDACTED = '[redacted]';

/** Redact known secret shapes from a structured payload before it is written. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** File sink path (`~/.sky/logs/sky.log`). Omit to disable the file sink. */
  file?: string;
  /** When true, also write to stderr (the `--verbose` behaviour). */
  stderr?: boolean;
  version?: string;
}

class StructuredLogger implements Logger {
  readonly level: LogLevel;
  private readonly bindings: LogData;
  private readonly stream?: WriteStream;
  private readonly toStderr: boolean;
  private readonly version: string;

  constructor(options: LoggerOptions, bindings: LogData = {}, stream?: WriteStream) {
    this.level = options.level ?? 'info';
    this.bindings = bindings;
    this.toStderr = options.stderr ?? false;
    this.version = options.version ?? '1.0.0';
    if (stream) {
      this.stream = stream;
    } else if (options.file) {
      try {
        mkdirSync(dirname(options.file), { recursive: true });
        this.stream = createWriteStream(options.file, { flags: 'a' });
      } catch {
        // A broken file sink must never crash the app; fall back to stderr only.
        this.stream = undefined;
      }
    }
  }

  private write(level: LogLevel, msg: string, data?: LogData): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const line = {
      level,
      time: new Date().toISOString(),
      pid: process.pid,
      version: this.version,
      ...this.bindings,
      msg,
      ...(data ? { data: redact(data) } : {}),
    };
    const serialized = JSON.stringify(line);
    this.stream?.write(serialized + '\n');
    // Only write to stderr when explicitly enabled (--verbose) or on a fatal
    // error. Forcing warn/error to stderr corrupts the interactive TUI; those
    // still go to the log file, and user-facing errors are surfaced by the CLI
    // command layer and the TUI itself.
    if (this.toStderr || level === 'fatal') {
      process.stderr.write(serialized + '\n');
    }
  }

  trace(msg: string, data?: LogData): void {
    this.write('trace', msg, data);
  }
  debug(msg: string, data?: LogData): void {
    this.write('debug', msg, data);
  }
  info(msg: string, data?: LogData): void {
    this.write('info', msg, data);
  }
  warn(msg: string, data?: LogData): void {
    this.write('warn', msg, data);
  }
  error(msg: string, data?: LogData): void {
    this.write('error', msg, data);
  }
  fatal(msg: string, data?: LogData): void {
    this.write('fatal', msg, data);
  }

  child(bindings: LogData): Logger {
    return new StructuredLogger(
      { level: this.level, stderr: this.toStderr, version: this.version },
      { ...this.bindings, ...bindings },
      this.stream,
    );
  }
}

/** Create the root logger. Call once at startup and inject the result. */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new StructuredLogger(options);
}

/** A logger that swallows everything — handy in tests and library embedding. */
export const nullLogger: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return nullLogger;
  },
  level: 'error',
};
