/**
 * Trading-related type definitions
 * Centralized types for orders, trades, and trading operations
 */

// Order Types
export enum OrderType {
  LIMIT = 0,
  MARKET = 1,
  STOP_LOSS = 2,
  STOP_LOSS_LIMIT = 3,
  TAKE_PROFIT = 4,
  TAKE_PROFIT_LIMIT = 5,
  TWAP = 6
}

export enum TimeInForce {
  IMMEDIATE_OR_CANCEL = 0,
  GOOD_TILL_TIME = 1,
  POST_ONLY = 2
}

// Order Interfaces
export interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType?: OrderType;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  triggerPrice?: number;
  orderExpiry?: number;
}

export interface CreateMarketOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  avgExecutionPrice: number;
  isAsk: boolean;
  reduceOnly?: boolean;
}

export interface CancelOrderParams {
  marketIndex: number;
  orderIndex: number;
}

