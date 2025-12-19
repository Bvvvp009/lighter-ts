/**
 * Example: Create Position-Tied Stop Loss and Take Profit Orders
 * 
 * This example demonstrates how to create position-tied SL/TP orders using OCO (One-Cancels-Other) grouping.
 * 
 * Key features:
 * - BaseAmount=0 means the orders will close your entire position
 * - Orders automatically adjust as your position size changes
 * - Orders are canceled when position reaches 0 or changes sign (long <-> short)
 * - Uses OCO grouping so when one order fills, the other is canceled
 */

import { SignerClient, MarketHelper, OrderApi, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function createPositionTiedSLTPExample() {
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '1000', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log('🚀 Position-Tied SL/TP Example\n');
  console.log(`   Account: ${ACCOUNT_INDEX}, API Key: ${API_KEY_INDEX}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

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

    const currentPrice = market.priceToUnits(4400); // $4400
    const orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000); // 28 days

    // ============================================================================
    // Example: Position-Tied SL/TP for SHORT Position
    // ============================================================================
    console.log('📋 Creating Position-Tied SL/TP for SHORT Position');
    console.log('   These orders will close your entire short position\n');

    // For a SHORT position:
    // - Stop Loss: Buy order at higher price (if price goes up, you lose)
    // - Take Profit: Buy order at lower price (if price goes down, you profit)

    const stopLossOrder = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = close entire position
      price: market.priceToUnits(4500), // Limit price $4500 (higher than trigger)
      isAsk: SignerClient.BUY, // BUY (to close short position)
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(4450), // Trigger at $4450
      orderExpiry: orderExpiry,
    };

    const takeProfitOrder = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = close entire position
      price: market.priceToUnits(1550), // Limit price $1550 (lower than trigger)
      isAsk: SignerClient.BUY, // BUY (to close short position)
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(1500), // Trigger at $1500
      orderExpiry: orderExpiry,
    };

    console.log('   Stop Loss Order:');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(4450)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(4500)));
    console.log('     Action: BUY to close short (if price goes up)');
    console.log('');
    console.log('   Take Profit Order:');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(1500)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(1550)));
    console.log('     Action: BUY to close short (if price goes down)');
    console.log('');
    console.log('   Note: Limit price should be higher than trigger price for better fill rate');
    console.log('   Note: When one order fills, the other is automatically canceled (OCO)\n');

    const [orderInfo, txHash, error] = await signerClient.createGroupedOrders(
      2, // OCO grouping (One-Cancels-Other)
      [stopLossOrder, takeProfitOrder]
    );

    if (error) {
      console.error('❌ Failed to create position-tied SL/TP orders:', error);
    } else {
      console.log('✅ Position-tied SL/TP orders created successfully!');
      console.log('🔗 Transaction Hash:', txHash);
      console.log('');
      console.log('📊 Order Behavior:');
      console.log('   - Orders will close your entire position (BaseAmount=0)');
      console.log('   - Orders automatically adjust as position size changes');
      console.log('   - Orders cancel when position reaches 0 or changes sign');
      console.log('   - When one order fills, the other is canceled (OCO)');
      
      if (txHash) {
        await signerClient.waitForTransaction(txHash, 60000, 2000);
      }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // ============================================================================
    // Example: Position-Tied SL/TP for LONG Position
    // ============================================================================
    console.log('📋 Creating Position-Tied SL/TP for LONG Position');
    console.log('   These orders will close your entire long position\n');

    // For a LONG position:
    // - Stop Loss: Sell order at lower price (if price goes down, you lose)
    // - Take Profit: Sell order at higher price (if price goes up, you profit)

    const stopLossOrderLong = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = close entire position
      price: market.priceToUnits(4050), // Limit price $4050 (lower than trigger)
      isAsk: SignerClient.SELL, // SELL (to close long position)
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(4000), // Trigger at $4000
      orderExpiry: orderExpiry,
    };

    const takeProfitOrderLong = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = close entire position
      price: market.priceToUnits(4800), // Limit price $4800 (higher than trigger)
      isAsk: SignerClient.SELL, // SELL (to close long position)
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(4750), // Trigger at $4750
      orderExpiry: orderExpiry,
    };

    console.log('   Stop Loss Order:');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(4000)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(4050)));
    console.log('     Action: SELL to close long (if price goes down)');
    console.log('');
    console.log('   Take Profit Order:');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(4750)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(4800)));
    console.log('     Action: SELL to close long (if price goes up)');
    console.log('');

    const [orderInfo2, txHash2, error2] = await signerClient.createGroupedOrders(
      2, // OCO grouping (One-Cancels-Other)
      [stopLossOrderLong, takeProfitOrderLong]
    );

    if (error2) {
      console.error('❌ Failed to create position-tied SL/TP orders:', error2);
    } else {
      console.log('✅ Position-tied SL/TP orders created successfully!');
      console.log('🔗 Transaction Hash:', txHash2);
      
      if (txHash2) {
        await signerClient.waitForTransaction(txHash2, 60000, 2000);
      }
    }

    console.log('\n📝 Key Points:');
    console.log('   - BaseAmount=0 means "close entire position"');
    console.log('   - Orders automatically adjust to current position size');
    console.log('   - Orders cancel when position = 0 or changes sign');
    console.log('   - Use OCO grouping so one order cancels the other');
    console.log('   - Set limit price higher than trigger for better fill rate');

    console.log('\n🎉 Position-tied SL/TP examples completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
  }
}

if (require.main === module) {
  createPositionTiedSLTPExample().catch(console.error);
}

export { createPositionTiedSLTPExample };

