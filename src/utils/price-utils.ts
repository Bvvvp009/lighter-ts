/**
 * Price Utilities with Market Index Support
 * Provides price conversion and market-specific utilities
 */

export interface MarketConfig {
  index: number;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  baseScale: number;    // Base asset decimal places (e.g., ETH = 4 decimals = 10000)
  quoteScale: number;   // Quote asset decimal places (e.g., USDC = 2 decimals = 100)
  minOrderSize: number; // Minimum order size in base units
  tickSize: number;     // Minimum price increment
}

// Market configurations
export const MARKETS: Record<number, MarketConfig> = {
  0: {
    index: 0,
    name: 'ETH/USDC',
    baseAsset: 'ETH',
    quoteAsset: 'USDC',
    baseScale: 10000,    // 1 ETH = 10,000 units (4 decimals)
    quoteScale: 100,     // 1 USDC = 100 units (2 decimals)
    minOrderSize: 100,   // 0.01 ETH minimum
    tickSize: 1          // 0.01 USDC minimum price increment
  },
  // Add more markets as needed
  // 1: { ... },
};

/**
 * Convert human-readable price to exchange units
 */
export function priceToUnits(price: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return Math.round(price * market.quoteScale);
}

/**
 * Convert exchange units to human-readable price
 */
export function unitsToPrice(units: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return units / market.quoteScale;
}

/**
 * Convert human-readable amount to exchange units
 */
export function amountToUnits(amount: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return Math.round(amount * market.baseScale);
}

/**
 * Convert exchange units to human-readable amount
 */
export function unitsToAmount(units: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  return units / market.baseScale;
}

/**
 * Format price for display
 */
export function formatPrice(units: number, marketIndex: number, decimals: number = 2): string {
  const price = unitsToPrice(units, marketIndex);
  return price.toFixed(decimals);
}

/**
 * Format amount for display
 */
export function formatAmount(units: number, marketIndex: number, decimals: number = 4): string {
  const amount = unitsToAmount(units, marketIndex);
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
export function validateOrderSize(amount: number, marketIndex: number): boolean {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  const units = amountToUnits(amount, marketIndex);
  return units >= market.minOrderSize;
}

/**
 * Round price to valid tick size
 */
export function roundToTickSize(price: number, marketIndex: number): number {
  const market = MARKETS[marketIndex];
  if (!market) {
    throw new Error(`Market index ${marketIndex} not found`);
  }
  
  const tickSizePrice = market.tickSize / market.quoteScale;
  return Math.round(price / tickSizePrice) * tickSizePrice;
}

/**
 * Get market info by index
 */
export function getMarketInfo(marketIndex: number): MarketConfig | null {
  return MARKETS[marketIndex] || null;
}

/**
 * List all available markets
 */
export function getAllMarkets(): MarketConfig[] {
  return Object.values(MARKETS);
}
