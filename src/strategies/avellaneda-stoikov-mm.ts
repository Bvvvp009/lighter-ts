import { StrategyBase, type StrategyConfig, type EditableConfigField } from './strategy-base';
import { logger } from '../utils/logger';

// ============================================================================
// Avellaneda-Stoikov market maker
// ============================================================================

/**
 * Config for {@link AvellanedaStoikovMM}.
 *
 * The model has two free parameters, `gamma` and `kappa`, plus a volatility
 * estimate. Everything else here is a practical guard rail. Read
 * docs/STRATEGIES.md before changing `gamma` on a funded account: it is the
 * knob that decides how hard the quotes lean away from inventory.
 */
export interface AvellanedaStoikovConfig extends StrategyConfig {
  /** Order size per side, in base units (integer, same units as maxPositionSize). */
  orderSize: number;

  /**
   * Risk aversion (gamma). Higher = quotes lean harder against inventory and
   * the optimal spread widens. 0 reduces the model to symmetric quoting around
   * the mid at the `kappa` spread. Default 0.5.
   */
  gamma?: number;

  /**
   * Order-arrival intensity (kappa, the `k` of the paper). Higher = fills are
   * assumed to arrive more readily, so the optimal spread narrows. Default 1.5.
   */
  kappa?: number;

  /**
   * Volatility (sigma) in PRICE units per sqrt(horizon), e.g. 25 means "the
   * mid typically moves $25 over one horizon". Omit to estimate it live from
   * mid-price samples (recommended); set it to pin the model to a known value
   * for backtests or for the first minutes of a run.
   */
  sigma?: number;

  /**
   * Length of one A-S session in ms. The model's time-to-horizon `(T - t)`
   * runs from 1 down to 0 across this window and then restarts, which is what
   * makes quotes tighten and inventory pressure fade as the session closes.
   * Default 300000 (5 min).
   */
  timeHorizonMs?: number;

  /**
   * Run the steady-state variant instead: `(T - t)` is pinned at 1 and never
   * decays. Use this for a maker that runs indefinitely and should not have a
   * session end. Default false.
   */
  infiniteHorizon?: boolean;

  /**
   * Half-life in ms for the EWMA volatility estimator. Shorter = sigma reacts
   * faster to a regime change and the quotes widen sooner. Default 30000.
   */
  volatilityHalfLifeMs?: number;

  /**
   * Mid samples required before the live sigma estimate is trusted. Until then
   * the strategy uses `fallbackVolatilityBps`. Default 20.
   */
  minVolatilitySamples?: number;

  /**
   * Volatility used during warm-up, in bps of the mid (25 bps of a $100k mid
   * = $250). Also the floor for the live estimate, so a dead-quiet book cannot
   * collapse the spread to zero. Default 5.
   */
  fallbackVolatilityBps?: number;

  /**
   * Hard clamps on the model's half-spread, in bps of the mid. These exist
   * because A-S is unbounded in both directions: a volatility spike can widen
   * the optimal spread past anything that will ever fill, and a quiet book
   * with large `kappa` can tighten it inside the exchange tick.
   * Defaults: min 1 bp, max 100 bps.
   */
  minHalfSpreadBps?: number;
  maxHalfSpreadBps?: number;

  /**
   * Fraction of `maxPositionSize` beyond which the entry side stops being
   * quoted, leaving only the reducing side live. Default 0.5.
   */
  maxInventoryFraction?: number;

  /**
   * Quote drift in $ that marks the cycle as due for a requote. Below this the
   * strategy leaves resting orders alone. Default 10.
   */
  requoteThreshold?: number;

  /** Fair-price reference: 'mid' (default) or 'mark'. */
  priceSource?: 'mid' | 'mark';

  /**
   * Inventory target as a fraction of `maxPositionSize` (-1..1). The
   * reservation price leans toward flat by default; set e.g. 0.2 to make the
   * maker treat "20% long" as its neutral inventory. Default 0.
   */
  inventoryTargetFraction?: number;
}

export const DEFAULT_AS_CONFIG: Partial<AvellanedaStoikovConfig> = {
  gamma: 0.5,
  kappa: 1.5,
  timeHorizonMs: 300000,
  infiniteHorizon: false,
  volatilityHalfLifeMs: 30000,
  minVolatilitySamples: 20,
  fallbackVolatilityBps: 5,
  minHalfSpreadBps: 1,
  maxHalfSpreadBps: 100,
  maxInventoryFraction: 0.5,
  requoteThreshold: 10,
  priceSource: 'mid',
  inventoryTargetFraction: 0,
};

/** One evaluation of the model — returned by {@link AvellanedaStoikovMM.computeQuotes}. */
export interface AvellanedaStoikovQuote {
  /** Fair price the model was evaluated at. */
  fairPrice: number;
  /** Inventory-adjusted reservation price `r`. */
  reservationPrice: number;
  /** Optimal total spread from the model, in price units (before clamping). */
  optimalSpread: number;
  /** Half-spread actually used, after the bps clamps. */
  halfSpread: number;
  /** Normalised inventory in [-1, 1], relative to `maxPositionSize`. */
  inventoryRatio: number;
  /** Time to horizon in [0, 1]. */
  timeToHorizon: number;
  /** Volatility used for this evaluation, in price units. */
  sigma: number;
  bidPrice: number;
  askPrice: number;
}

// ============================================================================

/**
 * Avellaneda-Stoikov optimal market maker (Avellaneda & Stoikov, 2008,
 * "High-frequency trading in a limit order book").
 *
 * Two ideas, both of which this implements literally:
 *
 * 1. **Reservation price.** Rather than quoting around the mid, quote around
 *    `r = s - q * gamma * sigma^2 * (T - t)`, the price at which the maker is
 *    indifferent to its current inventory `q`. Long inventory pushes `r` below
 *    the mid, so the ask gets closer and the bid backs off — the maker pays to
 *    get flat, and pays more the more volatile the market is.
 *
 * 2. **Optimal spread.** `delta = gamma * sigma^2 * (T - t) + (2 / gamma) *
 *    ln(1 + gamma / kappa)`, split evenly around `r`. The first term is the
 *    inventory-risk premium, the second is the profit-maximising markup given
 *    how quickly orders arrive.
 *
 * Inventory `q` is normalised to [-1, 1] against `maxPositionSize` so that
 * `gamma` means the same thing on a $2 market and a $100k one; set
 * `inventoryTargetFraction` to shift the neutral point off flat.
 *
 * Practical deviations from the paper, all deliberate and all live-money
 * safety rails rather than model changes:
 *
 * - `sigma` is estimated live (EWMA of mid returns) with a bps floor, so a
 *   frozen book cannot collapse the spread.
 * - The half-spread is clamped to `[minHalfSpreadBps, maxHalfSpreadBps]`.
 * - Past `maxInventoryFraction` of max position, only the reducing side quotes.
 * - Under `makerOnly`, quotes are pulled back to the touch rather than crossing
 *   it, so a POST_ONLY order rests instead of being rejected.
 *
 * Every order carries partner attribution via
 * {@link StrategyBase.orderIntegratorFields}. See docs/ATTRIBUTION.md.
 */
export class AvellanedaStoikovMM extends StrategyBase {
  private asConfig: AvellanedaStoikovConfig;
  private lastCycleTime = 0;
  private currentBidPrice = 0;
  private currentAskPrice = 0;
  private clientOrderCounter = 0;

  /** Session clock for the finite-horizon term. */
  private sessionStart = Date.now();

  /** EWMA variance of mid-price changes, in price^2. */
  private ewmaVariance = 0;
  private volatilitySamples = 0;
  private lastMid = 0;
  private lastMidAt = 0;

  /** Last computed quote, exposed for dashboards and tests. */
  private lastQuote: AvellanedaStoikovQuote | null = null;

  constructor(
    config: AvellanedaStoikovConfig,
    signerClient: any,
    wsPrivate: any,
    executor: any,
    tracker: any,
  ) {
    super(config, signerClient, wsPrivate, executor, tracker);
    this.asConfig = { ...DEFAULT_AS_CONFIG, ...config } as AvellanedaStoikovConfig;

    const gamma = this.asConfig.gamma ?? 0.5;
    const kappa = this.asConfig.kappa ?? 1.5;
    if (!(gamma >= 0) || !Number.isFinite(gamma)) {
      throw new Error(`AvellanedaStoikovMM: gamma must be a finite number >= 0, got ${gamma}`);
    }
    if (!(kappa > 0) || !Number.isFinite(kappa)) {
      throw new Error(`AvellanedaStoikovMM: kappa must be a finite number > 0, got ${kappa}`);
    }
  }

  get name(): string {
    return `A-S MM ${this.asConfig.marketId}`;
  }

  /**
   * Hot config: fold applied patches into the strategy config object and
   * re-validate the model parameters. A gamma/kappa edit that would break
   * the model (NaN, non-positive kappa) is the same error the constructor
   * throws — raising here kills the tick before it quotes with nonsense.
   */
  protected override onConfigUpdated(patch: Partial<StrategyConfig>): void {
    Object.assign(this.asConfig, patch);
    const gamma = (this.asConfig as any).gamma as number | undefined;
    const kappa = (this.asConfig as any).kappa as number | undefined;
    if (gamma !== undefined && (!(gamma >= 0) || !Number.isFinite(gamma))) {
      throw new Error(`AvellanedaStoikovMM: gamma must be a finite number >= 0, got ${gamma}`);
    }
    if (kappa !== undefined && (!(kappa > 0) || !Number.isFinite(kappa))) {
      throw new Error(`AvellanedaStoikovMM: kappa must be a finite number > 0, got ${kappa}`);
    }
  }

  /** A-S-specific editable fields for the dashboard config menu. */
  override getEditableConfig(): EditableConfigField[] {
    return [
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => this.asConfig.orderSize },
      { key: 'gamma', label: 'Gamma (risk aversion)', kind: 'number', get: () => this.asConfig.gamma },
      { key: 'kappa', label: 'Kappa (arrival intensity)', kind: 'number', get: () => this.asConfig.kappa },
      { key: 'sigma', label: 'Sigma (pinned volatility, $)', kind: 'number', get: () => this.asConfig.sigma },
      { key: 'minHalfSpreadBps', label: 'Min half-spread (bps)', kind: 'number', get: () => this.asConfig.minHalfSpreadBps },
      { key: 'maxHalfSpreadBps', label: 'Max half-spread (bps)', kind: 'number', get: () => this.asConfig.maxHalfSpreadBps },
      { key: 'maxInventoryFraction', label: 'Max inventory fraction', kind: 'number', get: () => this.asConfig.maxInventoryFraction },
      { key: 'requoteThreshold', label: 'Requote threshold ($)', kind: 'number', get: () => this.asConfig.requoteThreshold },
      { key: 'maxPositionSize', label: 'Max position (base units)', kind: 'number', get: () => this.asConfig.maxPositionSize },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => this.asConfig.cycleMs },
      { key: 'leverage', label: 'Leverage (x, e.g. 2)', kind: 'number', get: () => this.asConfig.leverage },
    ].filter((f) => f.key === 'leverage' || f.get() !== undefined) as EditableConfigField[];
  }

  /** The most recent model evaluation, or null before the first tick. */
  getLastQuote(): AvellanedaStoikovQuote | null {
    return this.lastQuote;
  }

  protected nextClientOrderIndex(): number {
    this.clientOrderCounter += 1;
    return this.clientOrderCounter;
  }

  // --------------------------------------------------------------------------
  // Model
  // --------------------------------------------------------------------------

  /**
   * Time to horizon in [0, 1]. Restarts the session when it runs out, so a
   * long-running maker cycles through the horizon instead of freezing at 0
   * (where the inventory term vanishes entirely).
   */
  private timeToHorizon(now: number): number {
    if (this.asConfig.infiniteHorizon) return 1;
    const horizon = this.asConfig.timeHorizonMs ?? 300000;
    if (horizon <= 0) return 1;
    let elapsed = now - this.sessionStart;
    if (elapsed >= horizon) {
      this.sessionStart = now;
      elapsed = 0;
    }
    return 1 - elapsed / horizon;
  }

  /**
   * Feed a mid-price sample into the EWMA volatility estimator.
   *
   * The decay is derived from the elapsed time rather than the sample count so
   * that a stalled feed does not silently freeze the estimate: `alpha` is the
   * weight of the newest sample over `dt`, given `volatilityHalfLifeMs`.
   */
  private updateVolatility(mid: number, now: number): void {
    if (this.lastMid > 0 && now > this.lastMidAt) {
      const dt = now - this.lastMidAt;
      const halfLife = this.asConfig.volatilityHalfLifeMs ?? 30000;
      const alpha = halfLife > 0 ? 1 - Math.pow(0.5, dt / halfLife) : 1;
      const change = mid - this.lastMid;
      this.ewmaVariance = (1 - alpha) * this.ewmaVariance + alpha * change * change;
      this.volatilitySamples += 1;
    }
    this.lastMid = mid;
    this.lastMidAt = now;
  }

  /**
   * Volatility in price units for the current horizon.
   *
   * `ewmaVariance` is the variance of per-tick mid changes; scaling by
   * sqrt(horizon / tickInterval) turns "typical move per tick" into "typical
   * move per horizon", which is the unit the A-S formulas expect.
   */
  private currentSigma(mid: number): number {
    const floorBps = this.asConfig.fallbackVolatilityBps ?? 5;
    const floor = (mid * floorBps) / 10000;

    if (this.asConfig.sigma !== undefined) return this.asConfig.sigma;
    if (this.volatilitySamples < (this.asConfig.minVolatilitySamples ?? 20)) return floor;

    const tickMs = Math.max(1, this.asConfig.tickIntervalMs || 1000);
    const horizonMs = this.asConfig.infiniteHorizon
      ? (this.asConfig.timeHorizonMs ?? 300000)
      : (this.asConfig.timeHorizonMs ?? 300000);
    const scale = Math.sqrt(Math.max(1, horizonMs / tickMs));
    const perTick = Math.sqrt(Math.max(0, this.ewmaVariance));
    return Math.max(floor, perTick * scale);
  }

  /** Inventory in base units, signed (long positive). */
  private inventoryBaseUnits(): number {
    return this.signedPositionUnits(this.asConfig.marketId);
  }

  /**
   * Evaluate the model. Split out from the tick so it can be unit-tested and
   * rendered by a dashboard without placing anything.
   */
  computeQuotes(fairPrice: number, now: number = Date.now()): AvellanedaStoikovQuote {
    const gamma = this.asConfig.gamma ?? 0.5;
    const kappa = this.asConfig.kappa ?? 1.5;
    const maxPos = this.asConfig.maxPositionSize;
    const target = this.asConfig.inventoryTargetFraction ?? 0;

    const posUnits = this.inventoryBaseUnits();
    const rawRatio = maxPos > 0 ? posUnits / maxPos : 0;
    // q is measured against the inventory TARGET, not against flat.
    const inventoryRatio = Math.max(-1, Math.min(1, rawRatio - target));

    const tau = this.timeToHorizon(now);
    const sigma = this.currentSigma(fairPrice);
    const variance = sigma * sigma;

    // r = s - q * gamma * sigma^2 * (T - t)
    const reservationPrice = fairPrice - inventoryRatio * gamma * variance * tau;

    // delta = gamma * sigma^2 * (T - t) + (2 / gamma) * ln(1 + gamma / kappa)
    // The markup term is 0/0 at gamma = 0. Since ln(1 + x) -> x, its limit is
    // 2 / kappa for the TOTAL spread (1 / kappa per side), which is what a
    // risk-neutral maker quotes. Using 1 / kappa here would halve the spread
    // discontinuously as gamma crosses zero.
    const markup = gamma > 0 ? (2 / gamma) * Math.log(1 + gamma / kappa) : 2 / kappa;
    const optimalSpread = gamma * variance * tau + markup;

    const minHalf = (fairPrice * (this.asConfig.minHalfSpreadBps ?? 1)) / 10000;
    const maxHalf = (fairPrice * (this.asConfig.maxHalfSpreadBps ?? 100)) / 10000;
    const halfSpread = Math.min(maxHalf, Math.max(minHalf, optimalSpread / 2));

    return {
      fairPrice,
      reservationPrice,
      optimalSpread,
      halfSpread,
      inventoryRatio,
      timeToHorizon: tau,
      sigma,
      bidPrice: reservationPrice - halfSpread,
      askPrice: reservationPrice + halfSpread,
    };
  }

  // --------------------------------------------------------------------------
  // Tick
  // --------------------------------------------------------------------------

  protected async onTick(): Promise<void> {
    if (this.circuitBreaker()) return;

    const md = this.getMarketData();
    if (!md || md.midPrice <= 0) return;

    const now = Date.now();
    // Volatility always tracks the mid, even when the model quotes off the mark.
    this.updateVolatility(md.midPrice, now);

    const fair = this.asConfig.priceSource === 'mark' ? md.markPrice : md.midPrice;
    if (!(fair > 0)) return;

    const quote = this.computeQuotes(fair, now);
    this.lastQuote = quote;

    let { bidPrice, askPrice } = quote;

    // POST_ONLY that crosses is rejected outright, so pull each side back to
    // the touch instead of losing the quote entirely.
    if (this.config.makerOnly) {
      if (md.bestBid > 0 && bidPrice > md.bestBid) bidPrice = md.bestBid;
      if (md.bestAsk > 0 && askPrice < md.bestAsk) askPrice = md.bestAsk;
    }
    if (!(bidPrice > 0) || !(askPrice > 0) || askPrice <= bidPrice) return;

    await this.quoteTick(quote, bidPrice, askPrice);
  }

  private async quoteTick(
    quote: AvellanedaStoikovQuote,
    desiredBid: number,
    desiredAsk: number,
  ): Promise<void> {
    const requoteThreshold = this.asConfig.requoteThreshold ?? 10;
    const maxInvFraction = this.asConfig.maxInventoryFraction ?? 0.5;
    const invRatio = quote.inventoryRatio;

    const wantBid = invRatio < maxInvFraction;
    const wantAsk = invRatio > -maxInvFraction;

    // Leave resting orders alone while they are still close enough and the
    // sides we want are actually live — except right after a hot-config edit
    // (configNeedsRequote): a gamma/kappa/sigma change smaller than the drift
    // threshold must still requote or the resting orders keep quoting the
    // OLD parameters.
    const bidDrift = Math.abs(desiredBid - this.currentBidPrice);
    const askDrift = Math.abs(desiredAsk - this.currentAskPrice);
    if (bidDrift < requoteThreshold && askDrift < requoteThreshold && !this.configNeedsRequote()) {
      const open = this.tracker.getOpenOrdersByMarket(this.asConfig.marketId);
      const bidSatisfied = !wantBid || open.some((o) => !o.isAsk);
      const askSatisfied = !wantAsk || open.some((o) => o.isAsk);
      if (bidSatisfied && askSatisfied) return;
    }

    const { due } = this.cycleDue(this.lastCycleTime);
    if (!due) return;
    if (!this.checkMaxOrders()) return;

    const openOrders = this.tracker.getOpenOrdersByMarket(this.asConfig.marketId);
    const cancels = openOrders
      .filter((o) => o.orderIndex > 0)
      .map((o) => ({ marketIndex: this.asConfig.marketId, orderIndex: o.orderIndex }));

    const posUnits = this.inventoryBaseUnits();
    const maxPos = this.asConfig.maxPositionSize;
    const size = this.asConfig.orderSize;
    const timeInForce = this.config.makerOnly ? 2 : 1; // POST_ONLY / GOOD_TILL_TIME
    const attribution = this.orderIntegratorFields();

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

    if (wantBid && posUnits < maxPos) {
      creates.push({
        marketIndex: this.asConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredBid),
        isAsk: false,
        orderType: 0,
        timeInForce,
        selfTradeBehaviorMode: this.asConfig.selfTradeBehavior,
        ...attribution,
      });
    }
    if (wantAsk && posUnits > -maxPos) {
      creates.push({
        marketIndex: this.asConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredAsk),
        isAsk: true,
        orderType: 0,
        timeInForce,
        selfTradeBehaviorMode: this.asConfig.selfTradeBehavior,
        ...attribution,
      });
    }

    if (creates.length === 0 && cancels.length === 0) return;

    // Resting orders whose exchange index has not arrived over WS yet cannot be
    // cancelled individually — fall back to cancel-all so the requote is clean.
    if (cancels.length === 0 && openOrders.length > 0) {
      await this.cancelAllOnMarket();
    }

    const result = await this.getExecutor().requote({ cancels, creates });
    if (result.errors.length > 0) {
      logger.warning(`A-S requote errors: ${result.errors.join('; ')}`);
    }

    for (const c of creates) {
      this.tracker.registerOrder({
        clientOrderIndex: c.clientOrderIndex,
        marketId: this.asConfig.marketId,
        isAsk: c.isAsk,
        price: c.isAsk ? desiredAsk : desiredBid,
        baseAmount: c.baseAmount,
        orderType: 'limit',
        timeInForce: this.config.makerOnly ? 'post-only' : 'good-till-time',
        reduceOnly: false,
      });
    }

    this.currentBidPrice = desiredBid;
    this.currentAskPrice = desiredAsk;
    this.lastCycleTime = Date.now();
    this.markConfigApplied(); // requote reflected the new config
  }
}
