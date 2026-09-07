// Logger utility with comprehensive logging patterns.
//
// SECURITY: all context objects are passed through `redact()` before being
// stringified or buffered. `redact()` masks values whose keys look like
// secrets (private keys, API keys, tokens, secrets, passwords, salts) so a
// stray context object can never leak credentials into console output or
// the in-memory log buffer. The buffer is also capped (`MAX_LOG_ENTRIES`)
// so long-running processes cannot accumulate unbounded memory.

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any> | undefined;
  error?: Error | undefined;
}

/** Keys (case-insensitive, substring match) treated as secrets. */
const SENSITIVE_KEY_PATTERNS = [
  'privatekey',
  'private_key',
  'apikey',
  'api_key',
  'secret',
  'token',
  'password',
  'passphrase',
  'salt',
  'signature',
  'auth',
];

/** Mask applied to redacted values (keeps length hint without content). */
function maskValue(value: unknown): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (!str) return '[REDACTED]';
  return `[REDACTED len:${str.length}]`;
}

/** True when a context key looks secret-like. */
function isSensitiveKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lowered.includes(p));
}

/**
 * Recursively redact secret-looking values from an arbitrary object.
 * Cycles are guarded with a seen-WeakSet; depth is capped defensively.
 */
export function redact(value: unknown, depth: number = 0, seen: Set<object> = new Set()): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((v) => redact(v, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? maskValue(v) : redact(v, depth + 1, seen);
  }
  return out;
}

/** Max entries kept in the in-memory log buffer (oldest dropped). */
const MAX_LOG_ENTRIES = 1000;

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warning(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARNING, message, context);
  }

  public error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.logLevel) {
      return;
    }

    // SECURITY: redact before buffering or printing.
    const safeContext = context
      ? (redact(context) as Record<string, any>)
      : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: safeContext,
      error,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }

    // Console output with structured logging (redacted)
    const contextStr = safeContext ? ` ${JSON.stringify(safeContext, null, 2)}` : '';

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[DEBUG] ${message}${contextStr}`);
        break;
      case LogLevel.INFO:
        console.log(`[INFO] ${message}${contextStr}`);
        break;
      case LogLevel.WARNING:
        console.warn(`[WARNING] ${message}${contextStr}`);
        break;
      case LogLevel.ERROR:
        console.error(`[ERROR] ${message}${contextStr}`);
        if (error) {
          console.error('Stack trace:', error.stack);
        }
        break;
    }
  }


  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  // Standard logging methods (all redact automatically via log())
  public logApiCall(method: string, url: string, params?: any): void {
    this.debug(`API Call: ${method} ${url}`, { params });
  }

  public logApiResponse(method: string, url: string, status: number, responseTime: number): void {
    this.debug(`API Response: ${method} ${url} - ${status} (${responseTime}ms)`);
  }

  public logTransaction(txType: string, txInfo: any): void {
    this.debug(`Transaction: ${txType}`, { txInfo });
  }

  public logNonce(apiKeyIndex: number, nonce: number): void {
    this.debug(`Nonce: API Key ${apiKeyIndex}, Nonce ${nonce}`);
  }

  public logSignerError(operation: string, error: Error): void {
    this.error(`Signer Error: ${operation}`, error);
  }
}

// Global logger instance
export const logger = Logger.getInstance();