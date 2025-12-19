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
    // ============================================================================
    console.log('\n📋 Example 1: OTO (One-Triggers-Other)');
    const otoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount,
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
        baseAmount: baseAmount,
        price: currentPrice + 200, // Sell order $200 above entry
        isAsk: SignerClient.SELL, // SELL (take profit)
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.NOT_REDUCE_ONLY,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
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
      console.log('✅ OTO orders created:', otoTxHash?.substring(0, 16) + '...');
      if (otoTxHash) await signerClient.waitForTransaction(otoTxHash, 60000, 2000);
    }

    console.log('\n📋 Example 2: OCO (One-Cancels-Other)');

    const ocoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount,
        price: currentPrice - 50, // Buy limit $50 below market
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
        baseAmount: baseAmount,
        price: currentPrice + 50, // Sell limit $50 above market
        isAsk: SignerClient.SELL, // SELL
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.NOT_REDUCE_ONLY,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
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
      console.log('✅ OCO orders created:', ocoTxHash?.substring(0, 16) + '...');
      if (ocoTxHash) await signerClient.waitForTransaction(ocoTxHash, 60000, 2000);
    }

    console.log('\n📋 Example 3: OTOCO (One-Triggers-One-Cancels-Other)');

    const otocoOrders = [
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount,
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
        baseAmount: baseAmount,
        price: currentPrice + 200, // Child 1: Take profit $200 above entry
        isAsk: SignerClient.SELL, // SELL
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.NOT_REDUCE_ONLY,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: orderExpiry,
      },
      {
        marketIndex: 0,
        clientOrderIndex: 0, // MUST be 0 for grouped orders
        baseAmount: baseAmount,
        price: currentPrice - 150, // Child 2: Stop loss $150 below entry
        isAsk: SignerClient.SELL, // SELL
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only (stop loss)
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
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
      console.log('✅ OTOCO orders created:', otocoTxHash?.substring(0, 16) + '...');
      if (otocoTxHash) await signerClient.waitForTransaction(otocoTxHash, 60000, 2000);
    }
    console.log('\n✅ Examples completed');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
  }
}

if (require.main === module) {
  createGroupedOrdersExample().catch(console.error);
}

export { createGroupedOrdersExample };


