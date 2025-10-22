// Unified Order with SL/TP Example
// This example demonstrates the new unified order functionality that automatically
// handles SL/TP order creation and batch sending in the background

import { SignerClient, TransactionParams } from '../src/signer/wasm-signer-client';
import { waitAndCheckTransaction, printTransactionResult } from '../src/utils/transaction-helper';
import { ApiClient } from '../src/api/api-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY environment variable is required');
    return;
  }

  console.log('🎯 Unified Order with SL/TP Example\n');
  console.log('📊 NEW UNIFIED APPROACH:');
  console.log('   ✅ Single method call for order + SL/TP');
  console.log('   ✅ Automatic background batch sending');
  console.log('   ✅ Unified error handling and results');
  console.log('   ✅ No need to manage SL/TP separately\n');

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const marketIndex = 0; // ETH/USDC
  const baseAmount = 100; // 0.1 ETH (1 ETH = 10,000 units)
  const isLongPosition = true; // true = LONG (buy), false = SHORT (sell)
  
  // Entry price and target percentages
  const entryPrice = 393000; // $4000 (using 2 decimals: $1 = 100 units)
  const stopLossPercent = 5; // 5% loss
  const takeProfitPercent = 5; // 10% gain
  
  // Calculate SL/TP prices based on position direction
  const stopLossPrice = isLongPosition
    ? Math.round(entryPrice * (1 - stopLossPercent / 100)) // LONG: SL below
    : Math.round(entryPrice * (1 + stopLossPercent / 100)); // SHORT: SL above
    
  const takeProfitPrice = isLongPosition
    ? Math.round(entryPrice * (1 + takeProfitPercent / 100)) // LONG: TP above
    : Math.round(entryPrice * (1 - takeProfitPercent / 100)); // SHORT: TP below

  console.log('💡 Order Parameters:');
  console.log(`   Position: ${isLongPosition ? 'LONG (buy)' : 'SHORT (sell)'}`);
  console.log(`   Base Amount: 0.1 ETH (${baseAmount} units)`);
  console.log(`   Entry Price: $${(entryPrice / 100).toFixed(2)} (${entryPrice} units)`);
  console.log(`   SL Price: $${(stopLossPrice / 100).toFixed(2)} (${stopLossPrice} units) - ${stopLossPercent}% ${isLongPosition ? 'below' : 'above'}`);
  console.log(`   TP Price: $${(takeProfitPrice / 100).toFixed(2)} (${takeProfitPrice} units) - ${takeProfitPercent}% ${isLongPosition ? 'above' : 'below'}\n`);

  // Initialize API client for transaction checking
  const apiClient = new ApiClient({ host: BASE_URL });

  // Market Order with SL/TP - Focus on debugging this
  console.log('📈 Creating Market Order with SL/TP...');
  const marketOrderParams: TransactionParams = {
    marketIndex,
    clientOrderIndex: Date.now(),
    baseAmount,
    isAsk: !isLongPosition, // LONG=false (BUY), SHORT=true (SELL)
    orderType: 'market',
    avgExecutionPrice: entryPrice,
    reduceOnly: false, // Opening position
    timeInForce: 0, // Immediate or Cancel for market orders
    stopLoss: {
      triggerPrice: stopLossPrice,
      isLimit: true, // SL Limit order (not market)
    },
    takeProfit: {
      triggerPrice: takeProfitPrice,
      isLimit: true, // TP Limit order (not market)
    }
  };

  const marketResult = await client.createUnifiedOrder(marketOrderParams);
  
  console.log('✅ Market Order Result:');
  console.log(`   Success: ${marketResult.success}`);
  console.log(`   Message: ${marketResult.message}`);
  console.log(`   Main Order Hash: ${marketResult.mainOrder.hash}`);
  if (marketResult.stopLoss) {
    console.log(`   SL Order Hash: ${marketResult.stopLoss.hash}`);
  }
  if (marketResult.takeProfit) {
    console.log(`   TP Order Hash: ${marketResult.takeProfit.hash}`);
  }
  console.log(`   Batch Hashes: ${marketResult.batchResult.hashes.join(', ')}\n`);

  // Wait for transactions to be processed and check their status
  if (marketResult.success && marketResult.batchResult.hashes.length > 0) {
    console.log('🔍 Checking transaction status...');
    
    for (let i = 0; i < marketResult.batchResult.hashes.length; i++) {
      const hash = marketResult.batchResult.hashes[i];
      if (!hash) {
        console.log(`❌ No hash found for order ${i}`);
        continue;
      }
      
      const orderType = i === 0 ? 'Main Order' : (i === 1 ? 'SL Order' : 'TP Order');
      
      console.log(`\n⏳ Waiting for ${orderType} transaction: ${hash.substring(0, 16)}...`);
      try {
        const txResult = await waitAndCheckTransaction(apiClient, hash, {
          maxWaitTime: 30000,
          pollInterval: 1000
        });
        printTransactionResult(orderType, hash, txResult);
      } catch (error) {
        console.log(`❌ ${orderType} transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  console.log('🎉 Market order debugging completed!');
  console.log('📝 Key Benefits of Unified Orders:');
  console.log('   • Single method call for complex order setups');
  console.log('   • Automatic SL/TP order creation and batching');
  console.log('   • Unified error handling and result reporting');
  console.log('   • Reduced complexity for developers');
  console.log('   • Atomic operations - all orders succeed or fail together');

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
  
