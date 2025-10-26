/**
 * Market Helper - Simplified market utilities
 * Initialize once, use anywhere without passing marketIndex/orderApi repeatedly
 */

import { OrderApi } from '../api/order-api';
import { fetchMarketConfig, MarketConfig } from './price-utils';

export class MarketHelper {
  private marketIndex: number;
  private orderApi: OrderApi;
  private marketConfig?: MarketConfig;
  private initialized: boolean = false;

  constructor(marketIndex: number, orderApi: OrderApi) {
    this.marketIndex = marketIndex;
    this.orderApi = orderApi;
  }

  /**
   * Initialize and fetch market configuration (call once)
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.marketConfig) {
      return;
    }

    this.marketConfig = await fetchMarketConfig(this.marketIndex, this.orderApi);
    this.initialized = true;
  }

  /**
   * Get market configuration
   */
  getConfig(): MarketConfig {
    if (!this.marketConfig) {
      throw new Error('Market not initialized. Call initialize() first.');
    }
    return this.marketConfig;
  }

  /**
   * Convert human-readable price to exchange units
   */
  priceToUnits(price: number): number {
    const config = this.getConfig();
    return Math.round(price * config.quoteScale);
  }

  /**
   * Convert exchange units to human-readable price
   */
  unitsToPrice(units: number): number {
    const config = this.getConfig();
    return units / config.quoteScale;
  }

  /**
   * Convert human-readable amount to exchange units
   */
  amountToUnits(amount: number): number {
    const config = this.getConfig();
    return Math.round(amount * config.baseScale);
  }

  /**
   * Convert exchange units to human-readable amount
   */
  unitsToAmount(units: number): number {
    const config = this.getConfig();
    return units / config.baseScale;
  }

  /**
   * Format price for display
   */
  formatPrice(units: number, decimals: number = 2): string {
    return this.unitsToPrice(units).toFixed(decimals);
  }

  /**
   * Format amount for display
   */
  formatAmount(units: number, decimals: number = 4): string {
    return this.unitsToAmount(units).toFixed(decimals);
  }

  /**
   * Get market name
   */
  get marketName(): string {
    return this.getConfig().name;
  }

  /**
   * Get last trade price
   */
  get lastPrice(): number {
    return this.getConfig().lastTradePrice || 0;
  }

  /**
   * Get base asset
   */
  get baseAsset(): string {
    return this.getConfig().baseAsset;
  }

  /**
   * Get quote asset
   */
  get quoteAsset(): string {
    return this.getConfig().quoteAsset;
  }
}

