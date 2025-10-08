// Create Limit Orders - Example
// NOTE: Limit orders have VERY strict price validation on this exchange
// Orders must be extremely close to current market price (< 1%) to be accepted
// This example shows how to place limit orders, but price validation may reject them

import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  console.log('🎯 Creating Working Limit Order Example...\n');

  // Working Limit Order Example with REALISTIC prices
  console.log('📈 Creating Limit Buy Order');
  const oneHourFromNow = Date.now() + (60 * 60 * 1000); // 1 hour from now
  
  // SOL is trading at ~$0.220, must use prices VERY close to market
  // Buy at 0.1% below market: $0.2198
  const [buyTx, buyTxHash, buyErr] = await client.createOrder({
    marketIndex: 0, // SOL/USDC market
    clientOrderIndex: Date.now(),
    baseAmount: 50, // 0.05 SOL (minimum allowed)
    price: 444000, // $0.219 limit price (0.5% below ~$0.220 market - extremely close!)
    isAsk: false, // Buy order
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 0,
    orderExpiry: oneHourFromNow, // Use real timestamp
  });

  if (buyErr) {
    console.log('❌ Buy order failed:', buyErr);
  } else {
    console.log('✅ Buy order created successfully!');
    console.log('📋 Order Details:');
    console.log(`   Order Index: ${buyTx.ClientOrderIndex}`);
    console.log(`   Market Index: ${buyTx.MarketIndex}`);
    console.log(`   Amount: ${buyTx.BaseAmount} units`);
    console.log(`   Limit Price: $${buyTx.Price / 100000}`);
    console.log(`   Order Type: Limit Buy`);
    console.log(`   TX Hash: ${buyTxHash}`);

    // Wait for transaction confirmation
    if (buyTxHash) {
      console.log('⏳ Waiting for buy order confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(buyTxHash, 30000, 1000);
        console.log('✅ Buy order transaction confirmed!');
        console.log(`   Hash: ${confirmedTx.hash}`);
        console.log(`   Status: ${confirmedTx.status}`);
      } catch (waitError) {
        console.log('⚠️ Buy order confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error');
      }
    }
  }

  console.log('\n💡 Key Success Factors:');
  console.log('   ✅ Use SOL/USDC market (marketIndex: 2)');
  console.log('   ✅ Use minimum allowed amount (50 = 0.05 SOL)');
  console.log('   ✅ Use REALISTIC prices close to market (5-10% away)');
  console.log('   ✅ Use real timestamps for orderExpiry (not -1)');
  console.log('   ✅ Use unique clientOrderIndex values');
  console.log('   ✅ Check current market price before placing orders');

  console.log('\n📊 Example Order Details:');
  console.log('   Market: SOL/USDC (Index 2)');
  console.log('   Amount: 0.05 SOL');
  console.log('   Price: $0.218 limit buy (1% below ~$0.220 market)');
  console.log('   Expiry: 1 hour from now');
  console.log('   Type: Good Till Time (GTT)');

  console.log('\n⚠️ IMPORTANT - LIMIT ORDER CONSTRAINTS:');
  console.log('   🔴 This exchange has VERY strict price validation for limit orders');
  console.log('   🔴 Orders must be within < 1% of current market price');
  console.log('   🔴 Orders outside this range will be rejected with "price too far from mark price"');
  console.log('   ');
  console.log('   ✅ For testing, use MARKET ORDERS instead (see create_market_order.ts)');
  console.log('   ✅ Market orders have looser validation and execute immediately');
  console.log('   ✅ Run check_sol_price.ts to see current market conditions');
  console.log('   ');
  console.log('   📝 Limit orders are best used in production when you need specific price control');
  console.log('   📝 Consider using IOC (Immediate or Cancel) orders for tighter price control');

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}