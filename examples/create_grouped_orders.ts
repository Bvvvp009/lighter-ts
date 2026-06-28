/**
 * Example: Create Grouped Orders (OTO/OCO/OTOCO)
 * 
 * This example demonstrates how to create grouped orders:
 * 1. OTO (One-Triggers-Other) - When parent order fills, child order is triggered
 * 2. OCO (One-Cancels-Other) - When one order fills, the other is cancelled
 * 3. OTOCO (One-Triggers-One-Cancels-Other) - Combination of OTO and OCO
 * 
 * IMPORTANT: For grouped orders, clientOrderIndex MUST be 0 (nil) for all orders in the group.
 */

import { SignerClient, MarketHelper, OrderApi, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createGroupedOrdersExample() {
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '1000', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log('🚀 Grouped Orders Example');

  const apiClient = new ApiClient({ host: BASE_URL });
  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Initialize market helper
    const orderApi = new OrderApi(apiClient);
    const market = new MarketHelper(0, orderApi);
    await market.initialize();

    const baseAmount = market.amountToUnits(0.01); // 0.01 ETH
    const currentPrice = market.priceToUnits(4400); // $4400
    const orderExpiry = Date.now() + (60 * 60 * 1000); // 1 hour

    // ============================================================================
    // Example 1: OTO (One-Triggers-Other)
    // Child order baseAmount MUST be 0 (nil) - it inherits size from parent
    // Child order isAsk MUST be opposite of parent (one triggers the other)
    // ============================================================================
    console.log('\n📋 Example 1: OTO (One-Triggers-Other)');
    const otoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount, // Parent order has the size
        price: currentPrice - 100, // Buy order $100 below market
        isAsk: SignerClient.BUY, // BUY
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.NOT_REDUCE_ONLY,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: orderExpiry,
      },
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: 0, // MUST be 0 (nil) - inherits size from parent
        price: currentPrice + 200, // Sell order $200 above entry
        isAsk: SignerClient.SELL, // SELL (take profit, opposite direction)
        orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: SignerClient.REDUCE_ONLY,
        triggerPrice: currentPrice + 200,
        orderExpiry: orderExpiry,
      },
    ];


    const [otoInfo, otoTxHash, otoError] = await signerClient.createGroupedOrders(
      1, // groupingType: 1 = OTO
      otoOrders
    );

    if (otoError) {
      console.error('❌ OTO orders failed:', otoError);
    } else {
      console.log('✅ OTO orders created:', otoTxHash);
      if (otoTxHash) { try { await signerClient.waitForTransaction(otoTxHash, 60000, 2000); } catch (e) { console.warn('   (confirmation poll timed out; tx may still be processing)'); } }
    }

    // ============================================================================
    // Example 2: OCO (One-Cancels-Other)
    // Protocol requires OCO legs to be a reduce-only Stop-Loss + Take-Profit pair
    // (closing an existing position) - not two arbitrary LIMIT orders. Both legs
    // MUST have the same isAsk direction, same baseAmount, both reduceOnly=1, and
    // the same non-nil orderExpiry.
    // ============================================================================
    console.log('\n📋 Example 2: OCO (One-Cancels-Other)');

    const ocoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount,
        price: currentPrice + 200, // Take-profit: sell $200 above market
        isAsk: SignerClient.SELL, // SELL to close a LONG position
        orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: SignerClient.REDUCE_ONLY,
        triggerPrice: currentPrice + 200,
        orderExpiry: orderExpiry,
      },
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount, // OCO orders must have same baseAmount
        price: currentPrice - 150, // Stop-loss: sell $150 below market
        isAsk: SignerClient.SELL, // SELL to close a LONG position
        orderType: SignerClient.ORDER_TYPE_STOP_LOSS,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: SignerClient.REDUCE_ONLY,
        triggerPrice: currentPrice - 150,
        orderExpiry: orderExpiry,
      },
    ];


    const [ocoInfo, ocoTxHash, ocoError] = await signerClient.createGroupedOrders(
      2, // groupingType: 2 = OCO
      ocoOrders
    );

    if (ocoError) {
      console.error('❌ OCO orders failed:', ocoError);
    } else {
      console.log('✅ OCO orders created:', ocoTxHash);
      if (ocoTxHash) { try { await signerClient.waitForTransaction(ocoTxHash, 60000, 2000); } catch (e) { console.warn('   (confirmation poll timed out; tx may still be processing)'); } }
    }

    // ============================================================================
    // Example 3: OTOCO (One-Triggers-One-Cancels-Other)
    // Parent has baseAmount, child orders MUST have baseAmount=0 (nil)
    // Children inherit size from parent; they must be opposite isAsk direction
    // ============================================================================
    console.log('\n📋 Example 3: OTOCO (One-Triggers-One-Cancels-Other)');

    const otocoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount, // Parent order has the size
        price: currentPrice - 100, // Parent: Buy limit $100 below market
        isAsk: SignerClient.BUY, // BUY
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.NOT_REDUCE_ONLY,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: orderExpiry,
      },
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: 0, // MUST be 0 (nil) - inherits size from parent
        price: currentPrice + 200, // Child 1: Take profit $200 above entry
        isAsk: SignerClient.SELL, // SELL (opposite direction, close position)
        orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
        triggerPrice: currentPrice + 200,
        orderExpiry: orderExpiry,
      },
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: 0, // MUST be 0 (nil) - inherits size from parent
        price: currentPrice - 150, // Child 2: Stop loss $150 below entry
        isAsk: SignerClient.SELL, // SELL (opposite direction, close position)
        orderType: SignerClient.ORDER_TYPE_STOP_LOSS,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
        reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
        triggerPrice: currentPrice - 150,
        orderExpiry: orderExpiry,
      },
    ];


    const [otocoInfo, otocoTxHash, otocoError] = await signerClient.createGroupedOrders(
      3, // groupingType: 3 = OTOCO
      otocoOrders
    );

    if (otocoError) {
      console.error('❌ OTOCO orders failed:', otocoError);
    } else {
      console.log('✅ OTOCO orders created:', otocoTxHash);
      if (otocoTxHash) { try { await signerClient.waitForTransaction(otocoTxHash, 60000, 2000); } catch (e) { console.warn('   (confirmation poll timed out; tx may still be processing)'); } }
    }
    console.log('\n✅ Examples completed');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('create_grouped_orders');
if (isMain) {
  createGroupedOrdersExample().catch(console.error);
}

export { createGroupedOrdersExample };


