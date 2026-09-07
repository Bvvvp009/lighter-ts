import { StrategyBase, type StrategyConfig, type EditableConfigField } from './strategy-base';
import { logger } from '../utils/logger';

// ============================================================================
// Perpetual MM strategy configuration
// ============================================================================

export interface PerpetualMMConfig extends StrategyConfig {
  /**
   * Half-spread in basis points around the mid price for quoting.
   * bid = mid * (1 - bidSpreadBps/10000), ask = mid * (1 + askSpreadBps/10000).
   * Defaults to symmetric 10 bps (~$8 on BTC at $80k) if per-side unset.
   */
  bidSpreadBps?: number;
  /** Ask-side spread override (default: same as bidSpreadBps). */
  askSpreadBps?: number;
  /** Order size per side (in base units, e.g. 50 = 0.0005 BTC). */
  orderSize: number;
  /**
   * Inventory skew in basis points per unit of inventory ratio. When long by
   * 50% of max position with skewBps=10, both quotes shift down by 5 bps —
   * the bid backs away (less buying) and the ask tightens (more selling).
   * Default 20.
   */
  inventorySkewBps?: number;
  /**
   * Fraction of maxPositionSize at which the entry side stops being quoted
   * (only reducing orders). Default 0.5.
   */
  maxInventoryFraction?: number;
  /**
   * Mid-price drift in $ before a requote is due on the next cycle.
   * Default 10.
   */
  requoteThreshold?: number;
  /** Fair reference: 'mid' (default) or 'mark'. */
  priceSource?: 'mid' | 'mark';
}

export const DEFAULT_PERP_MM_CONFIG: Partial<PerpetualMMConfig> = {
  bidSpreadBps: 10,
  inventorySkewBps: 20,
  maxInventoryFraction: 0.5,
  requoteThreshold: 10,
  priceSource: 'mid',
};

// ============================================================================
// PerpetualMMStrategy
// ============================================================================

/**
 * Pure single-venue perpetual market maker (hummingbot `pure_mm` style).
 *
 * Quotes a POST_ONLY bid and ask around the mid price with configurable
 * basis-point spreads per side. Behaviors:
 *
 * - One cancel-and-requote batch per user-defined cycle (`cycleMs`); the
 *   requote only fires when the mid drifted beyond `requoteThreshold` or a
 *   quoted side is missing (e.g. after a fill). The batch is a single
 *   sendtxbatch WS message.
 * - Inventory skew (Avellaneda-Stoikov style): both quotes shift linearly
 *   with inventory ratio, pulling the exit side toward mid and pushing the
 *   entry side away.
 * - Beyond `maxInventoryFraction` of max position, the entry side is not
 *   quoted at all — active unwind via reduce-side-only quoting.
 */
export class PerpetualMMStrategy extends StrategyBase {
  private mmConfig: PerpetualMMConfig;
  private lastCycleTime: number = 0;
  /** Current quote prices in human-readable $ (for drift detection) */
  private currentBidPrice: number = 0;
  private currentAskPrice: number = 0;
  /** Monotonic clientOrderIndex counter (Date.now() collides) */
  private clientOrderCounter: number = 0;

  constructor(
    config: PerpetualMMConfig,
    signerClient: any,
    wsPrivate: any,
    executor: any,
    tracker: any,
  ) {
    super(config, signerClient, wsPrivate, executor, tracker);
    this.mmConfig = { ...DEFAULT_PERP_MM_CONFIG, ...config } as PerpetualMMConfig;
  }

  get name(): string {
    return `PerpMM ${this.mmConfig.marketId}`;
  }

  /** Hot config: fold applied patches into the strategy config object. */
  protected override onConfigUpdated(patch: Partial<StrategyConfig>): void {
    Object.assign(this.mmConfig, patch);
  }

  /** PerpMM-specific editable fields for the dashboard config menu. */
  override getEditableConfig(): EditableConfigField[] {
    return [
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => this.mmConfig.orderSize },
      { key: 'bidSpreadBps', label: 'Bid spread (bps)', kind: 'number', get: () => this.mmConfig.bidSpreadBps },
      { key: 'askSpreadBps', label: 'Ask spread (bps)', kind: 'number', get: () => this.mmConfig.askSpreadBps ?? this.mmConfig.bidSpreadBps },
      { key: 'inventorySkewBps', label: 'Inventory skew (bps)', kind: 'number', get: () => this.mmConfig.inventorySkewBps },
      { key: 'maxInventoryFraction', label: 'Max inventory fraction', kind: 'number', get: () => this.mmConfig.maxInventoryFraction },
      { key: 'maxPositionSize', label: 'Max position (base units)', kind: 'number', get: () => this.mmConfig.maxPositionSize },
      { key: 'requoteThreshold', label: 'Requote threshold ($)', kind: 'number', get: () => this.mmConfig.requoteThreshold },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => this.mmConfig.cycleMs },
      { key: 'leverage', label: 'Leverage (x, e.g. 2)', kind: 'number', get: () => this.mmConfig.leverage },
    ].filter((f) => f.key === 'leverage' || f.get() !== undefined) as EditableConfigField[];
  }

  protected nextClientOrderIndex(): number {
    this.clientOrderCounter += 1;
    return this.clientOrderCounter;
  }

  // --------------------------------------------------------------------------
  // Main tick logic
  // --------------------------------------------------------------------------

  protected async onTick(): Promise<void> {
    if (this.circuitBreaker()) return;

    const md = this.getMarketData();
    if (!md || md.midPrice <= 0) return;

    const fair = this.mmConfig.priceSource === 'mark' ? md.markPrice : md.midPrice;
    if (fair <= 0) return;

    await this.mmTick(fair);
  }

  private async mmTick(fair: number): Promise<void> {
    const bidSpreadBps = this.mmConfig.bidSpreadBps ?? 10;
    const askSpreadBps = this.mmConfig.askSpreadBps ?? bidSpreadBps;
    const skewBps = this.mmConfig.inventorySkewBps ?? 20;
    const maxInvFraction = this.mmConfig.maxInventoryFraction ?? 0.5;
    const requoteThreshold = this.mmConfig.requoteThreshold ?? 10;

    // Inventory ratio in [-1, 1]. signedPositionUnits() combines the WS
    // magnitude with its separate `sign` field — reading `pos.size` alone
    // would make a short look long and skew quotes the wrong way.
    const posSize = this.signedPositionUnits(this.mmConfig.marketId);
    const maxPos = this.mmConfig.maxPositionSize;
    const invRatio = maxPos > 0 ? Math.max(-1, Math.min(1, posSize / maxPos)) : 0;

    // Skew in bps toward the reducing side (positive when long → shift down)
    const skew = skewBps * invRatio;
    const bidBps = bidSpreadBps + skew; // long → bid further from mid
    const askBps = askSpreadBps - skew; // long → ask closer to mid

    const desiredBid = fair * (1 - bidBps / 10000);
    const desiredAsk = fair * (1 + askBps / 10000);

    // Skip the cycle if quotes are fresh and both desired sides are live —
    // unless a hot-config change is pending reflection (configNeedsRequote):
    // a spread/skew change that moves quotes by less than the drift
    // threshold must still requote, otherwise the resting orders keep the
    // previous config.
    const bidDrift = Math.abs(desiredBid - this.currentBidPrice);
    const askDrift = Math.abs(desiredAsk - this.currentAskPrice);
    if (bidDrift < requoteThreshold && askDrift < requoteThreshold && !this.configNeedsRequote()) {
      const openOrders = this.tracker.getOpenOrdersByMarket(this.mmConfig.marketId);
      const wantBid = invRatio < maxInvFraction;
      const wantAsk = invRatio > -maxInvFraction;
      const hasBid = openOrders.some((o) => !o.isAsk);
      const hasAsk = openOrders.some((o) => o.isAsk);
      if ((wantBid && hasBid) || !wantBid) {
        if ((wantAsk && hasAsk) || !wantAsk) {
          return;
        }
      }
    }

    // Order operations gated by the user-defined cycle
    const { due } = this.cycleDue(this.lastCycleTime);
    if (!due) return;
    if (!this.checkMaxOrders()) return;

    const placeBid = invRatio < maxInvFraction;
    const placeAsk = invRatio > -maxInvFraction;

    const openOrders = this.tracker.getOpenOrdersByMarket(this.mmConfig.marketId);
    const cancels = openOrders
      .filter((o) => o.orderIndex > 0)
      .map((o) => ({ marketIndex: this.mmConfig.marketId, orderIndex: o.orderIndex }));

    const size = this.mmConfig.orderSize;
    const timeInForce = this.config.makerOnly ? 2 : 1; // POST_ONLY / GOOD_TILL_TIME

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

    if (placeBid && posSize < maxPos) {
      creates.push({
        marketIndex: this.mmConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredBid),
        isAsk: false,
        orderType: 0,
        timeInForce,
        selfTradeBehaviorMode: this.mmConfig.selfTradeBehavior,
        ...(this.mmConfig.builderIntegratorIndex !== undefined && { integratorAccountIndex: this.mmConfig.builderIntegratorIndex }),
        ...(this.mmConfig.integratorTakerFee !== undefined && { integratorTakerFee: this.mmConfig.integratorTakerFee }),
        ...(this.mmConfig.integratorMakerFee !== undefined && { integratorMakerFee: this.mmConfig.integratorMakerFee }),
      });
    }
    if (placeAsk && posSize > -maxPos) {
      creates.push({
        marketIndex: this.mmConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredAsk),
        isAsk: true,
        orderType: 0,
        timeInForce,
        selfTradeBehaviorMode: this.mmConfig.selfTradeBehavior,
        ...(this.mmConfig.builderIntegratorIndex !== undefined && { integratorAccountIndex: this.mmConfig.builderIntegratorIndex }),
        ...(this.mmConfig.integratorTakerFee !== undefined && { integratorTakerFee: this.mmConfig.integratorTakerFee }),
        ...(this.mmConfig.integratorMakerFee !== undefined && { integratorMakerFee: this.mmConfig.integratorMakerFee }),
      });
    }

    if (creates.length === 0 && cancels.length === 0) return;

    // Unknown order indexes (no WS confirmation yet) → cancel-all fallback
    if (cancels.length === 0 && openOrders.length > 0) {
      await this.cancelAllOnMarket();
    }

    const result = await this.getExecutor().requote({ cancels, creates });
    if (result.errors.length > 0) {
      logger.warning(`PerpMM requote errors: ${result.errors.join('; ')}`);
    }

    for (const c of creates) {
      this.tracker.registerOrder({
        clientOrderIndex: c.clientOrderIndex,
        marketId: this.mmConfig.marketId,
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