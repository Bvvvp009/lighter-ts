import { StrategyBase, type StrategyConfig, type EditableConfigField } from './strategy-base';
import { logger } from '../utils/logger';

// ============================================================================
// Grid strategy configuration
// ============================================================================

export interface GridStrategyConfig extends StrategyConfig {
  /** Number of grid levels on each side (bid + ask). */
  gridLevels: number;
  /** Spacing between grid levels in price units (e.g. 5 = $5). */
  gridSpacing: number;
  /** Order size per grid level (in base units, e.g. 10000 = 0.01 ETH). */
  orderSize: number;
  /** Center price for the grid. If omitted, auto-derived from mid. */
  centerPrice?: number;
  /** If true, the grid re-centers on the current mid price on each tick. */
  autoRecenter: boolean;
  /** Max deviation from center before re-leveling (in price units). */
  relevelThreshold: number;
}

export const DEFAULT_GRID_CONFIG: Partial<GridStrategyConfig> = {
  gridLevels: 5,
  gridSpacing: 5,
  orderSize: 10000,
  autoRecenter: true,
  relevelThreshold: 10,
};

// ============================================================================
// GridStrategy
// ============================================================================

/**
 * Per-venue grid market maker.
 *
 * Places N limit orders above and below a reference (center) price at fixed
 * spacing. When an order fills, a new order is placed on the opposite side
 * at the next grid level. Inventory is managed by skewing the grid center
 * when position grows.
 */
export class GridStrategy extends StrategyBase {
  private gridConfig: GridStrategyConfig;
  private currentCenter: number = 0;
  private lastRelevelPrice: number = 0;
  /** Track which grid levels have active orders */
  private activeLevels = new Set<number>(); // level index: positive = above, negative = below
  /** Monotonic counter for clientOrderIndex (Date.now() collides) */
  private clientOrderCounter: number = 0;
  /** Last order-operations cycle time (cycleMs gating) */
  private lastCycleTime: number = 0;

  constructor(
    config: GridStrategyConfig,
    signerClient: any,
    wsPrivate: any,
    executor: any,
    tracker: any,
  ) {
    super(config, signerClient, wsPrivate, executor, tracker);
    this.gridConfig = { ...DEFAULT_GRID_CONFIG, ...config } as GridStrategyConfig;
  }

  get name(): string {
    return `Grid ${this.gridConfig.marketId}`;
  }

  /**
   * Hot config: fold applied patches into the strategy-specific config
   * object too. `gridConfig` is a merged copy — without this, a
   * `updateConfig({ gridSpacing: ... })` would land in `this.config` but
   * the grid logic would keep reading the stale `gridConfig` value.
   */
  protected override onConfigUpdated(patch: Partial<StrategyConfig>): void {
    Object.assign(this.gridConfig, patch);
  }

  /** Grid-specific editable fields for the dashboard config menu. */
  override getEditableConfig(): EditableConfigField[] {
    return [
      { key: 'gridLevels', label: 'Grid levels per side', kind: 'number', get: () => this.gridConfig.gridLevels },
      { key: 'gridSpacing', label: 'Grid spacing ($)', kind: 'number', get: () => this.gridConfig.gridSpacing },
      { key: 'orderSize', label: 'Order size (base units)', kind: 'number', get: () => this.gridConfig.orderSize },
      { key: 'maxPositionSize', label: 'Max position (base units)', kind: 'number', get: () => this.gridConfig.maxPositionSize },
      { key: 'relevelThreshold', label: 'Relevel threshold ($)', kind: 'number', get: () => this.gridConfig.relevelThreshold },
      { key: 'cycleMs', label: 'Cycle (ms)', kind: 'number', get: () => this.gridConfig.cycleMs },
      { key: 'leverage', label: 'Leverage (x, e.g. 2)', kind: 'number', get: () => this.gridConfig.leverage },
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
    // Circuit breaker check
    if (this.circuitBreaker()) return;

    const md = this.getMarketData();
    if (!md || md.midPrice <= 0) return; // no market data yet

    // Determine center price
    const center = this.gridConfig.centerPrice ?? (this.gridConfig.autoRecenter ? md.midPrice : this.currentCenter);
    if (center <= 0) return;

    // Check if we need to re-level: mid drifted past the threshold, OR a
    // hot-config edit is pending reflection — a levels/spacing/size change
    // smaller than the drift threshold must still rebuild the grid, or the
    // resting orders keep quoting the OLD geometry.
    const needsRelevel = this.shouldRelevel(center, md.midPrice) || this.configNeedsRequote();

    // Order operations run at most once per user-defined cycle (cycleMs).
    const { due } = this.cycleDue(this.lastCycleTime);
    if (due) {
      if (needsRelevel) {
        await this.relevelGrid(center);
        this.currentCenter = center;
        this.lastRelevelPrice = md.midPrice;
        this.lastCycleTime = Date.now();
        this.markConfigApplied(); // grid rebuilt with the new config
      } else {
        // Check for filled levels that need replacing
        await this.refillFilledLevels(center);
        this.lastCycleTime = Date.now();
      }
    }

    // Inventory skew: if position grows, shift center
    this.applyInventorySkew();
  }

  // --------------------------------------------------------------------------
  // Grid logic
  // --------------------------------------------------------------------------

  private shouldRelevel(center: number, currentMid: number): boolean {
    if (this.currentCenter === 0) return true;
    const deviation = Math.abs(currentMid - this.currentCenter);
    return deviation >= this.gridConfig.relevelThreshold;
  }

  private async relevelGrid(center: number): Promise<void> {
    // Build the full new grid as ONE batched tx (cancels + creates).
    const levels = this.gridConfig.gridLevels;
    const spacing = this.gridConfig.gridSpacing;
    const size = this.gridConfig.orderSize;

    const cancels = this.tracker
      .getOpenOrdersByMarket(this.gridConfig.marketId)
      .filter((o) => o.orderIndex > 0)
      .map((o) => ({ marketIndex: this.gridConfig.marketId, orderIndex: o.orderIndex }));

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

    // clientOrderIndex -> the human price that create was built from. The
    // tracker matches refills by price, so a level has to be registered at the
    // price it was actually placed at rather than one re-derived for the whole
    // batch.
    const humanPrices = new Map<number, number>();

    for (let i = 1; i <= levels; i++) {
      // Bid below center
      const bidPrice = Math.round(center - i * spacing);
      if (bidPrice > 0) {
        const clientOrderIndex = this.nextClientOrderIndex();
        creates.push({
          marketIndex: this.gridConfig.marketId,
          clientOrderIndex,
          baseAmount: size,
          price: this.priceToUnits(bidPrice),
          isAsk: false,
          orderType: 0,
          timeInForce: this.config.makerOnly ? 2 : 1,
          selfTradeBehaviorMode: this.gridConfig.selfTradeBehavior,
          ...(this.gridConfig.builderIntegratorIndex !== undefined && { integratorAccountIndex: this.gridConfig.builderIntegratorIndex }),
          ...(this.gridConfig.integratorTakerFee !== undefined && { integratorTakerFee: this.gridConfig.integratorTakerFee }),
          ...(this.gridConfig.integratorMakerFee !== undefined && { integratorMakerFee: this.gridConfig.integratorMakerFee }),
        });
        humanPrices.set(clientOrderIndex, bidPrice);
        this.activeLevels.add(-i);
      }

      // Ask above center
      const askPrice = Math.round(center + i * spacing);
      const askClientOrderIndex = this.nextClientOrderIndex();
      creates.push({
        marketIndex: this.gridConfig.marketId,
        clientOrderIndex: askClientOrderIndex,
        baseAmount: size,
        price: this.priceToUnits(askPrice),
        isAsk: true,
        orderType: 0,
        timeInForce: this.config.makerOnly ? 2 : 1,
        selfTradeBehaviorMode: this.gridConfig.selfTradeBehavior,
        ...(this.gridConfig.builderIntegratorIndex !== undefined && { integratorAccountIndex: this.gridConfig.builderIntegratorIndex }),
        ...(this.gridConfig.integratorTakerFee !== undefined && { integratorTakerFee: this.gridConfig.integratorTakerFee }),
        ...(this.gridConfig.integratorMakerFee !== undefined && { integratorMakerFee: this.gridConfig.integratorMakerFee }),
      });
      humanPrices.set(askClientOrderIndex, askPrice);
      this.activeLevels.add(i);
    }

    // Single batched request for the whole re-level (or cancel-all fallback
    // if order indexes are not yet known from WS).
    if (cancels.length === 0 && this.tracker.getOpenOrdersByMarket(this.gridConfig.marketId).length > 0) {
      await this.cancelAllOnMarket();
    }

    // The venue caps one batch at 15 txs and requote() rejects an oversized
    // batch whole. A relevel is cancels + 2*levels creates, which passes the
    // cap at 4 levels with a full book -- and sooner once stragglers from an
    // earlier failure are still resting -- so without splitting, the grid
    // silently stops relevelling. Cancels go first and creates after: that
    // costs a moment with no quotes, where the other order would rest the new
    // grid alongside the old one and double exposure.
    const MAX_BATCH_TX = 15;
    const placed: typeof creates = [];
    const errors: string[] = [];

    if (cancels.length + creates.length <= MAX_BATCH_TX) {
      const r = await this.getExecutor().requote({ cancels, creates });
      errors.push(...r.errors);
      if (r.errors.length === 0) placed.push(...creates);
    } else {
      for (let i = 0; i < cancels.length; i += MAX_BATCH_TX) {
        const r = await this.getExecutor().requote({
          cancels: cancels.slice(i, i + MAX_BATCH_TX),
          creates: [],
        });
        errors.push(...r.errors);
      }
      for (let i = 0; i < creates.length; i += MAX_BATCH_TX) {
        const chunk = creates.slice(i, i + MAX_BATCH_TX);
        const r = await this.getExecutor().requote({ cancels: [], creates: chunk });
        errors.push(...r.errors);
        if (r.errors.length === 0) placed.push(...chunk);
      }
    }

    if (errors.length > 0) {
      logger.warning(`Grid relevel errors: ${errors.join('; ')}`);
    }

    // Register only the creates that actually went out. Registering one whose
    // batch was rejected leaves the tracker holding an order the venue never
    // saw; the next relevel then builds a cancel for that phantom, the batch
    // grows by one every cycle, and the grid wedges for good. Orders that did
    // land but are missed here are recovered from the WS feed, which creates a
    // tracker entry for any order it has no record of.
    for (const c of placed) {
      const humanPrice = humanPrices.get(c.clientOrderIndex);
      // Unreachable: every create above records its price. Skipping beats
      // registering a wrong one, which is what `refillFilledLevels` would then
      // act on.
      if (humanPrice === undefined) continue;
      this.tracker.registerOrder({
        clientOrderIndex: c.clientOrderIndex,
        marketId: this.gridConfig.marketId,
        isAsk: c.isAsk,
        price: humanPrice,
        baseAmount: c.baseAmount,
        orderType: 'limit',
        timeInForce: this.config.makerOnly ? 'post-only' : 'good-till-time',
        reduceOnly: false,
      });
    }

    logger.debug(`Grid re-leveled at ${center}`, {
      levels: this.activeLevels.size,
      marketId: this.gridConfig.marketId,
    });
  }

  private async refillFilledLevels(center: number): Promise<void> {
    const spacing = this.gridConfig.gridSpacing;
    const size = this.gridConfig.orderSize;
    const levels = this.gridConfig.gridLevels;

    // Check open orders — if a level is missing, replace it
    const openOrders = this.tracker.getOpenOrdersByMarket(this.gridConfig.marketId);
    const activePrices = new Set(openOrders.map((o) => o.price));

    for (let i = 1; i <= levels; i++) {
      const bidPrice = Math.round(center - i * spacing);
      const askPrice = Math.round(center + i * spacing);

      // Check if bid level is missing
      if (!activePrices.has(bidPrice) && bidPrice > 0 && this.checkMaxOrders()) {
        // Check if we have room to add (inventory limit).
        // WS position size is in HUMAN units; convert to base units.
        const pos = this.tracker.getPosition(this.gridConfig.marketId);
        const baseScale = this.marketConfig?.baseScale ?? 1e6;
        const currentPosSize = pos ? Math.abs(pos.size) * baseScale : 0;
        if (currentPosSize < this.gridConfig.maxPositionSize) {
          const coi = this.nextClientOrderIndex();
          await this.placeLimitOrder(coi, bidPrice, size, false);
        }
      }

      // Check if ask level is missing
      if (!activePrices.has(askPrice) && this.checkMaxOrders()) {
        const pos = this.tracker.getPosition(this.gridConfig.marketId);
        const baseScale = this.marketConfig?.baseScale ?? 1e6;
        const currentPosSize = pos ? Math.abs(pos.size) * baseScale : 0;
        if (currentPosSize < this.gridConfig.maxPositionSize) {
          const coi = this.nextClientOrderIndex();
          await this.placeLimitOrder(coi, askPrice, size, true);
        }
      }
    }
  }

  private applyInventorySkew(): void {
    const pos = this.tracker.getPosition(this.gridConfig.marketId);
    if (!pos || pos.sign === 0) return;

    // If we're long, we want to sell more → shift center up
    // If we're short, we want to buy more → shift center down
    // WS position size is in HUMAN units; convert to base units.
    const baseScale = this.marketConfig?.baseScale ?? 1e6;
    const inventoryRatio = (Math.abs(pos.size) * baseScale) / this.gridConfig.maxPositionSize;
    if (inventoryRatio > 0.5) {
      const skewAmount = (inventoryRatio - 0.5) * 2 * this.gridConfig.gridSpacing;
      this.currentCenter = pos.sign > 0
        ? this.currentCenter + skewAmount
        : this.currentCenter - skewAmount;
    }
  }
}