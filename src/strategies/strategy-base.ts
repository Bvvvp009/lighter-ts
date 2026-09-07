import { EventEmitter } from 'events';
import { SignerClient } from '../signer/wasm-signer-client';
import { WsPrivateClient } from '../ws/ws-private-client';
import { WsExecutor } from './ws-executor';
import { OrderTracker } from './order-tracker';
import type { WsTickerMessage, WsMarketStatsMessage, WsOrderBookMessage } from '../ws/ws-events';
import { logger } from '../utils/logger';
import { fetchMarketConfig, type MarketConfig } from '../utils/price-utils';
import {
  assertFeeWithinCap,
  resolveAttributionFromEnv,
  verifyRegistryIntegrity,
} from '../attribution';

// ============================================================================
// Strategy configuration
// ============================================================================

export interface StrategyConfig {
  /** Market index to trade (e.g. 0 for ETH perp). */
  marketId: number;
  /** Account index for private channels + signing. */
  accountId: number;
  /** Max absolute position size in base units. Strategy halts if exceeded. */
  maxPositionSize: number;
  /** Max open orders per market. */
  maxOpenOrders: number;
  /** Use POST_ONLY orders (maker-only, 0ms latency). */
  makerOnly: boolean;
  /** Self-trade behavior (0 = EXPIRE_MAKER = new default, 1 = EXPIRE_TAKER,
   *  2 = EXPIRE_BOTH, 3 = REDUCE). */
  selfTradeBehavior: number;
  /** Halt + cancel all if WS is disconnected longer than this (ms). */
  reconnectTimeoutMs: number;
  /**
   * Leverage to set on the venue for this market at startup. Applies to the
   * CROSS margin mode (marginMode 0). Lighter defaults new markets to very
   * low leverage (e.g. 1x = 100% initial margin), which rejects most MM
   * orders; this makes the run's intent explicit and idempotent. Omit to
   * leave the venue's current setting untouched.
   */
  leverage?: number;
  /** Margin mode for the leverage update: 0 = CROSS (default), 1 = ISOLATED. */
  marginMode?: number;
  /**
   * Order-operations cycle in ms — the PRIMARY user tuning knob for MM
   * strategies (like hummingbot's `cycle_time`). One cycle = at most one
   * cancel-and-requote batch. Between cycles, ticks only refresh market data
   * and check for fills; drift beyond `requoteThreshold` marks the cycle as
   * due, but the order batch still waits for the next cycle boundary.
   * Default 10000. Use `cooldownMs` (deprecated alias) for old configs.
   */
  cycleMs?: number;
  /** @deprecated Use `cycleMs` instead. Kept as an alias for old configs. */
  cooldownMs?: number;
  /**
   * Integrator account index for partner fee attribution (builder revenue).
   * Resolve it with `resolveAttributionFromEnv(network)` rather than
   * hardcoding; when omitted, the constructor re-derives it from
   * `attributionNetwork` so attribution cannot be lost by accident.
   */
  builderIntegratorIndex?: number;
  /** Integrator taker fee in MILLIONTHS of notional (200 = 2 bps). */
  integratorTakerFee?: number;
  /** Integrator maker fee in MILLIONTHS of notional (50 = 0.5 bps). */
  integratorMakerFee?: number;
  /**
   * Venue this strategy trades ('mainnet' | 'robinhood' | ...). Used to
   * re-derive partner attribution independently of the caller. Set this on
   * every strategy; without it attribution cannot be recovered and the
   * strategy logs a prominent warning.
   */
  attributionNetwork?: string;
  /** Tick interval in ms — how often the strategy's onTick runs. */
  tickIntervalMs: number;
}

export const DEFAULT_STRATEGY_CONFIG: Partial<StrategyConfig> = {
  makerOnly: true,
  selfTradeBehavior: 0, // EXPIRE_MAKER (new Lighter default)
  reconnectTimeoutMs: 30000,
  tickIntervalMs: 1000,
  maxOpenOrders: 20,
  cycleMs: 10000,
};

// ============================================================================
// Strategy state
// ============================================================================

/** A config field the user may change while a strategy runs (config menu). */
export interface EditableConfigField {
  /** Config key as accepted by `updateConfig`. */
  key: string;
  /** Human label shown in the config menu. */
  label: string;
  /** 'number' | 'boolean' — drives input parsing in the interactive editor. */
  kind: 'number' | 'boolean';
  /** Current value (read live, so the menu is always auto-filled). */
  get: () => number | boolean | undefined;
}

export enum StrategyState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export interface StrategyStats {
  startTime: number;
  ticksProcessed: number;
  ordersPlaced: number;
  ordersCanceled: number;
  fills: number;
  partialFills: number;
  errors: number;
  lastTickAt: number;
}

// ============================================================================
// Market data snapshot (updated by WS subscriptions)
// ============================================================================

export interface MarketData {
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  markPrice: number;
  indexPrice: number;
  spread: number;
  lastUpdatedAt: number;
}

// ============================================================================
// StrategyBase
// ============================================================================

/**
 * Shared infrastructure for all MM strategies (Grid, Arbitrage, Cross-venue).
 *
 * Subclasses implement `onTick()` with strategy-specific logic. The base
 * handles:
 * - WS connection lifecycle (public + private channels)
 * - Order + position tracking (via OrderTracker)
 * - Order execution (via WsExecutor)
 * - Risk controls (max position, max orders, circuit breaker)
 * - Pause/resume/stop lifecycle
 */
export abstract class StrategyBase extends EventEmitter {
  protected config: StrategyConfig;
  protected signerClient: SignerClient;
  protected wsPrivate: WsPrivateClient;
  protected executor: WsExecutor;
  protected tracker: OrderTracker;

  protected state: StrategyState = StrategyState.IDLE;
  protected stats: StrategyStats;
  protected marketData: MarketData | null = null;
  protected paused = false;
  protected marketConfig: MarketConfig | null = null;

  private tickTimer: NodeJS.Timeout | null = null;
  private wsDisconnectTime: number | null = null;

  constructor(
    config: StrategyConfig,
    signerClient: SignerClient,
    wsPrivate: WsPrivateClient,
    executor: WsExecutor,
    tracker: OrderTracker,
  ) {
    super();
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config } as StrategyConfig;
    this.applyAttributionPolicy();
    this.signerClient = signerClient;
    this.wsPrivate = wsPrivate;
    this.executor = executor;
    this.tracker = tracker;
    this.stats = {
      startTime: 0,
      ticksProcessed: 0,
      ordersPlaced: 0,
      ordersCanceled: 0,
      fills: 0,
      partialFills: 0,
      errors: 0,
      lastTickAt: 0,
    };

    this.wireEvents();
  }

  /**
   * Partner-attribution enforcement, layer 2 of 3 (runner -> here -> signer).
   *
   * Runs in the constructor, before any order can be built. It:
   *  1. verifies the builder registry has not been half-edited;
   *  2. re-derives attribution from `attributionNetwork` when the caller did
   *     not supply it, so dropping it upstream does not silently disable it;
   *  3. enforces the SDK fee caps on whatever was supplied.
   *
   * Attribution remains opt-out: `BUILDER_ATTRIBUTION=off` resolves to a
   * disabled decision here too, and that is honoured.
   */
  private applyAttributionPolicy(): void {
    verifyRegistryIntegrity();

    if (this.config.builderIntegratorIndex === undefined && this.config.attributionNetwork) {
      const decision = resolveAttributionFromEnv(this.config.attributionNetwork);
      if (decision.enabled) {
        this.config.builderIntegratorIndex = decision.accountIndex;
        this.config.integratorTakerFee = decision.takerFee;
        this.config.integratorMakerFee = decision.makerFee;
      }
    }

    if (this.config.integratorTakerFee !== undefined) {
      assertFeeWithinCap('taker', this.config.integratorTakerFee);
    }
    if (this.config.integratorMakerFee !== undefined) {
      assertFeeWithinCap('maker', this.config.integratorMakerFee);
    }

    const idx = this.config.builderIntegratorIndex;
    if (idx === undefined || idx <= 0) {
      logger.warning(
        'Partner attribution is OFF for this strategy. These strategies are ' +
          'funded by optional builder fee attribution - consider enabling it ' +
          'with BUILDER_ATTRIBUTION=on to support development.',
      );
    }
  }

  // --------------------------------------------------------------------------
  // Abstract methods — subclasses implement these
  // --------------------------------------------------------------------------

  /** Strategy-specific logic, called on every tick. */
  protected abstract onTick(): Promise<void>;

  /** Strategy name for logging/dashboard. */
  abstract get name(): string;

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start the strategy: connect WS, subscribe to channels, begin tick loop.
   */
  async start(): Promise<void> {
    if (this.state === StrategyState.RUNNING) return;

    logger.info(`Starting strategy: ${this.name}`);
    this.state = StrategyState.RUNNING;
    this.stats.startTime = Date.now();
    this.paused = false;

    // Fetch market config for price/amount scaling
    try {
      const orderApi = (this.signerClient as any).orderApi;
      if (orderApi) {
        this.marketConfig = await fetchMarketConfig(this.config.marketId, orderApi);
        logger.info(`Market config loaded: ${this.marketConfig.name} baseScale=${this.marketConfig.baseScale} quoteScale=${this.marketConfig.quoteScale}`);
        // Share the unit scales with the tracker so locally-registered
        // (scaled) amounts and WS-fed (human) amounts reconcile.
        this.tracker.setMarketScales(this.config.marketId, {
          baseScale: this.marketConfig.baseScale,
          quoteScale: this.marketConfig.quoteScale,
        });
      }
    } catch (e) {
      logger.warning('Strategy: failed to fetch market config, using raw prices', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Apply the configured leverage BEFORE quoting: the venue's default for a
    // market can be far below what this run's sizing assumes (RH lists new
    // markets at 1x/IMF 10000), which rejects every order with
    // "margin not allowed". Idempotent — a re-start re-sends the same update.
    await this.applyLeverage();

    // Connect WS order client (for order submission)
    if (!this.executor.isWsReady()) {
      try {
        await this.executor.connectWs();
      } catch (e) {
        logger.warning('Strategy: WS order client connect failed, will use HTTP fallback', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Subscribe to market data channels
    await this.subscribeMarketData();

    // Subscribe to private channels (orders, positions, trades)
    await this.subscribePrivateChannels();

    this.emit('started', { name: this.name, time: this.stats.startTime });

    // Start tick loop
    this.startTickLoop();
  }

  /**
   * Stop the strategy: cancel all orders, disconnect WS, stop tick loop.
   */
  async stop(): Promise<void> {
    if (this.state === StrategyState.STOPPED) return;

    logger.info(`Stopping strategy: ${this.name}`);
    this.state = StrategyState.STOPPING;

    // Stop tick loop
    this.stopTickLoop();

    // Cancel all open orders
    try {
      await this.executor.cancelAllOrders(this.config.marketId);
      this.emit('ordersCanceled', { reason: 'stop' });
    } catch (e) {
      logger.warning('Strategy: failed to cancel all orders on stop', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Disconnect WS
    try {
      await this.wsPrivate.destroy();
    } catch {}
    try {
      await this.executor.disconnectWs();
    } catch {}

    this.state = StrategyState.STOPPED;
    this.emit('stopped', { name: this.name });
  }

  /**
   * Pause the strategy (stop placing new orders, keep WS subscriptions active
   * for monitoring). Existing orders remain on the book.
   */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    logger.info(`Strategy paused: ${this.name}`);
    this.emit('paused');
  }

  /**
   * Resume the strategy.
   */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    logger.info(`Strategy resumed: ${this.name}`);
    this.emit('resumed');
  }

  /**
   * Emergency stop: cancel all orders immediately, flatten positions.
   * Does NOT stop the strategy instance — call stop() after to clean up.
   */
  async emergencyStop(): Promise<void> {
    logger.warning(`EMERGENCY STOP: ${this.name}`);
    this.state = StrategyState.STOPPING;
    this.stopTickLoop();
    this.emit('circuitBreaker', { reason: 'emergency_stop' });

    try {
      await this.executor.emergencyStop();
    } catch (e) {
      logger.error('Emergency stop failed', e instanceof Error ? e : undefined);
    }
  }

  // --------------------------------------------------------------------------
  // State accessors
  // --------------------------------------------------------------------------

  getState(): StrategyState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === StrategyState.RUNNING && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getStats(): StrategyStats {
    return { ...this.stats };
  }

  getMarketData(): MarketData | null {
    return this.marketData;
  }

  getTracker(): OrderTracker {
    return this.tracker;
  }

  getExecutor(): WsExecutor {
    return this.executor;
  }

  /** Convert human-readable price (dollars) to protocol units. */
  protected priceToUnits(price: number): number {
    if (!this.marketConfig) return Math.round(price * 100);
    return Math.round(price * this.marketConfig.quoteScale);
  }

  /** Convert protocol units to human-readable price (dollars). */
  protected unitsToPrice(units: number): number {
    if (!this.marketConfig) return units / 100;
    return units / this.marketConfig.quoteScale;
  }

  /** Convert human-readable amount (base asset) to protocol units. */
  protected amountToUnits(amount: number): number {
    if (!this.marketConfig) return Math.round(amount * 1e6);
    return Math.round(amount * this.marketConfig.baseScale);
  }

  /** Convert protocol units to human-readable amount (base asset). */
  protected unitsToAmount(units: number): number {
    if (!this.marketConfig) return units / 1e6;
    return units / this.marketConfig.baseScale;
  }

  /** Effective order-operation cycle (ms). `cooldownMs` is the legacy alias. */
  protected get effectiveCycleMs(): number {
    const cycle = this.config.cycleMs ?? this.config.cooldownMs ?? 10000;
    return cycle > 0 ? cycle : 10000;
  }

  /**
   * True when at least `cycleMs` has elapsed since `lastCycleTime` and it is
   * now safe to run an order-operations batch. Returns the now() timestamp
   * for bookkeeping when due.
   *
   * Also due when a hot-config change has not been reflected in live orders
   * yet (`markConfigApplied` clears it): the drift-based skip logic below
   * ("drift < requoteThreshold → keep resting orders") would otherwise keep
   * the old quotes live when a config change moves the desired quote by
   * less than the threshold. Forcing one requote guarantees every config
   * change reaches the venue's order book on the next cycle.
   */
  protected cycleDue(lastCycleTime: number): { due: boolean; now: number } {
    if (this.configDirty) return { due: true, now: Date.now() };
    const now = Date.now();
    return { due: now - lastCycleTime >= this.effectiveCycleMs, now };
  }

  /** Set by applyPendingConfig; cleared by the strategy after its batch. */
  private configDirty = false;

  // --------------------------------------------------------------------------
  // Tick loop
  // --------------------------------------------------------------------------

  private startTickLoop(): void {
    this.stopTickLoop();
    this.tickTimer = setInterval(async () => {
      if (this.paused || this.state !== StrategyState.RUNNING) return;
      // Each cycle: pull pending config updates before the strategy logic
      // runs, so a config edit takes effect on this cycle without a restart.
      this.applyPendingConfig();
      try {
        await this.onTick();
        this.stats.ticksProcessed++;
        this.stats.lastTickAt = Date.now();
      } catch (e) {
        this.stats.errors++;
        logger.warning(`Strategy onTick error: ${this.name}`, {
          error: e instanceof Error ? e.message : String(e),
        });
        this.emit('error', { phase: 'tick', error: e });
      }
    }, this.config.tickIntervalMs);
  }

  private stopTickLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Live config (hot reload)
  // --------------------------------------------------------------------------

  /**
   * Pending partial config, applied at the top of every tick. Written by
   * `updateConfig()` — from an interactive dashboard edit, a config-file
   * watcher, or any external caller — so config changes take effect on the
   * next cycle without stopping the run.
   */
  private pendingConfig: Partial<StrategyConfig> | null = null;

  /**
   * Queue a partial config update. Validated + applied on the next tick
   * (see `applyPendingConfig`), then surfaced via the `configUpdated` event.
   * Unknown keys are ignored; immutable keys (marketId, accountId) are
   * rejected — changing those mid-run would detach the strategy from the
   * subscriptions it was started with.
   */
  updateConfig(patch: Partial<StrategyConfig>): void {
    const immutable: (keyof StrategyConfig)[] = ['marketId', 'accountId'];
    const clean: Partial<StrategyConfig> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (immutable.includes(k as keyof StrategyConfig)) continue;
      (clean as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(clean).length === 0) return;
    this.pendingConfig = { ...(this.pendingConfig ?? {}), ...clean };
  }

  /** Apply a queued config update immediately (called from the tick loop). */
  protected applyPendingConfig(): void {
    if (!this.pendingConfig) return;
    const patch = this.pendingConfig;
    this.pendingConfig = null;
    const changed = Object.keys(patch);
    Object.assign(this.config, patch);
    // Mark dirty so the next cycleDue() forces a requote: resting orders
    // must reflect the new config, not keep quoting with the old value until
    // the market happens to drift past requoteThreshold.
    this.configDirty = true;
    // A leverage change must reach the venue, not just this object — fire and
    // let the promise settle; a failure is logged and emitted as an error
    // event rather than killing the tick loop.
    if (patch.leverage !== undefined) {
      this.applyLeverage().catch((e) => {
        logger.warning(`Strategy ${this.name}: hot leverage update failed`, {
          error: e instanceof Error ? e.message : String(e),
        });
        this.emit('error', { phase: 'leverage', error: e });
      });
    }
    this.onConfigUpdated(patch);
    logger.info(`Strategy config updated (${this.name}): ${changed.join(', ')}`);
    this.emit('configUpdated', { keys: changed, config: { ...this.config } });
  }

  /**
   * Clear the config-dirty flag. Call after the order batch that reflects the
   * new config was placed (or when the strategy decided none was needed) —
   * otherwise every cycle stays forced-due and the cycleMs rate limit is
   * effectively bypassed.
   */
  protected markConfigApplied(): void {
    this.configDirty = false;
  }

  /**
   * True while a hot-config change has not yet been reflected in live
   * orders. Strategies use this in their drift-skip check ("drift <
   * requoteThreshold → keep resting orders"): without it, a spread/spacing
   * edit smaller than the threshold never requotes — the config value
   * changes but the resting orders keep quoting the old one.
   */
  protected configNeedsRequote(): boolean {
    return this.configDirty;
  }

  /**
   * Subclass hook: fold strategy-specific config fields (which live in the
   * subclass's own config object, e.g. GridStrategyConfig) into the running
   * config after `updateConfig` applied the base part. Subclasses that keep
   * a merged config object should override this.
   */
  protected onConfigUpdated(_patch: Partial<StrategyConfig>): void {}

  /** Current effective config (for dashboards / config menus). */
  getConfig(): StrategyConfig {
    return { ...this.config };
  }

  /**
   * The config fields a user may change while the strategy runs, with their
   * display metadata. Subclasses extend this with their own knobs; the
   * dashboard renders it as the editable-config list.
   *
   * `leverage` is always listed, including when unset, so a running strategy
   * can be given a leverage from the menu. Fields whose value is undefined
   * must not be filtered out — that would make them impossible to set live.
   */
  getEditableConfig(): EditableConfigField[] {
    return [
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => (this.config as any).orderSize },
      { key: 'maxPositionSize', label: 'Max position (base units)', kind: 'number', get: () => this.config.maxPositionSize },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => this.config.cycleMs },
      { key: 'requoteThreshold', label: 'Requote threshold ($)', kind: 'number', get: () => (this.config as any).requoteThreshold },
      { key: 'leverage', label: 'Leverage (x, e.g. 2)', kind: 'number', get: () => this.config.leverage },
    ].filter((f) => f.key === 'leverage' || f.get() !== undefined) as EditableConfigField[];
  }

  // --------------------------------------------------------------------------
  // WS subscriptions
  // --------------------------------------------------------------------------

  private async subscribeMarketData(): Promise<void> {
    const marketId = this.config.marketId;

    // Ticker (BBO) — lightweight, used for fair price
    try {
      const tickerSub = await this.wsPrivate.subscribeTicker(marketId);
      tickerSub.on('update', (msg: WsTickerMessage) => {
        this.updateMarketDataFromTicker(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to ticker', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Market stats (mark price, index price)
    try {
      const statsSub = await this.wsPrivate.subscribeMarketStats(marketId);
      statsSub.on('update', (msg: WsMarketStatsMessage) => {
        this.updateMarketDataFromStats(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to market_stats', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Order book (for depth-aware quoting)
    try {
      const obSub = await this.wsPrivate.subscribeOrderBook(marketId);
      obSub.on('update', (msg: WsOrderBookMessage) => {
        this.updateMarketDataFromOrderBook(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to order_book', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async subscribePrivateChannels(): Promise<void> {
    const accountId = this.config.accountId;

    // Account orders (per-market) — fill detection
    try {
      const ordersSub = await this.wsPrivate.subscribeAccountOrders(this.config.marketId, accountId);
      ordersSub.on('update', (msg: any) => {
        this.tracker.onAccountOrdersMessage(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to account_orders', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Account all positions — position tracking
    try {
      const positionsSub = await this.wsPrivate.subscribeAccountAllPositions(accountId);
      positionsSub.on('update', (msg: any) => {
        this.tracker.onAccountAllPositionsMessage(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to account_all_positions', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Account all trades — fill event details
    try {
      const tradesSub = await this.wsPrivate.subscribeAccountAllTrades(accountId);
      tradesSub.on('update', (msg: any) => {
        this.tracker.onAccountAllTradesMessage(msg);
      });
    } catch (e) {
      logger.warning('Strategy: failed to subscribe to account_all_trades', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // --------------------------------------------------------------------------
  // Market data updates
  // --------------------------------------------------------------------------

  private updateMarketDataFromTicker(msg: WsTickerMessage): void {
    const bestBid = parseFloat(msg.ticker.b.price);
    const bestAsk = parseFloat(msg.ticker.a.price);
    this.marketData = {
      bestBid,
      bestAsk,
      midPrice: (bestBid + bestAsk) / 2,
      markPrice: this.marketData?.markPrice ?? 0,
      indexPrice: this.marketData?.indexPrice ?? 0,
      spread: bestAsk - bestBid,
      lastUpdatedAt: Date.now(),
    };
  }

  private updateMarketDataFromStats(msg: WsMarketStatsMessage): void {
    if (!this.marketData) {
      this.marketData = {
        bestBid: 0,
        bestAsk: 0,
        midPrice: 0,
        markPrice: parseFloat(msg.market_stats.mark_price),
        indexPrice: parseFloat(msg.market_stats.index_price),
        spread: 0,
        lastUpdatedAt: Date.now(),
      };
      return;
    }
    this.marketData.markPrice = parseFloat(msg.market_stats.mark_price);
    this.marketData.indexPrice = parseFloat(msg.market_stats.index_price);
    this.marketData.lastUpdatedAt = Date.now();
  }

  private updateMarketDataFromOrderBook(msg: WsOrderBookMessage): void {
    const bestAsk = msg.order_book.asks.length > 0
      ? parseFloat(msg.order_book.asks[0].price)
      : this.marketData?.bestAsk ?? 0;
    const bestBid = msg.order_book.bids.length > 0
      ? parseFloat(msg.order_book.bids[0].price)
      : this.marketData?.bestBid ?? 0;
    this.marketData = {
      bestBid,
      bestAsk,
      midPrice: bestBid + bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0,
      markPrice: this.marketData?.markPrice ?? 0,
      indexPrice: this.marketData?.indexPrice ?? 0,
      spread: bestAsk - bestBid,
      lastUpdatedAt: Date.now(),
    };
  }

  // --------------------------------------------------------------------------
  // Event wiring
  // --------------------------------------------------------------------------

  private wireEvents(): void {
    // Track fills/cancels in stats
    this.tracker.on('orderFill', () => this.stats.fills++);
    this.tracker.on('orderPartialFill', () => this.stats.partialFills++);
    this.tracker.on('orderCanceled', () => this.stats.ordersCanceled++);

    this.executor.on('orderPlaced', () => this.stats.ordersPlaced++);
    this.executor.on('error', () => this.stats.errors++);

    // WS connection monitoring
    this.executor.on('wsConnected', () => {
      this.wsDisconnectTime = null;
      this.emit('wsConnected');
    });
    this.executor.on('wsDisconnected', () => {
      this.wsDisconnectTime = Date.now();
      this.emit('wsDisconnected');
      // Circuit breaker: if WS is down too long, emergency stop
      setTimeout(() => {
        if (this.wsDisconnectTime && Date.now() - this.wsDisconnectTime > this.config.reconnectTimeoutMs) {
          if (this.state === StrategyState.RUNNING) {
            this.emergencyStop();
          }
        }
      }, this.config.reconnectTimeoutMs + 1000);
    });

    // Emergency stop flatten hook
    this.executor.on('emergencyStopFlatten', () => {
      this.flattenPositions().catch((e) => {
        logger.error('Flatten positions failed', e instanceof Error ? e : undefined);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Partner attribution (enforcement layer 2, order-stamping half)
  // --------------------------------------------------------------------------

  /**
   * Integrator fields to spread onto every order a strategy builds.
   *
   * The constructor already re-derived `builderIntegratorIndex` from
   * `attributionNetwork`, so subclasses get attribution by spreading this
   * instead of reaching into the config themselves. Fields are omitted (not
   * set to undefined) when the user opted out, which both satisfies
   * `exactOptionalPropertyTypes` and lets the WsExecutor tell "caller said
   * nothing" apart from "caller said zero".
   */
  protected orderIntegratorFields(): {
    integratorAccountIndex?: number;
    integratorTakerFee?: number;
    integratorMakerFee?: number;
  } {
    const c = this.config;
    return {
      ...(c.builderIntegratorIndex !== undefined && {
        integratorAccountIndex: c.builderIntegratorIndex,
      }),
      ...(c.integratorTakerFee !== undefined && { integratorTakerFee: c.integratorTakerFee }),
      ...(c.integratorMakerFee !== undefined && { integratorMakerFee: c.integratorMakerFee }),
    };
  }

  // --------------------------------------------------------------------------
  // Leverage
  // --------------------------------------------------------------------------

  /**
   * Push the configured leverage to the venue for this strategy's market.
   *
   * Called at the top of `start()` — every run — so the venue's margin
   * setting always matches the config before the first order is signed.
   * Also re-applied when a hot config update changes `leverage`.
   *
   * A failure to apply is fatal for the start: continuing would quote with a
   * venue-side margin fraction the operator did not choose, and every order
   * could be rejected or (worse) accepted at the wrong margin.
   */
  protected async applyLeverage(): Promise<void> {
    const leverage = this.config.leverage;
    if (leverage === undefined) return;
    if (!Number.isFinite(leverage) || leverage <= 0) {
      throw new Error(`Strategy ${this.name}: leverage must be a positive number, got ${leverage}`);
    }
    // Pre-validate against the venue's cap when we know it: the venue reports
    // a minimum initial margin fraction (bps); 10000/leverage must be >= it.
    // Discovering an over-cap value as a sequencer rejection mid-start is a
    // much worse failure mode than a clear message with the venue's max.
    const minImf = this.marketConfig?.minInitialMarginFractionBps;
    if (minImf !== undefined && Math.floor(10_000 / leverage) < minImf) {
      const maxLeverage = Math.floor(10_000 / minImf);
      throw new Error(
        `Strategy ${this.name}: leverage ${leverage}x exceeds this venue's cap for market ${this.config.marketId} ` +
          `(min initial margin ${minImf} bps = max ${maxLeverage}x). Set MM_LEVERAGE to at most ${maxLeverage}.`,
      );
    }
    const marginMode = this.config.marginMode ?? 0; // CROSS
    try {
      const [, , err] = await this.signerClient.updateLeverage(
        this.config.marketId,
        marginMode,
        leverage,
      );
      if (err) {
        throw new Error(String(err));
      }
      logger.info(
        `Strategy ${this.name}: leverage set to ${leverage}x (marginMode=${marginMode === 0 ? 'CROSS' : 'ISOLATED'}) on market ${this.config.marketId}`,
      );
      this.emit('leverageApplied', { marketId: this.config.marketId, leverage, marginMode });
    } catch (e) {
      throw new Error(
        `Strategy ${this.name}: failed to set leverage ${leverage}x on market ${this.config.marketId}: ` +
          `${e instanceof Error ? e.message : String(e)}. ` +
          'Refusing to start with an unverified margin setting — fix MM_LEVERAGE or clear it to skip.',
      );
    }
  }

  // --------------------------------------------------------------------------
  // Risk controls
  // --------------------------------------------------------------------------

  /**
   * Signed position for a market, in BASE units (long positive, short negative).
   *
   * The WS payload splits a position into an unsigned magnitude (`position`,
   * in human units) and a separate `sign` field, so `pos.size` alone says
   * nothing about direction — reading it as signed makes a short look long and
   * skews quotes toward ADDING to the losing side. `flattenPositions()` has
   * always combined the two correctly; this is that same reading, shared so
   * every strategy agrees.
   *
   * `Math.abs` on the magnitude is deliberate: it stays correct even if the
   * venue ever starts sending an already-signed `position`, since `sign` would
   * then agree with it rather than double-negating.
   */
  protected signedPositionUnits(marketId: number = this.config.marketId): number {
    const pos = this.tracker.getPosition(marketId);
    if (!pos || pos.size === 0) return 0;
    const baseScale = this.marketConfig?.baseScale ?? 1e6;
    const direction = pos.sign < 0 ? -1 : 1;
    return direction * Math.abs(pos.size) * baseScale;
  }

  /** Check if current position is within limits. Returns true if safe. */
  protected checkInventoryLimits(): boolean {
    const pos = this.tracker.getPosition(this.config.marketId);
    if (!pos) return true;
    // WS position size is in HUMAN units; convert to base units for the check
    const baseScale = this.marketConfig?.baseScale ?? 1e6;
    return Math.abs(pos.size * baseScale) <= this.config.maxPositionSize;
  }

  /** Check if open order count is within limits. Returns true if safe. */
  protected checkMaxOrders(): boolean {
    return this.tracker.getOpenOrderCountByMarket(this.config.marketId) < this.config.maxOpenOrders;
  }

  /**
   * Circuit breaker: halt if WS disconnected too long, or error burst.
   * Returns true if the strategy should halt.
   */
  protected circuitBreaker(): boolean {
    if (this.wsDisconnectTime && Date.now() - this.wsDisconnectTime > this.config.reconnectTimeoutMs) {
      this.emergencyStop();
      return true;
    }
    return false;
  }

  /**
   * Flatten all positions by creating reduce-only market orders.
   * Called during emergency stop.
   */
  protected async flattenPositions(): Promise<void> {
    const positions = this.tracker.getAllPositions();
    let coi = Date.now();
    for (const pos of positions) {
      if (pos.sign === 0 || pos.size === 0) continue;

      const isLong = pos.sign > 0;
      // Use market config if available for correct base scaling
      const baseScale = this.marketConfig?.baseScale ?? 1e6;
      const baseAmount = Math.abs(pos.size) * baseScale;
      const result = await this.executor.placeOrder({
        marketIndex: pos.marketId,
        clientOrderIndex: coi++,
        baseAmount: Math.floor(baseAmount),
        price: 0, // market order
        isAsk: isLong, // sell to close long, buy to close short
        orderType: 1, // MARKET
        timeInForce: 0, // IMMEDIATE_OR_CANCEL
        reduceOnly: true,
        // Taker market close — attribute it too (fees within approved caps)
        ...(this.config.builderIntegratorIndex !== undefined && { integratorAccountIndex: this.config.builderIntegratorIndex }),
        ...(this.config.integratorTakerFee !== undefined && { integratorTakerFee: this.config.integratorTakerFee }),
        ...(this.config.integratorMakerFee !== undefined && { integratorMakerFee: this.config.integratorMakerFee }),
      } as any);

      if (result.error) {
        logger.error(`Flatten failed for market ${pos.marketId}`, undefined, { error: result.error });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Order helpers (used by subclasses)
  // --------------------------------------------------------------------------

  /**
   * Place a limit order with strategy defaults applied (makerOnly, selfTrade, integrator).
   */
  protected async placeLimitOrder(
    clientOrderIndex: number,
    price: number,
    baseAmount: number,
    isAsk: boolean,
    reduceOnly: boolean = false,
  ): Promise<string> {
    const priceUnits = this.priceToUnits(price);
    const result = await this.executor.placeOrder({
      marketIndex: this.config.marketId,
      clientOrderIndex,
      baseAmount,
      price: priceUnits,
      isAsk,
      orderType: 0, // LIMIT
      timeInForce: this.config.makerOnly ? 2 : 1, // POST_ONLY or GOOD_TILL_TIME
      reduceOnly,
      selfTradeBehaviorMode: this.config.selfTradeBehavior,
      integratorAccountIndex: this.config.builderIntegratorIndex,
      integratorTakerFee: this.config.integratorTakerFee,
      integratorMakerFee: this.config.integratorMakerFee,
    } as any);

    if (result.error) {
      logger.warning(`Place limit order failed: ${result.error}`);
      return '';
    }

    // Register with tracker so it expects this order
    this.tracker.registerOrder({
      clientOrderIndex,
      marketId: this.config.marketId,
      isAsk,
      price,
      baseAmount,
      orderType: 'limit',
      timeInForce: this.config.makerOnly ? 'post-only' : 'good-till-time',
      reduceOnly,
    });

    return result.txHash;
  }

  /**
   * Cancel a specific order.
   */
  protected async cancelOrder(orderIndex: number): Promise<boolean> {
    const result = await this.executor.cancelOrder(this.config.marketId, orderIndex);
    if (result.error) {
      logger.warning(`Cancel order ${orderIndex} failed: ${result.error}`);
      return false;
    }
    return true;
  }

  /**
   * Cancel all orders on this strategy's market.
   */
  protected async cancelAllOnMarket(): Promise<boolean> {
    const result = await this.executor.cancelAllOrders(this.config.marketId);
    if (result.error) {
      logger.warning(`Cancel all on market ${this.config.marketId} failed: ${result.error}`);
      return false;
    }
    return true;
  }
}