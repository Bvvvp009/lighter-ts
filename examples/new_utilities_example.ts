/**
 * New Utilities Example
 * Demonstrates how to use the new standalone utilities
 */

import { 
  SignerClient, 
  TransactionParams,
  OrderType,
  TransactionStatus,
  priceToUnits,
  unitsToPrice,
  amountToUnits,
  unitsToAmount,
  formatPrice,
  formatAmount,
  calculateSLPrice,
  calculateTPPrice,
  createNonceManager,
  waitAndCheckTransaction,
  printTransactionResult,
  isTransactionSuccessful
} from '../src';
import { ApiClient } from '../src/api/api-client';
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

  console.log('🎯 New Utilities Example\n');

  // Initialize clients
  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });

  // 1. Order Types Usage
  console.log('📊 Order Types:');
  console.log(`   Limit Order: ${OrderType.LIMIT} (${OrderType.LIMIT})`);
  console.log(`   Market Order: ${OrderType.MARKET} (${OrderType.MARKET})`);
  console.log(`   Stop Loss: ${OrderType.STOP_LOSS} (${OrderType.STOP_LOSS})`);
  console.log(`   Stop Loss Limit: ${OrderType.STOP_LOSS_LIMIT} (${OrderType.STOP_LOSS_LIMIT})`);
  console.log(`   Take Profit: ${OrderType.TAKE_PROFIT} (${OrderType.TAKE_PROFIT})`);
  console.log(`   Take Profit Limit: ${OrderType.TAKE_PROFIT_LIMIT} (${OrderType.TAKE_PROFIT_LIMIT})`);
  console.log(`   TWAP: ${OrderType.TWAP} (${OrderType.TWAP})\n`);

  // 2. Price Utilities Usage
  console.log('💰 Price Utilities:');
  const marketIndex = 0; // ETH/USDC
  const humanPrice = 3930.50;
  const humanAmount = 0.1;

  const priceUnits = priceToUnits(humanPrice, marketIndex);
  const amountUnits = amountToUnits(humanAmount, marketIndex);
  
  console.log(`   Human Price: $${humanPrice} → Units: ${priceUnits}`);
  console.log(`   Human Amount: ${humanAmount} ETH → Units: ${amountUnits}`);
  console.log(`   Formatted Price: ${formatPrice(priceUnits, marketIndex)}`);
  console.log(`   Formatted Amount: ${formatAmount(amountUnits, marketIndex)} ETH\n`);

  // 3. SL/TP Price Calculations
  console.log('🎯 SL/TP Price Calculations:');
  const entryPrice = 393000; // $3930 in units
  const slPercent = 5;
  const tpPercent = 10;
  const isLongPosition = true;

  const slPrice = calculateSLPrice(entryPrice, slPercent, isLongPosition);
  const tpPrice = calculateTPPrice(entryPrice, tpPercent, isLongPosition);

  console.log(`   Entry Price: ${formatPrice(entryPrice, marketIndex)}`);
  console.log(`   SL Price (${slPercent}%): ${formatPrice(slPrice, marketIndex)}`);
  console.log(`   TP Price (${tpPercent}%): ${formatPrice(tpPrice, marketIndex)}\n`);

  // 4. Nonce Manager Usage
  console.log('🔢 Nonce Manager:');
  const nonceManager = createNonceManager(apiClient, {
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  try {
    const nextNonce = await nonceManager.getNextNonce();
    console.log(`   Next Nonce: ${nextNonce}`);

    const batchNonces = await nonceManager.getNextNonces(3);
    console.log(`   Batch Nonces: [${batchNonces.join(', ')}]`);

    const stats = nonceManager.getCacheStats();
    console.log(`   Cache Stats:`, stats);
  } catch (error) {
    console.log(`   Nonce Manager Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();

  // 5. Transaction Parameters with New Interface
  console.log('📝 Transaction Parameters:');
  const transactionParams: TransactionParams = {
    marketIndex,
    clientOrderIndex: Date.now(),
    baseAmount: amountUnits,
    isAsk: !isLongPosition, // LONG=false (BUY), SHORT=true (SELL)
    orderType: 'market', // Still use string for main order type
    avgExecutionPrice: entryPrice,
    reduceOnly: false,
    timeInForce: 0,
    stopLoss: {
      triggerPrice: Math.round(slPrice),
      isLimit: true, // This becomes ORDER_TYPE_STOP_LOSS_LIMIT (3)
    },
    takeProfit: {
      triggerPrice: Math.round(tpPrice),
      isLimit: true, // This becomes ORDER_TYPE_TAKE_PROFIT_LIMIT (5)
    }
  };

  console.log('   Transaction Parameters Created:');
  console.log(`   - Market Index: ${transactionParams.marketIndex}`);
  console.log(`   - Order Type: ${transactionParams.orderType}`);
  console.log(`   - Base Amount: ${formatAmount(transactionParams.baseAmount, marketIndex)} ETH`);
  console.log(`   - SL Trigger: ${formatPrice(transactionParams.stopLoss!.triggerPrice, marketIndex)}`);
  console.log(`   - TP Trigger: ${formatPrice(transactionParams.takeProfit!.triggerPrice, marketIndex)}\n`);

  // 6. Transaction Status Checking
  console.log('🔍 Transaction Status Checking:');
  console.log(`   Pending: ${TransactionStatus.PENDING}`);
  console.log(`   Queued: ${TransactionStatus.QUEUED}`);
  console.log(`   Committed: ${TransactionStatus.COMMITTED}`);
  console.log(`   Executed: ${TransactionStatus.EXECUTED}`);
  console.log(`   Failed: ${TransactionStatus.FAILED}`);
  console.log(`   Rejected: ${TransactionStatus.REJECTED}\n`);

  // 7. Create and Monitor Transaction
  console.log('📈 Creating Transaction...');
  try {
    const result = await client.createUnifiedOrder(transactionParams);
    
    console.log('✅ Transaction Created:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Message: ${result.message}`);
    console.log(`   Main Order Hash: ${result.mainOrder.hash}`);
    if (result.stopLoss) {
      console.log(`   SL Order Hash: ${result.stopLoss.hash}`);
    }
    if (result.takeProfit) {
      console.log(`   TP Order Hash: ${result.takeProfit.hash}`);
    }

    // Monitor transaction status
    if (result.success && result.batchResult.hashes.length > 0) {
      console.log('\n🔍 Monitoring Transaction Status...');
      
      for (let i = 0; i < result.batchResult.hashes.length; i++) {
        const hash = result.batchResult.hashes[i];
        if (!hash) continue;
        
        const orderType = i === 0 ? 'Main Order' : (i === 1 ? 'SL Order' : 'TP Order');
        
        console.log(`\n⏳ Checking ${orderType} transaction: ${hash.substring(0, 16)}...`);
        
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

  } catch (error) {
    console.error('❌ Transaction Creation Failed:', error);
  }

  console.log('\n🎉 New Utilities Example Completed!');
  console.log('📝 Summary:');
  console.log('   ✅ Order types with numeric values');
  console.log('   ✅ Price utilities with market index support');
  console.log('   ✅ Standalone nonce manager');
  console.log('   ✅ Transaction status checking utilities');
  console.log('   ✅ Renamed UnifiedOrderParams to TransactionParams');
}

main().catch(console.error);
