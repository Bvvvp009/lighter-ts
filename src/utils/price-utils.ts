/**
 * Price Utilities with Market Index Support
 * Provides price conversion and market-specific utilities
 */

import { OrderApi, OrderBookDetailItem } from '../api/order-api';

export interface MarketConfig {
  index: number;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  baseScale: number;    // Base asset decimal places (e.g., ETH = 4 decimals = 10000)
  quoteScale: number;   // Quote asset decimal places (e.g., USDC = 2 decimals = 100)
  minOrderSize: number; // Minimum order size in base units
  tickSize: number;     // Minimum price increment
  lastTradePrice?: number; // Last trade price
}

// Cache for market configurations
const marketConfigCache: Map<number, MarketConfig> = new Map();

/**
 * Fetch market configuration from API
 */
export async function fetchMarketConfig(marketId: number, orderApi: OrderApi): Promise<MarketConfig> {
  // Check cache first
  if (marketConfigCache.has(marketId)) {
    return marketConfigCache.get(marketId)!;
  }

  try {
    const response = await orderApi.getOrderBookDetailsRaw(marketId);
    
    if (response.code === 200 && response.order_book_details.length > 0) {
      const details = response.order_book_details[0];
      
      // Calculate scales from decimals
      const baseScale = Math.pow(10, details.size_decimals);
      const quoteScale = Math.pow(10, details.price_decimals);
      
      const config: MarketConfig = {
        index: marketId,
        name: details.symbol,
        baseAsset: details.symbol,
        quoteAsset: 'USD', // Assuming USD quote
        baseScale,
        quoteScale,
        minOrderSize: parseFloat(details.min_base_amount) * baseScale,
        tickSize: Math.pow(10, -(details.price_decimals - details.supported_price_decimals)),
        lastTradePrice: details.last_trade_price
      };
      
      // Cache the configuration
      marketConfigCache.set(marketId, config);
      return config;
    }
    
    throw new Error(`Market ${marketId} not found`);
  } catch (error) {
    throw new Error(`Failed to fetch market config for market ${marketId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get cached market configuration or fetch if not available
 */
export async function getMarketConfig(marketId: number, orderApi?: OrderApi): Promise<MarketConfig> {
  if (marketConfigCache.has(marketId)) {
    return marketConfigCache.get(marketId)!;
  }
  
  if (!orderApi) {
    throw new Error(`Market ${marketId} not configured and no OrderApi provided`);
  }
  
  return fetchMarketConfig(marketId, orderApi);
}

// Static market configurations for fallback
export const MARKETS: Record<number, MarketConfig> = {
  0: {
    index: 0,
    name: 'ETH/USD',
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    baseScale: 10000,    // 1 ETH = 10,000 units (4 decimals)
    quoteScale: 100,     // 1 USD = 100 units (2 decimals)
    minOrderSize: 100,   // 0.01 ETH minimum
    tickSize: 1          // 0.01 USD minimum price increment
  },
  // Add more markets as needed
};

/**
 * Convert human-readable price to exchange units
 */
export async function priceToUnits(price: number, marketIndex: number, orderApi?: OrderApi): Promise<number> {
  const market = await getMarketConfig(marketIndex, orderApi);
  return Math.round(price * market.quoteScale);
}

/**
 * Convert exchange units to human-readable price
 */
export async function unitsToPrice(units: number, marketIndex: number, orderApi?: OrderApi): Promise<number> {
  const market = await getMarketConfig(marketIndex, orderApi);
  return units / market.quoteScale;
}

/**
 * Convert human-readable amount to exchange units
 */
export async function amountToUnits(amount: number, marketIndex: number, orderApi?: OrderApi): Promise<number> {
  const market = await getMarketConfig(marketIndex, orderApi);
  return Math.round(amount * market.baseScale);
}

/**
 * Convert exchange units to human-readable amount
 */
export async function unitsToAmount(units: number, marketIndex: number, orderApi?: OrderApi): Promise<number> {
  const market = await getMarketConfig(marketIndex, orderApi);
  return units / market.baseScale;
}

/**
 * Synchronous versions using static config (for backwards compatibility)
 */
export function priceToUnitsSync(price: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return Math.round(price * market.quoteScale);
}

export function unitsToPriceSync(units: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return units / market.quoteScale;
}

export function amountToUnitsSync(amount: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return Math.round(amount * market.baseScale);
}

export function unitsToAmountSync(units: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return units / market.baseScale;
}

/**
 * Format price for display
 */
export async function formatPrice(units: number, marketIndex: number, orderApi?: OrderApi, decimals: number = 2): Promise<string> {
  const price = await unitsToPrice(units, marketIndex, orderApi);
  return price.toFixed(decimals);
}

/**
 * Format amount for display
 */
export async function formatAmount(units: number, marketIndex: number, orderApi?: OrderApi, decimals: number = 4): Promise<string> {
  const amount = await unitsToAmount(units, marketIndex, orderApi);
  return amount.toFixed(decimals);
}

/**
 * Calculate percentage change between prices
 */
export function calculatePercentageChange(currentPrice: number, previousPrice: number): number {
  if (previousPrice === 0) return 0;
  return ((currentPrice - previousPrice) / previousPrice) * 100;
}

/**
 * Calculate SL/TP prices based on percentage
 */
export function calculateSLPrice(entryPrice: number, percentage: number, isLongPosition: boolean): number {
  if (isLongPosition) {
    return entryPrice * (1 - percentage / 100); // SL below entry for LONG
  } else {
    return entryPrice * (1 + percentage / 100); // SL above entry for SHORT
  }
}

export function calculateTPPrice(entryPrice: number, percentage: number, isLongPosition: boolean): number {
  if (isLongPosition) {
    return entryPrice * (1 + percentage / 100); // TP above entry for LONG
  } else {
    return entryPrice * (1 - percentage / 100); // TP below entry for SHORT
  }
}

/**
 * Validate order size against market minimum
 */
export async function validateOrderSize(amount: number, marketIndex: number, orderApi?: OrderApi): Promise<boolean> {
  const market = await getMarketConfig(marketIndex, orderApi);
  const units = await amountToUnits(amount, marketIndex, orderApi);
  return units >= market.minOrderSize;
}

/**
 * Round price to valid tick size
 */
export async function roundToTickSize(price: number, marketIndex: number, orderApi?: OrderApi): Promise<number> {
  const market = await getMarketConfig(marketIndex, orderApi);
  const tickSizePrice = market.tickSize / market.quoteScale;
  return Math.round(price / tickSizePrice) * tickSizePrice;
}

/**
 * Get market info by index
 */
export async function getMarketInfo(marketIndex: number, orderApi?: OrderApi): Promise<MarketConfig | null> {
  try {
    return await getMarketConfig(marketIndex, orderApi);
  } catch {
    return MARKETS[marketIndex] || null;
  }
}

/**
 * List all available markets
 */
export function getAllMarkets(): MarketConfig[] {
  return Object.values(MARKETS);
}

/**
 * Export MarketHelper for convenience
 */
export { MarketHelper } from './market-helper';