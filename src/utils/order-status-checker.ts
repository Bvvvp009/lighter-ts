/**
 * Order Status Checker - Verifies actual order execution
 * 
 * Checks order status by querying active and inactive orders from the Order API
 * Provides comprehensive status information with human-readable cancel reasons
 */

import { OrderApi } from '../api/order-api';
import { MarketHelper } from './market-helper';

export interface OrderStatusResult {
  found: boolean;
  status?: string;
  reason?: string;
  filledAmount?: string;
  remainingAmount?: string;
  order?: any;
}

/**
 * Get human-readable cancel reason from order status
 */
export function getCancelReason(status: string): string {
  const reasons: Record<string, string> = {
    'filled': '✅ Order successfully filled',
    'active': '⏳ Order is active and pending',
    'canceled': '❌ Order was canceled',
    'canceled-post-only': '❌ Order was canceled due to post-only constraint',
    'canceled-reduce-only': '❌ Order was canceled due to reduce-only constraint',
    'canceled-position-not-allowed': '❌ Position not allowed',
    'canceled-margin-not-allowed': '❌ Insufficient margin',
    'canceled-too-much-slippage': '❌ Too much slippage - execution price exceeded limit',
    'canceled-not-enough-liquidity': '❌ Not enough liquidity in the market',
    'canceled-self-trade': '❌ Self-trade detected',
    'canceled-expired': '❌ Order expired',
    'canceled-oco': '❌ OCO constraint violated',
    'canceled-child': '❌ Child order constraint violated',
    'canceled-liquidation': '❌ Liquidation constraint',
  };
  
  return reasons[status] || `⚠️ Unknown status: ${status}`;
}

/**
 * Check order status by querying Order API
 * Comprehensive order status checking with detailed information
 */
export async function checkOrderStatus(
  orderApi: OrderApi,
  accountIndex: number,
  marketId: number,
  clientOrderIndex: number | string,
  auth?: string,
  waitSeconds: number = 3
): Promise<OrderStatusResult> {
  // Wait for order to be processed
  await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
  
  // Check active orders first (open/pending)
  try {
    const activeOrders = await orderApi.getAccountActiveOrders(accountIndex, marketId, auth);
    
    for (const order of activeOrders) {
      const orderClientIndex = order.client_order_index?.toString() || order.client_order_id || order.id;
      const targetIndex = clientOrderIndex.toString();
      
      if (orderClientIndex === targetIndex || order.id === targetIndex) {
        return {
          found: true,
          status: order.status || 'active',
          reason: getCancelReason(order.status || 'active'),
          remainingAmount: order.remaining_base_amount || order.remaining_size || '0',
          filledAmount: order.filled_base_amount || order.filled_size || '0',
          order
        };
      }
    }
  } catch (error) {
    console.log(`⚠️ Could not check active orders: ${error}`);
  }
  
  // Check inactive orders (filled/cancelled)
  try {
    const inactiveOrders = await orderApi.getAccountInactiveOrders(accountIndex, 20, auth, marketId);
    
    for (const order of inactiveOrders) {
      const orderClientIndex = order.client_order_index?.toString() || order.client_order_id || order.id;
      const targetIndex = clientOrderIndex.toString();
      
      if (orderClientIndex === targetIndex || order.id === targetIndex) {
        return {
          found: true,
          status: order.status || 'unknown',
          reason: getCancelReason(order.status || 'unknown'),
          filledAmount: order.filled_base_amount || order.filled_size || '0',
          remainingAmount: order.remaining_base_amount || order.remaining_size || '0',
          order
        };
      }
    }
  } catch (error) {
    console.log(`⚠️ Could not check inactive orders: ${error}`);
  }
  
  return { found: false };
}

/**
 * Format order result for logging
 */
export function formatOrderResult(result: OrderStatusResult, clientOrderIndex: number): string {
  if (!result.found) {
    return `⚠️ Order ${clientOrderIndex} not found - may still be processing`;
  }
  
  if (result.status === 'filled') {
    return `✅ Order ${clientOrderIndex} successfully filled!`;
  }
  
  if (result.status?.startsWith('canceled')) {
    return `❌ Order ${clientOrderIndex} failed - ${result.reason}`;
  }
  
  return `⏳ Order ${clientOrderIndex} status: ${result.status}`;
}

