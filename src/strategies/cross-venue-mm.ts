import { EventEmitter } from 'events';
import { SignerClient } from '../signer/wasm-signer-client';
import { WsPrivateClient } from '../ws/ws-private-client';
import { WsExecutor } from './ws-executor';
import { OrderTracker } from './order-tracker';
import type { EditableConfigField } from './strategy-base';
import type { MarketData } from './strategy-base';
import type { WsTickerMessage } from '../ws/ws-events';
import { logger } from '../utils/logger';
import type { Network } from '../network';
import { fetchMarketConfig, type MarketConfig } from '../utils/price-utils';

// ============================================================================
// Cross-venue configuration
// ============================================================================

export interface VenueConfig {
  network: Network | string;
  signerClient: SignerClient;
  wsPrivate: WsPrivateClient;
  executor: WsExecutor;
  tracker: OrderTracker;
  /** Tag for dashboard/logs (e.g. "core", "rh"). */
  tag: string;
}

export interface CrossVenueMMConfig {
  /** Market index (must be the same on both venues, e.g. ETH perp = 0). */
  marketId: number;
  /** Account ID per venue. */
  accountAId: number;
  accountBId: number;
  /** Edge in basis points (e.g. 5 = 0.05%). */
  edgeBps: number;
  /** Order size per quote (in base units). */
  orderSize: number;
  /** Max net position across both venues (absolute, in base units). */
  maxNetPosition: number;
  /** Max position per venue (absolute). */
  maxPositionPerVenue: number;
  /** Max open orders per venue. */
  maxOpenOrdersPerVenue: number;
  /** If true, hedge on fill: when filled on venue A, immediately place
   *  opposite market order on venue B. */
  hedgeOnFill: boolean;
  /** Slippage for hedge orders (fraction, e.g. 0.002 = 0.2%). */
  hedgeSlippage: number;
  /** Tick interval in ms. */
  tickIntervalMs: number;
  /** Self-trade behavior (0 = EXPIRE_MAKER = new default). */
  selfTradeBehavior: number;
  /** Integrator index for fee attribution. */
  builderIntegratorIndex?: number;
  /**
   * Per-venue integrator index override (keyed by venue tag, e.g.
   * `{ core: 123, rh: 456 }`). Takes precedence over
   * `builderIntegratorIndex` for that venue — builder accounts usually
   * differ between Core and Robinhood.
   */
  builderIntegratorIndexPerVenue?: Record<string, number>;
  /** Integrator taker fee. */
  integratorTakerFee?: number;
  /** Integrator maker fee. */
  integratorMakerFee?: number;
  /** Reconnect timeout before circuit breaker (ms). */
  reconnectTimeoutMs: number;
  /** Order-operations cycle in ms (at most one requote batch per venue per cycle). */
  cycleMs?: number;
  /** $ fair-price drift before a requote is due on the next cycle (default 10). */
  requoteThreshold?: number;
  /**
   * Leverage to set on BOTH venues at startup (CROSS margin mode). Venues
   * can default to very low leverage for a market (e.g. Robinhood 1x = 50%
   * initial margin on new listings), which rejects most MM orders — this
   * makes the run's intent explicit and idempotent on every start.
   * `leverageA`/`leverageB` override per venue (Core and Robinhood cap
   * leverage independently — e.g. BTC allows 50x on Core but 5x on RH).
   */
  leverage?: number;
  /** Leverage for venue A only (overrides `leverage` for that venue). */
  leverageA?: number;
  /** Leverage for venue B only (overrides `leverage` for that venue). */
  leverageB?: number;
  /** Margin mode for the leverage update: 0 = CROSS (default), 1 = ISOLATED. */
  marginMode?: number;
}

export const DEFAULT_CROSS_VENUE_CONFIG: Partial<CrossVenueMMConfig> = {
  edgeBps: 5,
  orderSize: 10000,
  maxNetPosition: 100000,
  maxPositionPerVenue: 50000,
  maxOpenOrdersPerVenue: 10,
  hedgeOnFill: true,
  hedgeSlippage: 0.002,
  tickIntervalMs: 500,
  selfTradeBehavior: 0,
  reconnectTimeoutMs: 30000,
  cycleMs: 12000,
  requoteThreshold: 10,
};

// ============================================================================
// Venue state
// ============================================================================

interface VenueState {
  config: VenueConfig;
  signer: SignerClient;
  ws: WsPrivateClient;
  executor: WsExecutor;
  tracker: OrderTracker;
  marketData: MarketData | null;
  connected: boolean;
  disconnectTime: number | null;
}

// ============================================================================
// CrossVenueMM
// ============================================================================

/**
 * Cross-venue market maker between Lighter Core (mainnet) and
 * Lighter-on-Robinhood (robinhood). Quotes on both venues simultaneously,
 * hedges inventory across them.
 *
 * Architecture:
 * - Two SignerClient instances (one per venue)
 * - Two WsPrivateClient instances (private channels per venue)
 * - Two WsExecutor instances (order placement per venue)
 * - Two OrderTracker instances (state per venue)
 * - Two public WS feeds (BBO per venue)
 *
 * Fair price = unweighted average of both venues' mid prices.
 * Quotes: bid = fair - edge, ask = fair + edge on both venues.
 * On fill on venue A → hedge on venue B (taker market order).
 */
export class CrossVenueMM extends EventEmitter {
  private config: CrossVenueMMConfig;
  private venues: Map<string, VenueState> = new Map();
  private running = false;
  private paused = false;
  private tickTimer: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private ticksProcessed: number = 0;
  private marketConfig: MarketConfig | null = null;
  /** Per-venue market config (decimals + margin caps differ per venue). */
  private venueMarketConfigs: Map<string, MarketConfig> = new Map();
  /** Monotonic clientOrderIndex counter (Date.now() collides across venues/sides) */
  private clientOrderCounter: number = 0;
  /** Last order-operations cycle time (cycleMs gating) */
  private lastCycleTime: number = 0;
  /** Current desired quote prices in human $ (drift detection) */
  private currentBidPrice: number = 0;
  private currentAskPrice: number = 0;
  /** Pending hot-config patch, applied at the top of each tick. */
  private pendingConfig: Partial<CrossVenueMMConfig> | null = null;
  /** True after a hot-config apply until quotes reflect the new config. */
  private configDirty = false;

  constructor(
    config: CrossVenueMMConfig,
    venueA: VenueConfig,
    venueB: VenueConfig,
  ) {
    super();
    this.config = { ...DEFAULT_CROSS_VENUE_CONFIG, ...config } as CrossVenueMMConfig;
    this.registerVenue(venueA);
    this.registerVenue(venueB);
    this.wireEvents();
  }

  /** Next collision-free clientOrderIndex. */
  private nextClientOrderIndex(): number {
    this.clientOrderCounter += 1;
    return this.clientOrderCounter;
  }

  /** Integrator index for a venue (per-venue override > global). */
  private integratorIndexFor(tag: string): number | undefined {
    const perVenue = this.config.builderIntegratorIndexPerVenue?.[tag];
    if (perVenue !== undefined && perVenue > 0) return perVenue;
    const idx = this.config.builderIntegratorIndex;
    return idx !== undefined && idx > 0 ? idx : undefined;
  }

  /** Integrator fee fields for an order on the given venue. */
  private integratorFieldsFor(tag: string): {
    integratorAccountIndex?: number;
    integratorTakerFee?: number;
    integratorMakerFee?: number;
  } {
    const idx = this.integratorIndexFor(tag);
    return {
      ...(idx !== undefined && { integratorAccountIndex: idx }),
      ...(this.config.integratorTakerFee !== undefined && { integratorTakerFee: this.config.integratorTakerFee }),
      ...(this.config.integratorMakerFee !== undefined && { integratorMakerFee: this.config.integratorMakerFee }),
    };
  }

  get name(): string {
    return 'CrossVenueMM';
  }

  // --------------------------------------------------------------------------
  // Venue management
  // --------------------------------------------------------------------------

  private registerVenue(vc: VenueConfig): void {
    const state: VenueState = {
      config: vc,
      signer: vc.signerClient,
      ws: vc.wsPrivate,
      executor: vc.executor,
      tracker: vc.tracker,
      marketData: null,
      connected: false,
      disconnectTime: null,
    };
    this.venues.set(vc.tag, state);
  }

  private getVenue(tag: string): VenueState | undefined {
    return this.venues.get(tag);
  }

  /** Get both venue tags (e.g. ["core", "rh"]). */
  getVenueTags(): string[] {
    return Array.from(this.venues.keys());
  }

  /** Get market data for a venue. */
  getVenueMarketData(tag: string): MarketData | null {
    return this.getVenue(tag)?.marketData ?? null;
  }

  /** Get the tracker for a venue (for dashboard). */
  getVenueTracker(tag: string): OrderTracker | undefined {
    return this.getVenue(tag)?.tracker;
  }

  /** Get the executor for a venue (for dashboard). */
  getVenueExecutor(tag: string): WsExecutor | undefined {
    return this.getVenue(tag)?.executor;
  }

  /** Convert human-readable price (dollars) to protocol units. */
  private priceToUnits(price: number): number {
    if (!this.marketConfig) return Math.round(price * 100);
    return Math.round(price * this.marketConfig.quoteScale);
  }

  /** Effective order-operations cycle (ms). */
  private get effectiveCycleMs(): number {
    const cycle = this.config.cycleMs ?? 12000;
    return cycle > 0 ? cycle : 12000;
  }

  /** True when at least `cycleMs` has elapsed since the last order batch. */
  private cycleDue(lastCycleTime: number): { due: boolean; now: number } {
    const now = Date.now();
    return { due: now - lastCycleTime >= this.effectiveCycleMs, now };
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;
    logger.info('Starting CrossVenueMM');
    this.running = true;
    this.startTime = Date.now();
    this.paused = false;

    // Fetch the PER-VENUE market config up front. Each venue reports its own
    // decimals and — crucially for leverage — its own min initial margin
    // fraction; using one venue's numbers for the other is how scaled amounts
    // and margin caps silently diverge across the two books.
    try {
      for (const [tag, venue] of this.venues) {
        const orderApi = (venue.signer as any).orderApi;
        if (!orderApi) continue;
        const mc = await fetchMarketConfig(this.config.marketId, orderApi);
        this.venueMarketConfigs.set(tag, mc);
        if (!this.marketConfig) this.marketConfig = mc;
        logger.info(
          `CrossVenueMM: market config loaded for ${tag}: ${mc.name} quoteScale=${mc.quoteScale} baseScale=${mc.baseScale}` +
            (mc.minInitialMarginFractionBps !== undefined
              ? ` minIMF=${mc.minInitialMarginFractionBps}bps (max lev ${Math.floor(10_000 / mc.minInitialMarginFractionBps)}x)`
              : ''),
        );
        // Share the unit scales with the venue tracker so locally-registered
        // (scaled) amounts and WS-fed (human) amounts reconcile.
        venue.tracker.setMarketScales(this.config.marketId, {
          baseScale: mc.baseScale,
          quoteScale: mc.quoteScale,
        });
      }
    } catch (e) {
      logger.warning('CrossVenueMM: failed to fetch market config', {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Apply the configured leverage on both venues BEFORE quoting.
    await this.applyLeverage();

    // Refuse to trade if marketId does not name the same instrument on both
    // venues. Market ids are assigned independently per venue -- e.g. on
    // Lighter Core market 2 is SOL, on Robinhood market 2 is HYPE -- so
    // quoting and hedging the same numeric id across venues without this
    // check would silently pair unrelated instruments. Only a handful of low
    // ids (ETH=0, BTC=1) are currently known to line up; everything else
    // diverges. Fail closed: an unverified pairing is refused, not assumed
    // safe.
    if (this.marketConfig) {
      const tags = Array.from(this.venues.keys());
      for (const tag of tags.slice(1)) {
        const otherMc = this.venueMarketConfigs.get(tag);
        const otherName = otherMc?.name;
        if (otherName === undefined) {
          this.running = false;
          throw new Error(
            `CrossVenueMM: could not verify that marketId ${this.config.marketId} names the same ` +
              `instrument on venue "${tag}" as on "${tags[0]}" (${this.marketConfig.name}). Refusing ` +
              'to start rather than risk quoting unrelated instruments against each other.',
          );
        }
        if (otherName !== this.marketConfig.name) {
          this.running = false;
          throw new Error(
            `CrossVenueMM: marketId ${this.config.marketId} names different instruments across ` +
              `venues (${tags[0]}=${this.marketConfig.name}, ${tag}=${otherName}). Refusing to start ` +
              '-- this would quote and hedge unrelated instruments against each other.',
          );
        }
        logger.info(
          `CrossVenueMM: verified marketId ${this.config.marketId} = ${this.marketConfig.name} on both ${tags[0]} and ${tag}`,
        );
      }
    }

    // Start each venue
    for (const [tag, venue] of this.venues) {
      try {
        // Connect WS order client
        if (!venue.executor.isWsReady()) {
          await venue.executor.connectWs();
        }

        // Subscribe to ticker (BBO) on each venue
        const tickerSub = await venue.ws.subscribeTicker(this.config.marketId);
        tickerSub.on('update', (msg: WsTickerMessage) => {
          this.updateVenueMarketData(tag, msg);
        });

        // Subscribe to private channels
        const accountId = tag === this.venues.keys().next().value
          ? this.config.accountAId
          : this.config.accountBId;

        const ordersSub = await venue.ws.subscribeAccountOrders(this.config.marketId, accountId);
        ordersSub.on('update', (msg: any) => {
          venue.tracker.onAccountOrdersMessage(msg);
        });

        const positionsSub = await venue.ws.subscribeAccountAllPositions(accountId);
        positionsSub.on('update', (msg: any) => {
          venue.tracker.onAccountAllPositionsMessage(msg);
        });

        const tradesSub = await venue.ws.subscribeAccountAllTrades(accountId);
        tradesSub.on('update', (msg: any) => {
          venue.tracker.onAccountAllTradesMessage(msg);
        });

        venue.connected = true;
        logger.info(`CrossVenueMM: venue ${tag} connected`);
      } catch (e) {
        logger.warning(`CrossVenueMM: venue ${tag} connect failed`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    this.emit('started', { time: this.startTime });
    this.startTickLoop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    logger.info('Stopping CrossVenueMM');
    this.running = false;
    this.stopTickLoop();

    // Cancel all orders on both venues
    for (const [tag, venue] of this.venues) {
      try {
        await venue.executor.cancelAllOrders(this.config.marketId);
        logger.info(`CrossVenueMM: canceled all on ${tag}`);
      } catch (e) {
        logger.warning(`CrossVenueMM: cancel all failed on ${tag}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
      try {
        await venue.ws.destroy();
      } catch {}
      try {
        await venue.executor.disconnectWs();
      } catch {}
    }

    this.emit('stopped');
  }

  pause(): void {
    this.paused = true;
    this.emit('paused');
  }

  resume(): void {
    this.paused = false;
    this.emit('resumed');
  }

  async emergencyStop(): Promise<void> {
    logger.warning('CrossVenueMM EMERGENCY STOP');
    this.running = false;
    this.stopTickLoop();
    this.emit('circuitBreaker', { reason: 'emergency_stop' });

    for (const [tag, venue] of this.venues) {
      try {
        await venue.executor.cancelAllOrders();
      } catch (e) {
        logger.warning(`Emergency stop cancel failed on ${tag}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  // --------------------------------------------------------------------------
  // Live config (hot reload)
  // --------------------------------------------------------------------------

  /**
   * Queue a partial config update; applied at the top of the next tick so
   * config changes take effect mid-run without stopping. Immutable keys
   * (marketId, accountAId, accountBId) are rejected — those are baked into
   * the subscriptions and signer clients the strategy was started with.
   */
  updateConfig(patch: Partial<CrossVenueMMConfig>): void {
    const immutable = ['marketId', 'accountAId', 'accountBId'];
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (immutable.includes(k)) continue;
      clean[k] = v;
    }
    if (Object.keys(clean).length === 0) return;
    this.pendingConfig = { ...(this.pendingConfig ?? {}), ...(clean as Partial<CrossVenueMMConfig>) };
  }

  /** Apply a queued config patch now. Called from the tick loop. */
  private applyPendingConfig(): void {
    if (!this.pendingConfig) return;
    const patch = this.pendingConfig;
    this.pendingConfig = null;
    const changed = Object.keys(patch);
    Object.assign(this.config, patch);
    // Force the next cycle to requote: an edge/size edit smaller than
    // requoteThreshold would otherwise never reach the resting orders.
    this.configDirty = true;
    if (patch.leverage !== undefined || patch.leverageA !== undefined || patch.leverageB !== undefined) {
      this.applyLeverage().catch((e) => {
        logger.warning(`CrossVenueMM: hot leverage update failed`, {
          error: e instanceof Error ? e.message : String(e),
        });
        this.emit('error', { phase: 'leverage', error: e });
      });
    }
    logger.info(`CrossVenueMM config updated: ${changed.join(', ')}`);
    this.emit('configUpdated', { keys: changed, config: { ...this.config } });
  }

  /** Current effective config (for dashboards / config menus). */
  getConfig(): CrossVenueMMConfig {
    return { ...this.config };
  }

  /** Config fields a user may change while running (dashboard config menu). */
  getEditableConfig(): EditableConfigField[] {
    const c = this.config;
    const fields: EditableConfigField[] = [
      { key: 'edgeBps', label: 'Edge (bps)', kind: 'number', get: () => c.edgeBps },
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => c.orderSize },
      { key: 'maxNetPosition', label: 'Max net position (base units)', kind: 'number', get: () => c.maxNetPosition },
      { key: 'maxPositionPerVenue', label: 'Max position/venue (base units)', kind: 'number', get: () => c.maxPositionPerVenue },
      { key: 'requoteThreshold', label: 'Requote threshold ($)', kind: 'number', get: () => c.requoteThreshold },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => c.cycleMs },
      { key: 'hedgeSlippage', label: 'Hedge slippage (fraction)', kind: 'number', get: () => c.hedgeSlippage },
    ];
    // Leverage knobs are ALWAYS listed (even unset) so a running strategy can
    // be given one for the first time from the menu — hiding undefined fields
    // is how the cross-venue run ended up with no way to set RH's leverage.
    fields.push({ key: 'leverage', label: 'Leverage both venues (x)', kind: 'number', get: () => c.leverage });
    fields.push({ key: 'leverageA', label: 'Leverage venue A/core (x)', kind: 'number', get: () => c.leverageA });
    fields.push({ key: 'leverageB', label: 'Leverage venue B/rh (x)', kind: 'number', get: () => c.leverageB });
    return fields;
  }

  /** Leverage for a venue tag: per-venue override > global `leverage`. */
  private leverageFor(tag: string): number | undefined {
    if (tag === 'core') {
      return this.config.leverageA ?? this.config.leverage;
    }
    if (tag === 'rh') {
      return this.config.leverageB ?? this.config.leverage;
    }
    return this.config.leverage;
  }

  /** Market config reported by a specific venue (margin caps differ). */
  private venueMarketConfigFor(tag: string): MarketConfig | undefined {
    return this.venueMarketConfigs.get(tag);
  }

  /**
   * Push the configured leverage to BOTH venues. Called on every start()
   * and on a hot leverage change. A failure on any venue is fatal for the
   * start — quoting with one venue's unverified margin setting is exactly
   * the asymmetry the cross-venue PnL mismatch is made of.
   */
  private async applyLeverage(): Promise<void> {
    const marginMode = this.config.marginMode ?? 0;
    for (const [tag, venue] of this.venues) {
      const leverage = this.leverageFor(tag);
      if (leverage === undefined) continue;
      if (!Number.isFinite(leverage) || leverage <= 0) {
        throw new Error(`CrossVenueMM: leverage for venue ${tag} must be a positive number, got ${leverage}`);
      }
      // Pre-validate against the venue's cap (min IMF, bps): venues cap
      // leverage independently (e.g. BTC: 50x Core, 5x RH), and a shared
      // number that only one venue accepts is precisely how "one 3x, one
      // 0x" happens. Fail here, with the cap in the message.
      const minImf = this.venueMarketConfigFor(tag)?.minInitialMarginFractionBps;
      if (minImf !== undefined && Math.floor(10_000 / leverage) < minImf) {
        const maxLeverage = Math.floor(10_000 / minImf);
        throw new Error(
          `CrossVenueMM: leverage ${leverage}x exceeds venue ${tag}'s cap for market ${this.config.marketId} ` +
            `(min initial margin ${minImf} bps = max ${maxLeverage}x). Use leverageA/leverageB for per-venue values.`,
        );
      }
      const [, , err] = await venue.signer.updateLeverage(this.config.marketId, marginMode, leverage);
      if (err) {
        throw new Error(
          `CrossVenueMM: failed to set leverage ${leverage}x on venue ${tag}: ${String(err)}. ` +
            'Refusing to quote with an unverified margin setting.',
        );
      }
      logger.info(`CrossVenueMM: leverage set to ${leverage}x on ${tag} (market ${this.config.marketId})`);
      this.emit('leverageApplied', { venue: tag, marketId: this.config.marketId, leverage, marginMode });
    }
  }

  // --------------------------------------------------------------------------
  // Tick loop
  // --------------------------------------------------------------------------

  private startTickLoop(): void {
    this.stopTickLoop();
    this.tickTimer = setInterval(async () => {
      if (this.paused || !this.running) return;
      try {
        await this.onTick();
        this.ticksProcessed++;
      } catch (e) {
        logger.warning('CrossVenueMM tick error', {
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

  private async onTick(): Promise<void> {
    // Pull pending config edits first so they take effect this cycle.
    this.applyPendingConfig();

    // Check WS connectivity on both venues
    for (const [tag, venue] of this.venues) {
      if (venue.disconnectTime && Date.now() - venue.disconnectTime > this.config.reconnectTimeoutMs) {
        this.emergencyStop();
        return;
      }
    }

    // Get market data from both venues
    const venueTags = this.getVenueTags();
    const mdA = this.getVenueMarketData(venueTags[0]);
    const mdB = this.getVenueMarketData(venueTags[1]);
    if (!mdA || !mdB || mdA.midPrice <= 0 || mdB.midPrice <= 0) return;

    // Compute fair price (unweighted average of both venues' mid prices)
    const fairPrice = (mdA.midPrice + mdB.midPrice) / 2;

    // Compute quote prices — keep HUMAN $ here for comparison/tracking;
    // convert to protocol units only at signing time.
    const edge = fairPrice * (this.config.edgeBps / 10000);
    const bidHuman = fairPrice - edge;
    const askHuman = fairPrice + edge;

    // Skip the cycle if quotes are fresh (both venues quoting both sides
    // within requoteThreshold of the desired prices) — except right after a
    // hot-config edit: an edge/size change smaller than the threshold must
    // still requote, or the resting orders keep quoting the OLD config.
    const requoteThreshold = this.config.requoteThreshold ?? 10;
    if (this.quotesFresh(bidHuman, askHuman, requoteThreshold) && !this.configDirty) return;

    // Order operations gated by the user-defined cycle
    const { due } = this.cycleDue(this.lastCycleTime);
    if (!due) return;

    // Check net position limits
    const netPosition = this.getNetPosition();
    if (Math.abs(netPosition) >= this.config.maxNetPosition) {
      // At limit — only place reducing orders
      await this.relevelAtLimit(fairPrice, netPosition);
      this.lastCycleTime = Date.now();
      return;
    }

    // Place/update quotes on both venues
    for (const [tag, venue] of this.venues) {
      await this.manageVenueQuotes(tag, venue, bidHuman, askHuman);
    }
    this.lastCycleTime = Date.now();
    this.currentBidPrice = bidHuman;
    this.currentAskPrice = askHuman;
    this.configDirty = false; // quotes reflect the new config
  }

  /** True when both venues have both desired sides live within tolerance. */
  private quotesFresh(bidHuman: number, askHuman: number, tolerance: number): boolean {
    for (const [, venue] of this.venues) {
      const openOrders = venue.tracker.getOpenOrdersByMarket(this.config.marketId);
      const hasBid = openOrders.some((o) => !o.isAsk && Math.abs(o.price - bidHuman) < tolerance);
      const hasAsk = openOrders.some((o) => o.isAsk && Math.abs(o.price - askHuman) < tolerance);
      if (!hasBid || !hasAsk) return false;
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // Quote management
  // --------------------------------------------------------------------------

  /**
   * Ensure both desired quote sides are live on one venue. Prices are
   * HUMAN $ (converted to protocol units only at signing time); tracked
   * order prices stay human for comparison.
   */
  private async manageVenueQuotes(
    tag: string,
    venue: VenueState,
    bidHuman: number,
    askHuman: number,
  ): Promise<void> {
    const tolerance = this.config.requoteThreshold ?? 10;
    const openOrders = venue.tracker.getOpenOrdersByMarket(this.config.marketId);

    // Orders that no longer match the desired levels (stale quotes)
    const stale = openOrders.filter(
      (o) => (o.isAsk ? Math.abs(o.price - askHuman) >= tolerance : Math.abs(o.price - bidHuman) >= tolerance),
    );

    // Check if we already have quotes at the right levels (human vs human)
    const hasBid = openOrders.some((o) => !o.isAsk && Math.abs(o.price - bidHuman) < tolerance);
    const hasAsk = openOrders.some((o) => o.isAsk && Math.abs(o.price - askHuman) < tolerance);

    // If quotes are correct, nothing to do
    if (hasBid && hasAsk && stale.length === 0) return;

    // Cancel stale/mismatched orders as ONE batch with the new placements
    const cancels = stale
      .filter((o) => o.orderIndex > 0)
      .map((o) => ({ marketIndex: this.config.marketId, orderIndex: o.orderIndex }));
    if (cancels.length > 0) {
      // Unknown order indexes (no WS confirmation yet) → cancel-all fallback
      await venue.executor.cancelAllOrders(this.config.marketId);
    }

    // Check per-venue position limit (signed, base units).
    const posSizeSigned = this.signedVenuePosition(venue);

    const creates: Array<{
      marketIndex: number;
      clientOrderIndex: number;
      baseAmount: number;
      price: number;
      isAsk: boolean;
      orderType: number;
      timeInForce: number;
      selfTradeBehaviorMode?: number;
      integratorAccountIndex?: number;
      integratorTakerFee?: number;
      integratorMakerFee?: number;
    }> = [];

    if (!hasBid && posSizeSigned < this.config.maxPositionPerVenue) {
      creates.push({
        marketIndex: this.config.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: this.config.orderSize,
        price: this.priceToUnits(bidHuman),
        isAsk: false,
        orderType: 0, // LIMIT
        timeInForce: 2, // POST_ONLY
        selfTradeBehaviorMode: this.config.selfTradeBehavior,
        ...this.integratorFieldsFor(tag),
      });
    }

    if (!hasAsk && posSizeSigned > -this.config.maxPositionPerVenue) {
      creates.push({
        marketIndex: this.config.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: this.config.orderSize,
        price: this.priceToUnits(askHuman),
        isAsk: true,
        orderType: 0,
        timeInForce: 2,
        selfTradeBehaviorMode: this.config.selfTradeBehavior,
        ...this.integratorFieldsFor(tag),
      });
    }

    // Enforce the per-venue order cap. The bid/ask logic above never asks for
    // more than 2 resting orders, so this is a defensive floor for a stale
    // cancel or a tracker that undercounts what's actually resting — not a
    // limit the strategy is expected to hit in normal operation. When a
    // cancel-all is already going out (cancels.length > 0) the venue will be
    // at 0 orders by the time creates land, so the cap only applies when
    // existing orders are being left in place.
    if (cancels.length === 0 && creates.length > 0) {
      const capacity = this.config.maxOpenOrdersPerVenue - openOrders.length;
      if (capacity <= 0) {
        logger.warning(
          `CrossVenueMM: ${tag} at maxOpenOrdersPerVenue=${this.config.maxOpenOrdersPerVenue}, skipping new quotes`,
        );
        return;
      }
      if (creates.length > capacity) creates.length = capacity;
    }

    if (creates.length === 0 && cancels.length === 0) return;

    const result = await venue.executor.requote({ cancels, creates });
    if (result.errors.length > 0) {
      logger.warning(`CrossVenueMM requote errors on ${tag}: ${result.errors.join('; ')}`);
    }

    // Register placed orders with HUMAN prices (tracker invariant)
    for (let i = 0; i < creates.length; i++) {
      const c = creates[i];
      venue.tracker.registerOrder({
        clientOrderIndex: c.clientOrderIndex,
        marketId: this.config.marketId,
        isAsk: c.isAsk,
        price: c.isAsk ? askHuman : bidHuman,
        baseAmount: c.baseAmount,
        orderType: 'limit',
        timeInForce: 'post-only',
      });
    }
  }

  private async relevelAtLimit(fairPrice: number, netPosition: number): Promise<void> {
    // If net long, only place asks; if net short, only place bids
    const edge = fairPrice * (this.config.edgeBps / 10000);
    const isNetLong = netPosition > 0;

    for (const [tag, venue] of this.venues) {
      // Cancel all on this venue
      await venue.executor.cancelAllOrders(this.config.marketId);

      // Place only reducing orders
      const coi = this.nextClientOrderIndex();
      const priceUnits = this.priceToUnits(isNetLong ? fairPrice + edge : fairPrice - edge);
      const result = await venue.executor.placeOrder({
        marketIndex: this.config.marketId,
        clientOrderIndex: coi,
        baseAmount: this.config.orderSize,
        price: priceUnits,
        isAsk: isNetLong,
        orderType: 0,
        timeInForce: 2, // POST_ONLY
        reduceOnly: true,
        selfTradeBehaviorMode: this.config.selfTradeBehavior,
        ...this.integratorFieldsFor(tag),
      } as any);

      if (!result.error) {
        venue.tracker.registerOrder({
          clientOrderIndex: coi,
          marketId: this.config.marketId,
          isAsk: isNetLong,
          price: isNetLong ? fairPrice + edge : fairPrice - edge,
          baseAmount: this.config.orderSize,
          orderType: 'limit',
          timeInForce: 'post-only',
          reduceOnly: true,
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Hedging
  // --------------------------------------------------------------------------

  /**
   * Hedge a fill on one venue by placing an opposite market order on the other.
   * Called automatically when a fill event is detected (if hedgeOnFill=true).
   */
  private async hedgeFill(filledVenueTag: string, fillSize: number, isAsk: boolean): Promise<void> {
    const otherTag = this.getOtherVenueTag(filledVenueTag);
    const otherVenue = this.getVenue(otherTag);
    if (!otherVenue) return;

    // Place opposite market order on the other venue
    const md = otherVenue.marketData;
    if (!md) return;

    const slippage = this.config.hedgeSlippage;
    const hedgePrice = isAsk
      ? this.priceToUnits(md.bestAsk * (1 + slippage)) // we buy to hedge a sell
      : this.priceToUnits(md.bestBid * (1 - slippage)); // we sell to hedge a buy

    const coi = this.nextClientOrderIndex();
    // Fill sizes from fill events are in HUMAN units → protocol base units
    const baseScale = this.marketConfig?.baseScale ?? 1e6;
    const result = await otherVenue.executor.placeOrder({
      marketIndex: this.config.marketId,
      clientOrderIndex: coi,
      baseAmount: Math.round(fillSize * baseScale),
      price: hedgePrice,
      isAsk: !isAsk, // opposite direction
      orderType: 1, // MARKET
      timeInForce: 0, // IMMEDIATE_OR_CANCEL
      selfTradeBehaviorMode: this.config.selfTradeBehavior,
      // Attribute the hedge to the OTHER venue's builder (the venue it trades on)
      ...this.integratorFieldsFor(otherTag),
    } as any);

    if (result.error) {
      logger.warning(`CrossVenueMM hedge failed on ${otherTag}`, { error: result.error });
      this.emit('hedgeFailed', { venue: otherTag, error: result.error });
    } else {
      logger.debug(`CrossVenueMM hedged ${fillSize} on ${otherTag}`, {
        filledVenue: filledVenueTag,
        hedgeVenue: otherTag,
        isAsk: !isAsk,
      });
      this.emit('hedged', {
        filledVenue: filledVenueTag,
        hedgeVenue: otherTag,
        size: fillSize,
        isAsk: !isAsk,
        txHash: result.txHash,
      });
    }
  }

  // --------------------------------------------------------------------------
  // Position management
  // --------------------------------------------------------------------------

  /**
   * Signed position on one venue, in BASE units (long positive).
   *
   * The per-venue trackers are separate from `this.tracker`, so this mirrors
   * StrategyBase.signedPositionUnits() rather than reusing it. The `sign`
   * field is what carries direction — `pos.size` is an unsigned magnitude, so
   * summing it across venues would report a fully hedged book as net long.
   */
  private signedVenuePosition(venue: { tracker: OrderTracker } | undefined): number {
    const pos = venue?.tracker.getPosition(this.config.marketId);
    if (!pos || pos.size === 0) return 0;
    const baseScale = this.marketConfig?.baseScale ?? 1e6;
    const direction = pos.sign < 0 ? -1 : 1;
    return direction * Math.abs(pos.size) * baseScale;
  }

  /** Get net position across both venues in BASE units (positive = net long). */
  getNetPosition(): number {
    let net = 0;
    for (const [, venue] of this.venues) {
      net += this.signedVenuePosition(venue);
    }
    return net;
  }

  /** Get position for a specific venue in BASE units. */
  getVenuePosition(tag: string): number {
    return this.signedVenuePosition(this.getVenue(tag));
  }

  // --------------------------------------------------------------------------
  // Event wiring
  // --------------------------------------------------------------------------

  private wireEvents(): void {
    for (const [tag, venue] of this.venues) {
      // Fill detection → hedge
      if (this.config.hedgeOnFill) {
        venue.tracker.on('orderFill', (event: any) => {
          this.hedgeFill(tag, event.fillSize, event.order.isAsk).catch((e) => {
            logger.warning('Hedge on fill failed', { error: e instanceof Error ? e.message : String(e) });
          });
        });
      }

      // WS connection monitoring
      venue.executor.on('wsConnected', () => {
        venue.connected = true;
        venue.disconnectTime = null;
        this.emit('wsConnected', { venue: tag });
      });
      venue.executor.on('wsDisconnected', () => {
        venue.connected = false;
        venue.disconnectTime = Date.now();
        this.emit('wsDisconnected', { venue: tag });
      });
    }
  }

  // --------------------------------------------------------------------------
  // Market data
  // --------------------------------------------------------------------------

  private updateVenueMarketData(tag: string, msg: WsTickerMessage): void {
    const venue = this.getVenue(tag);
    if (!venue) return;
    const bestBid = parseFloat(msg.ticker.b.price);
    const bestAsk = parseFloat(msg.ticker.a.price);
    venue.marketData = {
      bestBid,
      bestAsk,
      midPrice: (bestBid + bestAsk) / 2,
      markPrice: venue.marketData?.markPrice ?? 0,
      indexPrice: venue.marketData?.indexPrice ?? 0,
      spread: bestAsk - bestBid,
      lastUpdatedAt: Date.now(),
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getOtherVenueTag(tag: string): string {
    const tags = this.getVenueTags();
    return tags[0] === tag ? tags[1] : tags[0];
  }

  getStartTime(): number {
    return this.startTime;
  }

  getTicksProcessed(): number {
    return this.ticksProcessed;
  }
}