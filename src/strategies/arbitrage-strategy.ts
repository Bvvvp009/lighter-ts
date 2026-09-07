import { StrategyBase, type StrategyConfig, type EditableConfigField } from './strategy-base';
import { logger } from '../utils/logger';

// ============================================================================
// Arbitrage / MM strategy configuration
// ============================================================================

export type FairPriceSource = 'mark' | 'index' | 'mid' | 'external';

export interface ArbitrageStrategyConfig extends StrategyConfig {
  /** Source for the fair price reference. */
  fairPriceSource: FairPriceSource;
  /** External fair price provider function (required if source='external'). */
  getExternalFairPrice?: () => Promise<number>;
  /**
   * Edge in price units from fair price for quoting (e.g. 5 = $5 from mid).
   * In taker mode, this is the minimum deviation to trigger a trade.
   * In maker mode, this is the half-spread we quote around fair.
   */
  threshold: number;
  /** Max order size per execution (in base units). */
  orderSize: number;
  /** Max slippage fraction for market orders (e.g. 0.001 = 0.1%). */
  maxSlippage: number;
  /**
   * @deprecated Use the shared `cycleMs` (StrategyConfig) instead. Kept as an
   * alias for old configs — if set, it seeds `cycleMs` when that is absent.
   */
  cooldownMs?: number;
  /**
   * If true, place POST_ONLY limit orders around fair price (maker MM).
   * If false, use IOC market orders when deviation exceeds threshold (taker arb).
   */
  makerExecution: boolean;
  /**
   * In maker mode: how many $ the quote must drift before we requote.
   * Larger = fewer cancels/replaces (lower API rate), smaller = tighter quotes.
   */
  requoteThreshold?: number;
  /**
   * Inventory skew fraction (0..1). When holding inventory, the quotes are
   * shifted toward the reducing side by this fraction of `threshold`.
   * E.g. 0.5 with threshold $20 and max position P: skew grows linearly
   * with |position|/P up to $10 toward the exit side.
   */
  inventorySkew?: number;
  /**
   * Fraction of maxPositionSize at which the strategy stops quoting the
   * entry side entirely and only quotes the exit (reducing) side.
   * Default 0.5 (= quote only reducing orders once at half max position).
   */
  maxInventoryFraction?: number;
}

export const DEFAULT_ARB_CONFIG: Partial<ArbitrageStrategyConfig> = {
  fairPriceSource: 'mark',
  threshold: 2,
  orderSize: 10000,
  maxSlippage: 0.001,
  cooldownMs: 500,
  makerExecution: false,
  requoteThreshold: 1,
  inventorySkew: 1.0,
  maxInventoryFraction: 0.5,
};

// ============================================================================
// ArbitrageStrategy
// ============================================================================

/**
 * Per-venue A_S (ask/bid spread) strategy with two modes:
 *
 * 1. Taker arbitrage (makerExecution=false):
 *    Detects when the venue's bid/ask deviates from a fair price (mark,
 *    index, or external) by more than `threshold` and crosses the spread
 *    with IOC market orders to capture the deviation.
 *
 * 2. Maker market-making (makerExecution=true):
 *    Continuously quotes a bid at fairPrice - threshold and an ask at
 *    fairPrice + threshold using POST_ONLY limit orders. Earns the spread.
 *    Requotes when the fair price moves more than `requoteThreshold`.
 */
export class ArbitrageStrategy extends StrategyBase {
  private arbConfig: ArbitrageStrategyConfig;
  private lastExecutionTime: number = 0;
  /** Current quote prices in human-readable $ (for drift detection) */
  private currentBidPrice: number = 0;
  private currentAskPrice: number = 0;
  /** Monotonic counter for clientOrderIndex (Date.now() collides) */
  private clientOrderCounter: number = 0;

  constructor(
    config: ArbitrageStrategyConfig,
    signerClient: any,
    wsPrivate: any,
    executor: any,
    tracker: any,
  ) {
    super(config, signerClient, wsPrivate, executor, tracker);
    this.arbConfig = { ...DEFAULT_ARB_CONFIG, ...config } as ArbitrageStrategyConfig;
  }

  get name(): string {
    return `Arb ${this.arbConfig.marketId}`;
  }

  /** Hot config: fold applied patches into the strategy config object. */
  protected override onConfigUpdated(patch: Partial<StrategyConfig>): void {
    Object.assign(this.arbConfig, patch);
  }

  /** Arb-specific editable fields for the dashboard config menu. */
  override getEditableConfig(): EditableConfigField[] {
    return [
      { key: 'threshold', label: 'Edge from fair ($)', kind: 'number', get: () => this.arbConfig.threshold },
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => this.arbConfig.orderSize },
      { key: 'maxSlippage', label: 'Max slippage (fraction)', kind: 'number', get: () => this.arbConfig.maxSlippage },
      { key: 'inventorySkew', label: 'Inventory skew (0..1)', kind: 'number', get: () => this.arbConfig.inventorySkew },
      { key: 'maxInventoryFraction', label: 'Max inventory fraction', kind: 'number', get: () => this.arbConfig.maxInventoryFraction },
      { key: 'maxPositionSize', label: 'Max position (base units)', kind: 'number', get: () => this.arbConfig.maxPositionSize },
      { key: 'requoteThreshold', label: 'Requote threshold ($)', kind: 'number', get: () => this.arbConfig.requoteThreshold },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => this.arbConfig.cycleMs },
      { key: 'leverage', label: 'Leverage (x, e.g. 2)', kind: 'number', get: () => this.arbConfig.leverage },
    ].filter((f) => f.key === 'leverage' || f.get() !== undefined) as EditableConfigField[];
  }

  /** Next collision-free clientOrderIndex. */
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

    // Get fair price
    const fairPrice = await this.getFairPrice();
    if (fairPrice <= 0) return;

    if (this.arbConfig.makerExecution) {
      await this.makerTick(fairPrice, md.bestBid, md.bestAsk);
    } else {
      await this.takerTick(fairPrice, md.bestBid, md.bestAsk);
    }
  }

  // --------------------------------------------------------------------------
  // Maker mode: continuously quote bid + ask around fair price
  // --------------------------------------------------------------------------

  /**
   * Maker MM tick:
   *
   * 1. Compute desired quotes with inventory skew: when long, both quotes
   *    shift down (ask closer to fair / through it, bid further away), so
   *    the position is favored to exit. Symmetric when short.
   * 2. Beyond maxInventoryFraction of max position, stop quoting the entry
   *    side entirely (only reducing orders) — active unwind.
   * 3. Requote = ONE batched tx (cancel old + place new) via executor.requote,
   *    instead of cancelAll + N separate placements.
   */
  private async makerTick(fairPrice: number, bestBid: number, bestAsk: number): Promise<void> {
    const threshold = this.arbConfig.threshold;
    const requoteThreshold = this.arbConfig.requoteThreshold ?? 1;
    const skewFactor = this.arbConfig.inventorySkew ?? 1.0;
    const maxInvFraction = this.arbConfig.maxInventoryFraction ?? 0.5;

    // Signed inventory in base units. The WS payload carries an unsigned
    // magnitude plus a separate `sign`, so this must not read `pos.size` alone.
    const posSize = this.signedPositionUnits(this.arbConfig.marketId);
    const maxPos = this.arbConfig.maxPositionSize;

    // Inventory ratio in [-1, 1] (sign preserved)
    const invRatio = maxPos > 0 ? Math.max(-1, Math.min(1, posSize / maxPos)) : 0;
    // $ skew toward the reducing side, linear in inventory (Avellaneda-
    // Stoikov style): when LONG both quotes shift DOWN — the bid moves away
    // from fair (harder to fill = less buying) and the ask moves toward fair
    // (easier to fill = more selling). Symmetric when short.
    const skew = skewFactor * threshold * invRatio;

    const desiredBid = fairPrice - threshold - skew;
    const desiredAsk = fairPrice + threshold - skew;

    // Check if we need to requote (fair price drifted beyond tolerance).
    // A pending hot-config edit (configNeedsRequote) forces through too:
    // threshold/size edits smaller than the drift tolerance must still
    // requote, or the resting orders keep quoting the OLD config.
    const bidDrift = Math.abs(desiredBid - this.currentBidPrice);
    const askDrift = Math.abs(desiredAsk - this.currentAskPrice);

    if (bidDrift < requoteThreshold && askDrift < requoteThreshold && !this.configNeedsRequote()) {
      // Quotes are still fresh — check if orders are still open on quoted sides
      const openOrders = this.tracker.getOpenOrdersByMarket(this.arbConfig.marketId);
      const wantBid = posSize < maxPos && invRatio < maxInvFraction;
      const wantAsk = posSize > -maxPos && invRatio > -maxInvFraction;
      const hasBid = openOrders.some((o) => !o.isAsk);
      const hasAsk = openOrders.some((o) => o.isAsk);
      if ((wantBid && hasBid) || !wantBid) {
        if ((wantAsk && hasAsk) || !wantAsk) {
          return; // desired sides are still quoted
        }
      }
    }

    // Drift detected (or a side is missing) — but order operations run at
    // most once per user-defined cycle (cycleMs, hummingbot-style).
    const { due, now } = this.cycleDue(this.lastExecutionTime);
    if (!due) return;

    // Check max orders
    if (!this.checkMaxOrders()) return;

    const size = this.arbConfig.orderSize;

    // Decide which sides to quote (entry side suppressed at maxInventoryFraction)
    const placeBid = posSize < maxPos && invRatio < maxInvFraction;
    const placeAsk = posSize > -maxPos && invRatio > -maxInvFraction;

    // Collect open orders to cancel (single batch with the new placements)
    const openOrders = this.tracker.getOpenOrdersByMarket(this.arbConfig.marketId);
    const cancels = openOrders
      .filter((o) => o.orderIndex > 0)
      .map((o) => ({ marketIndex: this.arbConfig.marketId, orderIndex: o.orderIndex }));

    const creates: Array<{
      marketIndex: number;
      clientOrderIndex: number;
      baseAmount: number;
      price: number;
      isAsk: boolean;
      orderType: number;
      timeInForce: number;
      selfTradeBehaviorMode?: number;
    }> = [];

    if (placeBid) {
      creates.push({
        marketIndex: this.arbConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredBid),
        isAsk: false,
        orderType: 0, // LIMIT
        timeInForce: this.config.makerOnly ? 2 : 1, // POST_ONLY / GOOD_TILL_TIME
        selfTradeBehaviorMode: this.arbConfig.selfTradeBehavior,
      });
    }
    if (placeAsk) {
      creates.push({
        marketIndex: this.arbConfig.marketId,
        clientOrderIndex: this.nextClientOrderIndex(),
        baseAmount: size,
        price: this.priceToUnits(desiredAsk),
        isAsk: true,
        orderType: 0,
        timeInForce: this.config.makerOnly ? 2 : 1,
        selfTradeBehaviorMode: this.arbConfig.selfTradeBehavior,
      });
    }

    // If nothing to place and nothing to cancel, nothing to do
    if (creates.length === 0 && cancels.length === 0) return;

    // Cancel-all + re-place only if we don't know individual order indexes yet;
    // otherwise use the atomic batch path (1 API request for the whole requote)
    if (cancels.length === 0 && openOrders.length > 0) {
      // Orders exist in tracker but without orderIndex (no WS confirmation yet)
      // — fall back to cancel-all to guarantee a clean slate.
      await this.cancelAllOnMarket();
    }

    if (creates.length > 0) {
      const result = await this.getExecutor().requote({ cancels, creates });
      if (result.errors.length > 0) {
        logger.warning(`Arb requote errors: ${result.errors.join('; ')}`);
      }
    } else if (cancels.length > 0) {
      // Only cancel (e.g. position limit hit on the remaining side)
      const result = await this.getExecutor().requote({ cancels, creates: [] });
      if (result.errors.length > 0) {
        logger.warning(`Arb cancel errors: ${result.errors.join('; ')}`);
      }
    }

    // Register placed orders with the tracker (for fill detection)
    for (let i = 0; i < creates.length; i++) {
      const c = creates[i];
      this.tracker.registerOrder({
        clientOrderIndex: c.clientOrderIndex,
        marketId: this.arbConfig.marketId,
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
    this.lastExecutionTime = Date.now();
    this.markConfigApplied(); // requote reflected the new config
  }

  // --------------------------------------------------------------------------
  // Taker mode: cross spread when deviation exceeds threshold
  // --------------------------------------------------------------------------

  private async takerTick(fairPrice: number, bestBid: number, bestAsk: number): Promise<void> {
    // Order operations gated by the user-defined cycle
    const { due, now } = this.cycleDue(this.lastExecutionTime);
    if (!due) return;

    const threshold = this.arbConfig.threshold;
    const baseScale = this.marketConfig?.baseScale ?? 1e5;

    // Check if venue bid is above fair + threshold -> sell (taker)
    if (bestBid > fairPrice + threshold) {
      const posSize = this.signedPositionUnits(this.arbConfig.marketId);
      if (posSize > -this.arbConfig.maxPositionSize) {
        await this.executeSell(bestBid, fairPrice);
        this.lastExecutionTime = now;
      }
    }

    // Check if venue ask is below fair - threshold -> buy (taker)
    if (bestAsk < fairPrice - threshold) {
      const posSize = this.signedPositionUnits(this.arbConfig.marketId);
      if (posSize < this.arbConfig.maxPositionSize) {
        await this.executeBuy(bestAsk, fairPrice);
        this.lastExecutionTime = now;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Fair price calculation
  // --------------------------------------------------------------------------

  private async getFairPrice(): Promise<number> {
    const md = this.getMarketData();
    if (!md) return 0;

    switch (this.arbConfig.fairPriceSource) {
      case 'mark':
        return md.markPrice;
      case 'index':
        return md.indexPrice;
      case 'mid':
        return md.midPrice;
      case 'external':
        if (this.arbConfig.getExternalFairPrice) {
          try {
            return await this.arbConfig.getExternalFairPrice();
          } catch (e) {
            logger.warning('External fair price fetch failed', {
              error: e instanceof Error ? e.message : String(e),
            });
            return 0;
          }
        }
        return 0;
      default:
        return 0;
    }
  }

  // --------------------------------------------------------------------------
  // Taker execution (IOC market orders)
  // --------------------------------------------------------------------------

  private async executeSell(venueBid: number, fairPrice: number): Promise<void> {
    const size = this.arbConfig.orderSize;
    const coi = this.nextClientOrderIndex();

    const maxPrice = this.priceToUnits(venueBid * (1 - this.arbConfig.maxSlippage));
    const result = await this.getExecutor().placeOrder({
      marketIndex: this.arbConfig.marketId,
      clientOrderIndex: coi,
      baseAmount: size,
      price: maxPrice,
      isAsk: true,
      orderType: 1, // MARKET
      timeInForce: 0, // IMMEDIATE_OR_CANCEL
      selfTradeBehaviorMode: this.arbConfig.selfTradeBehavior,
      integratorAccountIndex: this.arbConfig.builderIntegratorIndex,
      integratorTakerFee: this.arbConfig.integratorTakerFee,
      integratorMakerFee: this.arbConfig.integratorMakerFee,
    } as any);

    if (result.error) {
      logger.warning(`Arb sell failed: ${result.error}`);
    } else {
      logger.debug(`Arb SELL ${size} @ ${venueBid} (fair: ${fairPrice})`, {
        marketId: this.arbConfig.marketId,
        edge: venueBid - fairPrice,
      });
    }
  }

  private async executeBuy(venueAsk: number, fairPrice: number): Promise<void> {
    const size = this.arbConfig.orderSize;
    const coi = this.nextClientOrderIndex();

    const maxPrice = this.priceToUnits(venueAsk * (1 + this.arbConfig.maxSlippage));
    const result = await this.getExecutor().placeOrder({
      marketIndex: this.arbConfig.marketId,
      clientOrderIndex: coi,
      baseAmount: size,
      price: maxPrice,
      isAsk: false,
      orderType: 1, // MARKET
      timeInForce: 0, // IMMEDIATE_OR_CANCEL
      selfTradeBehaviorMode: this.arbConfig.selfTradeBehavior,
      integratorAccountIndex: this.arbConfig.builderIntegratorIndex,
      integratorTakerFee: this.arbConfig.integratorTakerFee,
      integratorMakerFee: this.arbConfig.integratorMakerFee,
    } as any);

    if (result.error) {
      logger.warning(`Arb buy failed: ${result.error}`);
    } else {
      logger.debug(`Arb BUY ${size} @ ${venueAsk} (fair: ${fairPrice})`, {
        marketId: this.arbConfig.marketId,
        edge: fairPrice - venueAsk,
      });
    }
  }
}