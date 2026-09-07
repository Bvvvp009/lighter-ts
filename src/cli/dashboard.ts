import * as readline from 'readline';
import { StatsAggregator, type DashboardEvent } from './stats-aggregator';
import type { OrderTracker } from '../strategies/order-tracker';
import type { WsExecutor } from '../strategies/ws-executor';
import type { StrategyBase, EditableConfigField } from '../strategies/strategy-base';
import type { CrossVenueMM } from '../strategies/cross-venue-mm';
import {
  ANSI,
  cursorTo,
  padRight,
  padLeft,
  padCenter,
  truncate,
  formatUsd,
  formatPnl,
  formatTime,
  formatTimeHMS,
  statusDot,
  statusWord,
  sideColored,
  sideTag,
  kv,
  visibleLength,
  getTerminalWidth,
  getTerminalHeight,
  BOX,
  hLine,
  topBorder,
  bottomBorder,
} from './render';

// ============================================================================
// Dashboard config
// ============================================================================

export interface DashboardConfig {
  stats: StatsAggregator;
  trackers: OrderTracker | OrderTracker[];
  executors: WsExecutor | WsExecutor[];
  strategy: StrategyBase | CrossVenueMM;
  refreshMs?: number;
  crossVenue?: boolean;
  venueTags?: string[];
  /**
   * Write the event log (and PnL snapshots) to a file in `logs/`. Default
   * off — see MM_LOG_FILE. When set, a sink callback receives each event.
   */
  onEvent?: (event: DashboardEvent) => void;
}

// ============================================================================
// Config menu state
// ============================================================================

type MenuMode = 'none' | 'list' | 'edit';

interface ConfigMenuState {
  mode: MenuMode;
  /** Index of the selected field in the editable list. */
  selected: number;
  /** The value being typed in edit mode. */
  input: string;
  /** Editable fields, re-read on open so the list is always auto-filled. */
  fields: EditableConfigField[];
  /** Status line shown in edit mode (e.g. parse errors). */
  editError: string | null;
}

// ============================================================================
// Dashboard
// ============================================================================

/**
 * CLI dashboard for MM strategies. Renders a live-updating terminal UI
 * with positions, open orders, PnL/volume stats, and an event log.
 *
 * Uses the alt screen buffer (preserves scrollback), a fixed-rate render
 * loop (default 250ms), and keyboard input:
 *
 *   [Space] config menu — list every changeable config (auto-filled with
 *           current values), arrow keys to select, Enter to edit, apply
 *           takes effect on the next strategy cycle without a restart.
 *   [P] pause/resume   [E] emergency stop   [R] reset stats   [Q] quit
 *
 * Zero external dependencies — only Node.js built-ins (readline, process.stdout).
 */
export class Dashboard {
  private stats: StatsAggregator;
  private trackers: OrderTracker[];
  private executors: WsExecutor[];
  private strategy: StrategyBase | CrossVenueMM;
  private refreshMs: number;
  private crossVenue: boolean;
  private venueTags: string[];
  private readonly onEvent: ((event: DashboardEvent) => void) | undefined;

  private renderTimer: NodeJS.Timeout | null = null;
  /**
   * False when stdout is redirected (piped to a file, run under CI). The
   * full-redraw loop emits cursor-positioning escapes every tick, which is
   * meaningless in a file and buries the strategy's own output under
   * megabytes of control codes. With no TTY we draw nothing and let that
   * output through instead.
   */
  private readonly interactive = Boolean(process.stdout.isTTY);
  private running = false;
  private paused = false;
  private rl: readline.Interface | null = null;
  private menu: ConfigMenuState = { mode: 'none', selected: 0, input: '', fields: [], editError: null };
  /** Ring of recent mid prices for the header sparkline. */
  private midHistory: number[] = [];

  constructor(config: DashboardConfig) {
    this.stats = config.stats;
    this.trackers = Array.isArray(config.trackers) ? config.trackers : [config.trackers];
    this.executors = Array.isArray(config.executors) ? config.executors : [config.executors];
    this.strategy = config.strategy;
    this.refreshMs = config.refreshMs ?? 250;
    this.crossVenue = config.crossVenue ?? false;
    this.venueTags = config.venueTags ?? (this.crossVenue ? ['core', 'rh'] : ['default']);
    this.onEvent = config.onEvent;
    if (this.onEvent) {
      // Mirror every event to the caller's sink (file logging).
      const origPush = this.stats.events.push.bind(this.stats.events);
      this.stats.events.push = (ev: DashboardEvent) => {
        try {
          this.onEvent!(ev);
        } catch {}
        return origPush(ev);
      };
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.onEvent) {
      // Also route events pushed before start() — the aggregator keeps a
      // ring buffer, so drain nothing; the wrap above covers everything new.
    }

    if (!this.interactive) {
      // Headless: no alt screen, no redraw loop. Strategy logs still print.
      console.log('[dashboard] stdout is not a TTY \u2014 running headless (no live redraw).');
      return;
    }

    // Enter alt screen, hide cursor
    process.stdout.write(ANSI.ENTER_ALT + ANSI.HIDE_CURSOR + ANSI.CLEAR);

    // Set up keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      readline.emitKeypressEvents(process.stdin);
      this.rl = readline.createInterface({ input: process.stdin, terminal: false });
      process.stdin.on('keypress', (str: string, key: any) => this.onKeypress(str, key));
    }

    // Start render loop
    this.renderTimer = setInterval(() => this.render(), this.refreshMs);
    this.render();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    // Exit alt screen, show cursor (nothing to undo when headless)
    if (this.interactive) {
      process.stdout.write(ANSI.SHOW_CURSOR + ANSI.EXIT_ALT);
    }
  }

  // --------------------------------------------------------------------------
  // Keyboard input
  // --------------------------------------------------------------------------

  private editableFields(): EditableConfigField[] {
    const s = this.strategy as any;
    const fields = typeof s.getEditableConfig === 'function' ? s.getEditableConfig() : [];
    return fields;
  }

  private openMenu(): void {
    this.menu = {
      mode: 'list',
      selected: 0,
      input: '',
      fields: this.editableFields(),
      editError: null,
    };
  }

  private onKeypress(str: string, key: any): void {
    if (!key) return;
    const k = key.name || str;

    // ── Config menu input handling ─────────────────────────────────────
    if (this.menu.mode === 'list') {
      switch (k) {
        case 'escape':
        case 'q':
          this.menu = { mode: 'none', selected: 0, input: '', fields: [], editError: null };
          return;
        case 'up':
        case 'k':
          this.menu.selected = Math.max(0, this.menu.selected - 1);
          return;
        case 'down':
        case 'j':
          this.menu.selected = Math.min(this.menu.fields.length - 1, this.menu.selected + 1);
          return;
        case 'enter':
        case 'return':
          if (this.menu.fields.length > 0) {
            const f = this.menu.fields[this.menu.selected];
            if (f) {
              this.menu.mode = 'edit';
              this.menu.input = String(f.get() ?? '');
              this.menu.editError = null;
            }
          }
          return;
      }
      return;
    }

    if (this.menu.mode === 'edit') {
      if (k === 'escape') {
        this.menu.mode = 'list';
        this.menu.editError = null;
        return;
      }
      if (k === 'enter' || k === 'return') {
        this.applyMenuEdit();
        return;
      }
      if (key.backspace || k === 'backspace') {
        this.menu.input = this.menu.input.slice(0, -1);
        return;
      }
      if (k === 'c' && key.ctrl) {
        this.menu = { mode: 'none', selected: 0, input: '', fields: [], editError: null };
        this.stop();
        this.strategy.stop().catch(() => {});
        return;
      }
      if (str && !key.ctrl && !key.meta) {
        this.menu.input += str;
        this.menu.editError = null;
      }
      return;
    }

    // ── Main dashboard keys ────────────────────────────────────────────
    switch (k) {
      case 'space':
        this.openMenu();
        this.flash('CONFIG MENU \u2014 arrow keys, Enter to edit, Esc to close', 'cyan');
        break;

      case 'p':
      case 'P':
        if (this.paused) {
          this.strategy.resume();
          this.paused = false;
        } else {
          this.strategy.pause();
          this.paused = true;
        }
        this.flash(this.paused ? 'PAUSED' : 'RESUMED', 'yellow');
        break;

      case 'e':
      case 'E':
        this.flash('EMERGENCY STOP', 'red');
        this.strategy.emergencyStop();
        break;

      case 'r':
      case 'R':
        this.stats.reset();
        this.flash('STATS RESET', 'cyan');
        break;

      case 'q':
      case 'Q':
      case 'escape':
        this.stop();
        this.strategy.stop().catch(() => {});
        break;

      case 'c':
        if (key.ctrl) {
          this.stop();
          this.strategy.stop().catch(() => {});
        }
        break;
    }
  }

  /** Commit the typed value from the edit box into the strategy. */
  private applyMenuEdit(): void {
    const field = this.menu.fields[this.menu.selected];
    if (!field) {
      this.menu.mode = 'list';
      return;
    }
    const raw = this.menu.input.trim();
    if (raw === '') {
      this.menu.editError = 'empty value \u2014 Esc to cancel';
      return;
    }
    let value: number | boolean;
    if (field.kind === 'boolean') {
      value = raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'on';
    } else {
      value = Number(raw);
      if (!Number.isFinite(value)) {
        this.menu.editError = `'${raw}' is not a number`;
        return;
      }
    }
    (this.strategy as any).updateConfig({ [field.key]: value });
    this.stats.events.push({
      timestamp: Date.now(),
      type: 'config',
      message: `${field.key} \u2192 ${String(value)} (applies next cycle)`,
      color: 'cyan',
    });
    this.menu.mode = 'list';
    this.menu.editError = null;
    // Refresh values for the list view.
    this.menu.fields = this.editableFields();
  }

  private flash(message: string, color: string): void {
    this.stats.events.push({
      timestamp: Date.now(),
      type: 'info',
      message,
      color: color as any,
    });
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  private render(): void {
    if (!this.interactive) return;
    const width = getTerminalWidth();
    const height = getTerminalHeight();
    const lines: string[] = [];

    if (this.menu.mode !== 'none') {
      lines.push(...this.renderConfigMenu(width, height - 1));
    } else if (this.crossVenue) {
      lines.push(...this.renderHeaderCrossVenue(width));
      lines.push(...this.renderPositionsCrossVenue(width));
      lines.push(...this.renderOrdersCrossVenue(width));
      lines.push(...this.renderStatsCrossVenue(width));
      lines.push(...this.renderEvents(width));
      lines.push(...this.renderFooter(width));
    } else {
      lines.push(...this.renderHeader(width));
      lines.push(...this.renderPositions(width));
      lines.push(...this.renderOrders(width));
      lines.push(...this.renderStats(width));
      lines.push(...this.renderEvents(width));
      lines.push(...this.renderFooter(width));
    }

    // Pad to terminal height
    while (lines.length < height - 1) {
      lines.push('');
    }
    // Trim if over
    while (lines.length > height - 1) {
      lines.pop();
    }

    // Write all at once with cursor positioning
    let output = ANSI.CLEAR;
    for (let i = 0; i < lines.length; i++) {
      output += cursorTo(i + 1, 1) + ANSI.CLEAR_LINE + lines[i];
    }
    process.stdout.write(output);
  }

  // --------------------------------------------------------------------------
  // Config menu rendering (Space key)
  // --------------------------------------------------------------------------

  /**
   * Full-screen config menu. Shows every changeable config with its
   * matching config key, current value auto-filled live, and an inline
   * editor. Edits apply on the next strategy cycle — no restart.
   */
  private renderConfigMenu(width: number, maxHeight: number): string[] {
    const lines: string[] = [];
    const inner = Math.max(20, width - 6);

    lines.push(topBorder(width));
    lines.push(
      `${BOX.V}${padCenter(`${ANSI.BOLD}${ANSI.BRIGHT_CYAN}CONFIG${ANSI.RESET} \u2014 ${this.strategyName()}`, inner)}${BOX.V}`,
    );
    lines.push(hLine(width));
    lines.push(
      `${BOX.V}${ANSI.GRAY} arrow keys to select \u2022 Enter to edit \u2022 Esc to close \u2022 changes apply next cycle${ANSI.RESET}`.padEnd(width - 1) + BOX.V,
    );
    lines.push(hLine(width));

    const { mode, selected, fields, input, editError } = this.menu;

    if (fields.length === 0) {
      lines.push(`${BOX.V}  ${ANSI.GRAY}(this strategy exposes no editable config)${ANSI.RESET}`.padEnd(width - 1) + BOX.V);
    }

    const shown = fields.slice(0, Math.max(4, maxHeight - 12));
    for (let i = 0; i < shown.length; i++) {
      const f = shown[i]!;
      const isSel = i === selected;
      const row = `  ${isSel ? `${ANSI.BRIGHT_YELLOW}\u276f${ANSI.RESET}` : ' '} ` +
        `${isSel ? ANSI.BOLD : ''}${padRight(f.label, 32)}${ANSI.RESET}` +
        `${ANSI.GRAY}${padRight(f.key, 22)}${ANSI.RESET}` +
        (isSel && mode === 'edit'
          ? `${ANSI.INVERSE}${padRight(input + ' ', Math.min(20, inner - 58))}${ANSI.RESET}`
          : f.get() === undefined
            ? `${ANSI.GRAY}(unset \u2014 type a value)${ANSI.RESET}`
            : `${ANSI.BRIGHT_GREEN}${String(f.get())}${ANSI.RESET}`);
      lines.push(`${BOX.V}${truncate(row, width - 2)}${BOX.V}`);
    }

    if (mode === 'edit') {
      lines.push(hLine(width));
      const errLine = editError
        ? `${ANSI.BRIGHT_RED}${editError}${ANSI.RESET}`
        : `${ANSI.GRAY}type a value, Enter to apply, Esc to cancel${ANSI.RESET}`;
      lines.push(`${BOX.V}  ${errLine}`.padEnd(width - 1) + BOX.V);
    }

    lines.push(hLine(width));
    const cfg = (this.strategy as any).getConfig?.();
    if (cfg) {
      const envLine = `${ANSI.GRAY}file: ${process.env.MM_CONFIG_FILE ?? 'mm-config.json'} \u2022 hot-reload each cycle${ANSI.RESET}`;
      lines.push(`${BOX.V}  ${truncate(envLine, width - 4)}`.padEnd(width - 1) + BOX.V);
    }
    lines.push(bottomBorder(width));
    return lines;
  }

  private strategyName(): string {
    return (this.strategy as any).name ?? 'Strategy';
  }

  // --------------------------------------------------------------------------
  // Header
  // --------------------------------------------------------------------------

  private midForHeader(): number {
    const s = this.strategy as any;
    if (this.crossVenue) {
      const tags = (s.getVenueTags?.() ?? []) as string[];
      const a = s.getVenueMarketData?.(tags[0]);
      const b = s.getVenueMarketData?.(tags[1]);
      if (a && b) return (a.midPrice + b.midPrice) / 2;
      return a?.midPrice ?? 0;
    }
    return s.getMarketData?.()?.midPrice ?? 0;
  }

  private renderHeader(width: number): string[] {
    const name = this.strategyName();
    const s = this.strategy as any;
    const startTime = s.startTime || s.getStartTime?.() || Date.now();
    const uptime = formatTime(Date.now() - startTime);
    const wsConnected = this.executors[0]?.isWsReady() ?? false;
    const md = s.getMarketData?.();

    // Track mid for the sparkline
    if (md && md.midPrice > 0) {
      this.midHistory.push(md.midPrice);
      if (this.midHistory.length > 16) this.midHistory.shift();
    }

    const status = this.paused
      ? `${ANSI.BRIGHT_YELLOW}\u25b6 PAUSED${ANSI.RESET}`
      : statusWord(wsConnected, '\u25b6 LIVE', '\u25b6 DOWN');
    const leverage = (s.getConfig?.()?.leverage as number | undefined) ?? undefined;
    const levStr = leverage !== undefined ? ` \u2022 ${ANSI.BRIGHT_MAGENTA}${leverage}x${ANSI.RESET}` : '';

    const line1 =
      `${ANSI.BOLD}${ANSI.BRIGHT_CYAN}\u2554\u2550 LIGHTER ${ANSI.RESET}` +
      `${ANSI.BOLD}${name}${ANSI.RESET} ` +
      `${ANSI.GRAY}up ${uptime}${ANSI.RESET}` +
      `${levStr} ` +
      `${status}`;
    const right1 = md
      ? `mid ${ANSI.BOLD}${md.midPrice.toFixed(2)}${ANSI.RESET} ${ANSI.GRAY}spr ${md.spread.toFixed(2)}${ANSI.RESET}`
      : '';
    const line2 = md
      ? `  bid ${ANSI.BRIGHT_GREEN}${md.bestBid.toFixed(2)}${ANSI.RESET}  ask ${ANSI.BRIGHT_RED}${md.bestAsk.toFixed(2)}${ANSI.RESET}`
      : '  waiting for market data...';
    const right2 = this.sparkBar(width - visibleLength(line2) - 4);

    const row = (l: string, r: string): string => {
      const pad = width - visibleLength(l) - visibleLength(r) - 2;
      return l + ' '.repeat(Math.max(1, pad)) + r;
    };

    return [
      row(line1, right1),
      row(line2, right2),
      hLine(width),
    ];
  }

  private renderHeaderCrossVenue(width: number): string[] {
    const mm = this.strategy as CrossVenueMM;
    const startTime = mm.getStartTime?.() || Date.now();
    const uptime = formatTime(Date.now() - startTime);
    const tags = mm.getVenueTags();
    const mdA = mm.getVenueMarketData(tags[0]);
    const mdB = mm.getVenueMarketData(tags[1]);
    const wsA = this.executors[0]?.isWsReady() ?? false;
    const wsB = this.executors[1]?.isWsReady() ?? false;
    // Effective per-venue leverage: leverageA/leverageB override the shared
    // value, and the two venues can legitimately differ (BTC: core 50x, RH 5x)
    // — a single number here would misreport one of them.
    const cfg = mm.getConfig?.();
    const levA = cfg?.leverageA ?? cfg?.leverage;
    const levB = cfg?.leverageB ?? cfg?.leverage;
    const levStr =
      levA !== undefined || levB !== undefined
        ? ` \u2022 ${ANSI.BRIGHT_MAGENTA}${levA !== undefined ? `${levA}x` : '-'}${ANSI.RESET}${ANSI.GRAY}/${ANSI.RESET}${ANSI.BRIGHT_MAGENTA}${levB !== undefined ? `${levB}x` : '-'}${ANSI.RESET}`
        : '';

    if (mdA && mdB) {
      this.midHistory.push((mdA.midPrice + mdB.midPrice) / 2);
      if (this.midHistory.length > 16) this.midHistory.shift();
    }

    const line1 =
      `${ANSI.BOLD}${ANSI.BRIGHT_CYAN}\u2554\u2550 LIGHTER ${ANSI.RESET}` +
      `${ANSI.BOLD}CROSS-VENUE ${ANSI.RESET}` +
      `${ANSI.BOLD}${tags[0]}${ANSI.RESET}${ANSI.GRAY}\u2194${ANSI.RESET}${ANSI.BOLD}${tags[1]}${ANSI.RESET} ` +
      `${ANSI.GRAY}up ${uptime}${ANSI.RESET}` +
      `${levStr} ` +
      (this.paused ? `${ANSI.BRIGHT_YELLOW}\u25b6 PAUSED${ANSI.RESET}` : `${ANSI.BRIGHT_GREEN}\u25b6 LIVE${ANSI.RESET}`);

    const fmtVenue = (tag: string, md: typeof mdA, ws: boolean): string => {
      if (!md) return `${ANSI.GRAY}${tag}: --${ANSI.RESET}`;
      return (
        `${ANSI.BOLD}${tag}${ANSI.RESET}${statusDot(ws)} ` +
        `${ANSI.BRIGHT_GREEN}${md.bestBid.toFixed(2)}${ANSI.RESET}/${ANSI.BRIGHT_RED}${md.bestAsk.toFixed(2)}${ANSI.RESET} ` +
        `${ANSI.GRAY}m${md.midPrice.toFixed(2)}${ANSI.RESET}`
      );
    };
    const line2 = `  ${fmtVenue(tags[0]!, mdA, wsA)}   ${fmtVenue(tags[1]!, mdB, wsB)}`;

    return [
      line1,
      line2,
      hLine(width),
    ];
  }

  private sparkBar(width: number): string {
    if (this.midHistory.length < 2) return '';
    const min = Math.min(...this.midHistory);
    const max = Math.max(...this.midHistory);
    const range = max - min;
    const blocks = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
    let out = '';
    for (const v of this.midHistory) {
      const idx = range === 0 ? 0 : Math.round(((v - min) / range) * (blocks.length - 1));
      out += blocks[idx] ?? '\u2581';
    }
    return `${ANSI.BRIGHT_CYAN}${out}${ANSI.RESET}`;
  }

  // --------------------------------------------------------------------------
  // Positions
  // --------------------------------------------------------------------------

  private renderPositions(_width: number): string[] {
    const lines: string[] = [];
    lines.push(`${ANSI.BOLD}${ANSI.BRIGHT_WHITE}POSITIONS${ANSI.RESET}`);

    const tracker = this.trackers[0];
    const positions = tracker.getAllPositions().filter((p) => p.size !== 0);

    if (positions.length === 0) {
      lines.push(`  ${ANSI.GRAY}flat \u2014 no open positions${ANSI.RESET}`);
      return lines;
    }

    lines.push(
      `  ${ANSI.GRAY}${padRight('MARKET', 10)}${padRight('SIDE', 8)}${padRight('SIZE', 12)}${padRight('ENTRY', 12)}${padRight('uPnL', 12)}rPnL${ANSI.RESET}`,
    );

    for (const pos of positions) {
      const sizeStr = pos.size.toFixed(4);
      const entryStr = formatUsd(pos.avgEntryPrice);
      const uPnl = formatPnl(pos.unrealizedPnl);
      const rPnl = formatPnl(pos.realizedPnl);
      lines.push(
        `  ${padRight(`mkt:${pos.marketId}`, 10)}${padRight(sideColored(pos.sign), 8)}${padRight(sizeStr, 12)}${padRight(entryStr, 12)}${padRight(uPnl, 12)}${rPnl}`,
      );
    }

    return lines;
  }

  private renderPositionsCrossVenue(width: number): string[] {
    const lines: string[] = [];
    const halfWidth = Math.floor((width - 3) / 2);

    const tagA = this.venueTags[0]!;
    const tagB = this.venueTags[1]!;
    const trackerA = this.trackers[0];
    const trackerB = this.trackers[1];

    const posA = trackerA.getAllPositions().filter((p) => p.size !== 0);
    const posB = trackerB?.getAllPositions().filter((p) => p.size !== 0) ?? [];

    // Two-column header
    const colA = `${ANSI.BOLD}${tagA.toUpperCase()}${ANSI.RESET}`;
    const colB = `${ANSI.BOLD}${tagB.toUpperCase()}${ANSI.RESET}`;
    lines.push(`${padRight(colA, halfWidth)}${BOX.V}${padRight(colB, halfWidth)}`);

    // Net position line (the number a hedged book should show near zero)
    const net = (this.strategy as CrossVenueMM).getNetPosition?.();
    if (net !== undefined) {
      const netStr = Math.abs(net) < 1e-9
        ? `${ANSI.BRIGHT_GREEN}HEDGED (net ~0)${ANSI.RESET}`
        : `${ANSI.BRIGHT_YELLOW}NET ${net > 0 ? '+' : ''}${net.toFixed(4)}${ANSI.RESET}`;
      lines.push(`${ANSI.GRAY}net across venues:${ANSI.RESET} ${netStr}`);
    }

    const maxRows = Math.max(posA.length, posB.length, 1);
    for (let i = 0; i < maxRows; i++) {
      const pa = posA[i];
      const pb = posB[i];

      const fmtPos = (p: typeof pa): string => {
        if (!p) return `  ${ANSI.GRAY}--${ANSI.RESET}`;
        return (
          `  ${sideColored(p.sign)} ${p.size.toFixed(4)} @ ${p.avgEntryPrice.toFixed(2)} ` +
          `e:${formatPnl(p.realizedPnl)} u:${formatPnl(p.unrealizedPnl)}`
        );
      };

      const left = fmtPos(pa);
      const right = fmtPos(pb);
      lines.push(`${padRight(left, halfWidth)}${BOX.V}${right}`);
    }

    return lines;
  }

  // --------------------------------------------------------------------------
  // Open Orders
  // --------------------------------------------------------------------------

  private renderOrders(_width: number): string[] {
    const lines: string[] = [];
    const tracker = this.trackers[0];
    const openOrders = tracker.getOpenOrders();
    lines.push(`${ANSI.BOLD}${ANSI.BRIGHT_WHITE}OPEN ORDERS${ANSI.RESET} ${ANSI.GRAY}(${openOrders.length} active)${ANSI.RESET}`);

    if (openOrders.length === 0) {
      lines.push(`  ${ANSI.GRAY}no open orders${ANSI.RESET}`);
      return lines;
    }

    // Show up to 8 orders
    const shown = openOrders.slice(0, 8);
    for (const order of shown) {
      const price = order.price.toFixed(2);
      const size = order.baseAmount.toFixed(4);
      const filled = order.filledBaseAmount.toFixed(4);
      const status = order.status === 'open' ? '' : ` ${ANSI.GRAY}${order.status}${ANSI.RESET}`;
      lines.push(
        `  ${padRight(`#${String(order.clientOrderIndex).slice(-6)}`, 8)}${sideTag(order.isAsk)} ${padRight(price, 12)}${padRight(size, 12)}${padRight(filled, 10)}${status}`,
      );
    }

    if (openOrders.length > 8) {
      lines.push(`  ${ANSI.GRAY}... and ${openOrders.length - 8} more${ANSI.RESET}`);
    }

    return lines;
  }

  private renderOrdersCrossVenue(width: number): string[] {
    const lines: string[] = [];
    const halfWidth = Math.floor((width - 3) / 2);

    const trackerA = this.trackers[0];
    const trackerB = this.trackers[1];
    const ordersA = trackerA.getOpenOrders();
    const ordersB = trackerB?.getOpenOrders() ?? [];

    const headerA = `${ANSI.BOLD}${ANSI.BRIGHT_WHITE}ORDERS${ANSI.RESET} ${ANSI.GRAY}(${ordersA.length})${ANSI.RESET}`;
    const headerB = `${ANSI.BOLD}${ANSI.BRIGHT_WHITE}ORDERS${ANSI.RESET} ${ANSI.GRAY}(${ordersB.length})${ANSI.RESET}`;
    lines.push(`${padRight(headerA, halfWidth)}${BOX.V}${padRight(headerB, halfWidth)}`);

    const maxRows = Math.max(ordersA.length, ordersB.length, 1);
    for (let i = 0; i < Math.min(maxRows, 6); i++) {
      const oa = ordersA[i];
      const ob = ordersB[i];

      const fmtOrder = (o: typeof oa): string => {
        if (!o) return `  ${ANSI.GRAY}--${ANSI.RESET}`;
        return `  ${o.isAsk ? `${ANSI.BRIGHT_RED}SELL${ANSI.RESET}` : `${ANSI.BRIGHT_GREEN}BUY${ANSI.RESET} `} ${o.price.toFixed(2)} ${o.baseAmount.toFixed(4)}`;
      };

      const left = fmtOrder(oa);
      const right = fmtOrder(ob);
      lines.push(`${padRight(left, halfWidth)}${BOX.V}${right}`);
    }

    return lines;
  }

  // --------------------------------------------------------------------------
  // PnL & Volume stats
  // --------------------------------------------------------------------------

  private renderStats(_width: number): string[] {
    const lines: string[] = [];
    lines.push(`${ANSI.BOLD}${ANSI.BRIGHT_WHITE}PNL & VOLUME${ANSI.RESET}`);

    this.stats.updateUnrealizedPnl();
    const total = this.stats.getTotalPnl();

    lines.push(
      `  ${kv('Realized', formatPnl(this.stats.realizedPnl))}  ${kv('Unrealized', formatPnl(this.stats.unrealizedPnl))}  ${kv('TOTAL', formatPnl(total))}`,
    );
    lines.push(
      `  ${kv('Volume', formatUsd(this.stats.totalVolume))}  ${kv('Fills', String(this.stats.fillCount))}  ${kv('Partials', String(this.stats.partialFillCount))}  ${kv('Cancels', String(this.stats.cancelCount))}`,
    );
    lines.push(
      `  ${kv('Rejects', String(this.stats.rejectCount))}  ${kv('Placed', String(this.stats.ordersPlaced))}  ${kv('Funding', formatPnl(this.stats.totalFunding))}`,
    );

    return lines;
  }

  private renderStatsCrossVenue(_width: number): string[] {
    const lines: string[] = [];
    this.stats.updateUnrealizedPnl();
    const total = this.stats.getTotalPnl();

    const tagA = this.venueTags[0]!;
    const tagB = this.venueTags[1]!;
    const vA = this.stats.getVenueStats(tagA);
    const vB = this.stats.getVenueStats(tagB);

    lines.push(`${ANSI.BOLD}${ANSI.BRIGHT_WHITE}PNL & VOLUME${ANSI.RESET}`);

    const venueLine = (tag: string, v: typeof vA): string => {
      if (!v) return `${tag}: --`;
      return (
        `  ${ANSI.BOLD}${padRight(tag.toUpperCase(), 6)}${ANSI.RESET}` +
        `${kv('rPnL', formatPnl(v.realizedPnl), 6)} ${kv('uPnL', formatPnl(v.unrealizedPnl), 6)} ` +
        `${kv('vol', formatUsd(v.volume), 6)} ${kv('fills', String(v.fills), 6)}`
      );
    };
    lines.push(venueLine(tagA, vA));
    lines.push(venueLine(tagB, vB));
    lines.push(
      `  ${ANSI.GRAY}${'─'.repeat(46)}${ANSI.RESET}`,
    );
    lines.push(
      `  ${kv('NET realized', formatPnl(this.stats.realizedPnl))}  ${kv('unrealized', formatPnl(this.stats.unrealizedPnl))}  ${ANSI.BOLD}${kv('TOTAL', formatPnl(total))}${ANSI.RESET}`,
    );
    lines.push(
      `  ${kv('Volume', formatUsd(this.stats.totalVolume))}  ${kv('Cancels', `${vA?.cancels ?? 0}/${vB?.cancels ?? 0}`, 12)}  ${kv('Funding', formatPnl(this.stats.totalFunding))}`,
    );

    return lines;
  }

  // --------------------------------------------------------------------------
  // Event Log
  // --------------------------------------------------------------------------

  private renderEvents(width: number): string[] {
    const lines: string[] = [];
    lines.push(`${ANSI.BOLD}${ANSI.BRIGHT_WHITE}EVENT LOG${ANSI.RESET}`);

    const events = this.stats.events.last(8);
    for (const event of events) {
      const time = formatTimeHMS(event.timestamp);
      const venue = event.venue ? `[${event.venue}]` : '';
      const typeTag = this.colorizeEvent(event);
      const msg = truncate(`${typeTag} ${event.message}`, width - 12);

      lines.push(`  ${ANSI.GRAY}${time}${ANSI.RESET} ${ANSI.DIM}${padRight(venue, 7)}${ANSI.RESET} ${msg}`);
    }

    if (events.length === 0) {
      lines.push(`  ${ANSI.GRAY}waiting for events...${ANSI.RESET}`);
    }

    return lines;
  }

  private colorizeEvent(event: DashboardEvent): string {
    const tag = event.type.toUpperCase().padEnd(7);
    const colorMap: Record<string, string> = {
      green: ANSI.BRIGHT_GREEN,
      red: ANSI.BRIGHT_RED,
      yellow: ANSI.BRIGHT_YELLOW,
      cyan: ANSI.BRIGHT_CYAN,
      gray: ANSI.GRAY,
      white: ANSI.WHITE,
    };
    const color = colorMap[event.color] || ANSI.WHITE;
    return `${color}${tag}${ANSI.RESET}`;
  }

  // --------------------------------------------------------------------------
  // Footer
  // --------------------------------------------------------------------------

  private renderFooter(width: number): string[] {
    return [
      hLine(width),
      `${ANSI.DIM}[Space] config  [P]ause  [E]mergency stop  [R]eset stats  [Q]uit${ANSI.RESET}`,
    ];
  }
}