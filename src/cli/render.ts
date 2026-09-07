/**
 * Zero-dependency ANSI terminal render helpers for the CLI dashboard.
 * Uses only Node.js built-in `process.stdout` and ANSI escape sequences.
 */

// ============================================================================
// Screen control
// ============================================================================

export const ANSI = {
  ENTER_ALT: '\x1b[?1049h',
  EXIT_ALT: '\x1b[?1049l',
  CLEAR: '\x1b[2J\x1b[H',
  CLEAR_LINE: '\x1b[2K',
  CLEAR_LINE_RIGHT: '\x1b[0K',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  // 16-color foreground
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  // Bright
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_CYAN: '\x1b[96m',
  BRIGHT_WHITE: '\x1b[97m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_BLUE: '\x1b[94m',
  // Backgrounds (for highlight bars)
  BG_GREEN: '\x1b[42m',
  BG_RED: '\x1b[41m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
  BG_CYAN: '\x1b[46m',
  BG_MAGENTA: '\x1b[45m',
  BG_GRAY: '\x1b[100m',
  INVERSE: '\x1b[7m',
};

/** Strip ANSI escape sequences — for measuring visible width. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

/** Move cursor to row (1-based), col (1-based). */
export function cursorTo(row: number, col: number = 1): string {
  return `\x1b[${row};${col}H`;
}

// ============================================================================
// Formatting helpers
// ============================================================================

/** Visible (ANSI-stripped) length of text. */
export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function padRight(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  return text + ' '.repeat(width - len);
}

export function padLeft(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  return ' '.repeat(width - len) + text;
}

export function padCenter(text: string, width: number): string {
  const len = visibleLength(text);
  if (len >= width) return text;
  const totalPad = width - len;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

export function truncate(text: string, width: number): string {
  const len = visibleLength(text);
  if (len <= width) return text;
  if (width <= 3) return stripAnsi(text).slice(0, width);
  return stripAnsi(text).slice(0, width - 3) + '...';
}

export function truncateMiddle(text: string, width: number): string {
  const len = visibleLength(text);
  if (len <= width) return text;
  if (width <= 3) return stripAnsi(text).slice(0, width);
  const keepStart = Math.ceil((width - 3) / 2);
  const keepEnd = Math.floor((width - 3) / 2);
  const plain = stripAnsi(text);
  return plain.slice(0, keepStart) + '...' + plain.slice(plain.length - keepEnd);
}

// ============================================================================
// Number formatting
// ============================================================================

export function formatUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPnl(n: number): string {
  const text = formatUsd(n);
  const color = n > 0 ? ANSI.BRIGHT_GREEN : n < 0 ? ANSI.BRIGHT_RED : ANSI.WHITE;
  return `${color}${text}${ANSI.RESET}`;
}

export function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatBase(n: number, symbol: string = ''): string {
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.floor(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m ${remS}s`;
}

export function formatTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function formatTimeHMS(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ============================================================================
// Box drawing
// ============================================================================

export const BOX = {
  TL: '\u250c', // ┌
  TR: '\u2510', // ┐
  BL: '\u2514', // └
  BR: '\u2518', // ┘
  H: '\u2500',  // ─
  V: '\u2502',  // │
  T: '\u252c',  // ┬
  B: '\u2534',  // ┴
  L: '\u251c',  // ├
  R: '\u2524',  // ┤
  CROSS: '\u253c', // ┼
};

/** Draw a horizontal line of width `w` using box characters. */
export function hLine(w: number, left: string = BOX.L, right: string = BOX.R, fill: string = BOX.H): string {
  return left + fill.repeat(Math.max(0, w - 2)) + right;
}

/** Draw a top border. */
export function topBorder(w: number): string {
  return BOX.TL + BOX.H.repeat(Math.max(0, w - 2)) + BOX.TR;
}

/** Draw a bottom border. */
export function bottomBorder(w: number): string {
  return BOX.BL + BOX.H.repeat(Math.max(0, w - 2)) + BOX.BR;
}

// ============================================================================
// Status indicator
// ============================================================================

export function statusDot(connected: boolean): string {
  return connected
    ? `${ANSI.BRIGHT_GREEN}\u25cf${ANSI.RESET}`
    : `${ANSI.BRIGHT_RED}\u25cf${ANSI.RESET}`;
}

/** Status word ("LIVE" / "DOWN") with matching color. */
export function statusWord(ok: boolean, okText = 'LIVE', downText = 'DOWN'): string {
  return ok
    ? `${ANSI.BRIGHT_GREEN}${okText}${ANSI.RESET}`
    : `${ANSI.BRIGHT_RED}${downText}${ANSI.RESET}`;
}

// ============================================================================
// Label/value pairs
// ============================================================================

/**
 * A `label: value` pair padded into a fixed-width column. The label is dim,
 * the value keeps whatever ANSI the caller gave it. Used by the dashboards
 * for compact stat lines.
 */
export function kv(label: string, value: string, labelWidth: number = 12): string {
  return `${ANSI.GRAY}${padRight(label, labelWidth)}${ANSI.RESET}${value}`;
}

/** Side string ("LONG"/"SHORT"/"FLAT") with standard coloring. */
export function sideColored(sign: number): string {
  if (sign > 0) return `${ANSI.BRIGHT_GREEN}LONG${ANSI.RESET}`;
  if (sign < 0) return `${ANSI.BRIGHT_RED}SHORT${ANSI.RESET}`;
  return `${ANSI.GRAY}FLAT${ANSI.RESET}`;
}

/** Direction string ("BUY"/"SELL") with standard coloring. */
export function sideTag(isAsk: boolean): string {
  return isAsk
    ? `${ANSI.BRIGHT_RED}SELL${ANSI.RESET}`
    : `${ANSI.BRIGHT_GREEN}BUY${ANSI.RESET} `;
}

/** Minimal text sparkline over a small values window (0..8 by default). */
export function sparkline(values: number[], width = 8): string {
  if (values.length === 0) return `${ANSI.GRAY}\u2014${ANSI.RESET}`;
  const blocks = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const shown = values.slice(-width);
  const min = Math.min(...shown);
  const max = Math.max(...shown);
  const range = max - min;
  let out = '';
  for (const v of shown) {
    const idx = range === 0 ? 0 : Math.round(((v - min) / range) * (blocks.length - 1));
    out += blocks[idx] ?? '\u2581';
  }
  return `${ANSI.BRIGHT_CYAN}${out}${ANSI.RESET}`;
}

// ============================================================================
// Terminal width
// ============================================================================

export function getTerminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
}

export function getTerminalHeight(): number {
  return process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : 24;
}