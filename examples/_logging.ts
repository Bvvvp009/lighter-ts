/**
 * Opt-in file logging for the MM runners.
 *
 * File logs are OFF by default — the Logger already keeps a capped,
 * redacted in-memory buffer, and an always-on file writer litters the
 * working directory on every run. Enable either way:
 *
 *   MM_LOG_FILE=1            logs/mm-<strategy>-<timestamp>.log
 *   MM_LOG_FILE=path/to.log  exact file
 *
 * When enabled, three sinks are wired:
 *  1. Logger entries (info+)  — the SDK's own logs, already redacted.
 *  2. Dashboard events        — fills, cancels, config changes, errors.
 *  3. console.log intercept   — the runners' own [INIT]/[STATUS] lines.
 *
 * All writes go to `logs/` (gitignored) and are flushed with
 * `fs.createWriteStream` autos, so a crash loses at most the OS pipe buffer.
 *
 * SECURITY: the Logger redacts secret-looking keys before they reach any
 * sink (see src/utils/logger.ts). The console intercept writes what
 * console.log would have printed anyway — no new surface.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Resolve the log destination, or null when file logging is off. */
export function resolveLogFile(argv0: string): string | null {
  const raw = process.env.MM_LOG_FILE;
  if (!raw || raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'off') {
    return null;
  }
  if (raw === '1' || raw.toLowerCase() === 'on' || raw.toLowerCase() === 'true') {
    const logsDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safe = argv0.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'mm';
    return path.join(logsDir, `${safe}-${stamp}.log`);
  }
  const resolved = path.resolve(raw);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

/** Append a line to the log file, swallowing I/O errors (logging must never kill a run). */
function appendLine(stream: fs.WriteStream, line: string): void {
  stream.write(line.endsWith('\n') ? line : line + '\n');
}

export interface FileLogging {
  /** The open stream, or null when disabled. */
  stream: fs.WriteStream | null;
  /** Absolute path of the log file (for the startup banner). */
  path: string | null;
  /** Push a dashboard event into the file. */
  logEvent: (event: { timestamp: number; venue?: string; type: string; message: string }) => void;
  /** Stop intercepting console.log and close the stream. */
  close: () => void;
}

/**
 * Wire the file logging sinks. Call once, early in main(); the returned
 * `close()` belongs in the shutdown path.
 */
export function setupFileLogging(strategyLabel: string): FileLogging {
  const file = resolveLogFile(strategyLabel);
  if (!file) {
    return { stream: null, path: null, logEvent: () => {}, close: () => {} };
  }

  const stream = fs.createWriteStream(file, { flags: 'a' });
  stream.write(`\n===== ${strategyLabel} — ${new Date().toISOString()} =====\n`);

  // 1. SDK Logger entries (already redacted by the Logger itself).
  // Loaded lazily so examples that don't use the Logger stay clean.
  let logHooked = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { logger, LogLevel } = require('../src/utils/logger');
    const original = logger.log.bind(logger);
    (logger as any).log = (level: number, message: string, context?: unknown, error?: Error) => {
      original(level, message, context, error);
      if (level >= LogLevel.INFO) {
        const names = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
        const ctx = context ? ` ${JSON.stringify(context)}` : '';
        appendLine(stream, `[${names[level] ?? level}] ${message}${ctx}`);
      }
    };
    logHooked = true;
  } catch {
    // Logger unavailable — the other sinks still work.
  }

  // 2. console.log intercept — capture the runner's own banner lines.
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    origLog(...args);
    try {
      appendLine(stream, args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    } catch {}
  };
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origErr(...args);
    try {
      appendLine(stream, `[STDERR] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
    } catch {}
  };

  const logEvent = (event: { timestamp: number; venue?: string; type: string; message: string }): void => {
    const time = new Date(event.timestamp || Date.now()).toISOString();
    const venue = event.venue ? `[${event.venue}] ` : '';
    appendLine(stream, `[${time}] ${venue}${event.type.toUpperCase()}: ${event.message}`);
  };

  const close = (): void => {
    // Only the console hooks are unhooked here; the Logger hook is kept to
    // avoid racing in-flight writes. close() ends the stream (flush).
    console.log = origLog;
    console.error = origErr;
    void logHooked;
    stream.end();
  };

  return { stream, path: file, logEvent, close };
}