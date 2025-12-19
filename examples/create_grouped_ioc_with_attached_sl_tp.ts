/**
 * Example: Create IOC Order with Attached Stop Loss and Take Profit
 * 
 * This example demonstrates how to create an Immediate-Or-Cancel (IOC) order
 * with attached Stop Loss and Take Profit orders using OTOCO grouping.
 * 
 * Key features:
 * - Parent order: IOC limit order (executes immediately or cancels)
 * - Child orders: SL/TP that trigger when parent order fills
 * - Uses OTOCO (One-Triggers-One-Cancels-Other) grouping
 * - SL/TP orders size matches executed size of parent order
 */

import { SignerClient, MarketHelper, OrderApi, ApiClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();


async function createGroupedIOCWithAttachedSLTPExample() {
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '1000', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log('🚀 IOC Order with Attached SL/TP Example\n');
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

    const baseAmount = market.amountToUnits(0.1); // 0.1 ETH
    const currentPrice = market.priceToUnits(4400); // $4400
    const sellPrice = market.priceToUnits(2500); // Sell at $2500
    const orderExpiry = Date.now() + (28 * 24 * 60 * 60 * 1000); // 28 days

    // ============================================================================
    // Example: Sell IOC Order with Attached SL/TP
    // ============================================================================
    console.log('📋 Creating Sell IOC Order with Attached SL/TP');
    console.log('   Parent: Sell 0.1 ETH at $2500 (IOC)');
    console.log('   Child 1: Take Profit at $1500');
    console.log('   Child 2: Stop Loss at $5000');
    console.log('   SL/TP size will match executed size of parent order\n');

    // Parent order: IOC sell order
    const iocOrder = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: baseAmount, // 0.1 ETH
      price: sellPrice, // $2500
      isAsk: SignerClient.SELL, // SELL
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL, // IOC
      reduceOnly: SignerClient.NOT_REDUCE_ONLY,
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: 0, // IOC orders don't need expiry
    };

    // Child order 1: Take Profit (buy back at lower price)
    // Triggered when parent order fills
    const takeProfitOrder = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = size matches executed parent order
      price: market.priceToUnits(1550), // Limit price $1550 (higher than trigger)
      isAsk: SignerClient.BUY, // BUY (to close short position)
      orderType: SignerClient.ORDER_TYPE_TAKE_PROFIT_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(1500), // Trigger at $1500
      orderExpiry: orderExpiry,
    };

    // Child order 2: Stop Loss (buy back at higher price)
    // Cancelled when take profit triggers
    const stopLossOrder = {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 0, // 0 = size matches executed parent order
      price: market.priceToUnits(5050), // Limit price $5050 (higher than trigger)
      isAsk: SignerClient.BUY, // BUY (to close short position)
      orderType: SignerClient.ORDER_TYPE_STOP_LOSS_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: SignerClient.REDUCE_ONLY, // Reduce only
      triggerPrice: market.priceToUnits(5000), // Trigger at $5000
      orderExpiry: orderExpiry,
    };

    console.log('   Parent Order (IOC):');
    console.log('     Type: Immediate-Or-Cancel');
    console.log('     Action: SELL 0.1 ETH at $' + market.unitsToPrice(sellPrice));
    console.log('     Behavior: Executes immediately or cancels');
    console.log('');
    console.log('   Child Order 1 (Take Profit):');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(1500)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(1550)));
    console.log('     Action: BUY to close short (triggers when parent fills)');
    console.log('     Size: Matches executed size of parent order');
    console.log('');
    console.log('   Child Order 2 (Stop Loss):');
    console.log('     Trigger: $' + market.unitsToPrice(market.priceToUnits(5000)));
    console.log('     Limit: $' + market.unitsToPrice(market.priceToUnits(5050)));
    console.log('     Action: BUY to close short (cancelled when TP triggers)');
    console.log('     Size: Matches executed size of parent order');
    console.log('');
    console.log('   Grouping: OTOCO (One-Triggers-One-Cancels-Other)');
    console.log('     - Parent triggers Child 1 (Take Profit)');
    console.log('     - Child 1 cancels Child 2 (Stop Loss)');
    console.log('');

    // OTOCO grouping type = 3
    // Grouping types: 1=OTO, 2=OCO, 3=OTOCO
    const groupingType = 3; // OTOCO (One-Triggers-One-Cancels-Other)

    const [orderInfo, txHash, error] = await signerClient.createGroupedOrders(
      groupingType, // OTOCO
      [iocOrder, takeProfitOrder, stopLossOrder]
    );

    if (error) {
      console.error('❌ Failed to create IOC order with attached SL/TP:', error);
    } else {
      console.log('✅ IOC order with attached SL/TP created successfully!');
      console.log('🔗 Transaction Hash:', txHash);
      console.log('');
      console.log('📊 Order Behavior:');
      console.log('   1. Parent IOC order executes immediately or cancels');
      console.log('   2. If parent fills, Take Profit order is triggered');
      console.log('   3. When Take Profit triggers, Stop Loss is canceled');
      console.log('   4. SL/TP orders size = executed size of parent order');
      console.log('   5. SL/TP orders cancel when position sign changes');
      
      if (txHash) {
        await signerClient.waitForTransaction(txHash, 60000, 2000);
      }
    }

    console.log('\n📝 Key Points:');
    console.log('   - IOC orders execute immediately or cancel (no partial fills)');
    console.log('   - BaseAmount=0 in child orders means "match parent executed size"');
    console.log('   - Set limit price higher than trigger for better fill rate');
    console.log('   - OTOCO: Parent triggers Child 1, Child 1 cancels Child 2');
    console.log('   - SL/TP orders automatically cancel when position sign changes');

    console.log('\n🎉 IOC order with attached SL/TP example completed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
  }
}

if (require.main === module) {
  createGroupedIOCWithAttachedSLTPExample().catch(console.error);
}

export { createGroupedIOCWithAttachedSLTPExample };

