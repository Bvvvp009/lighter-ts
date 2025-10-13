import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { waitAndCheckTransaction, printTransactionResult } from '../src/utils/transaction-helper';
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

  console.log('🎯 Creating Take Profit and Stop Loss Orders\n');
  console.log('📊 PROPER SL/TP CONFIGURATION:');
  console.log('   ✅ Correct direction: OPPOSITE to position (to close it)');
  console.log('   ✅ reduceOnly: true (only closes existing positions)');
  console.log('   ✅ Price calculations: Based on entry price + target %');
  console.log('   ✅ Unit scales: ETH = 10,000 units (4 decimals), Price = 100 units (2 decimals)\n');

  // Example: Creating SL/TP for a LONG position (you bought ETH)
  // For SHORT position, reverse the isAsk flags
  
  const marketIndex = 0; // ETH/USDC
  const baseAmount = 1000; // 0.1 ETH (1 ETH = 10,000 units)
  const isLongPosition = true; // true = LONG (bought), false = SHORT (sold)
  
  // Entry price and target percentages
  const entryPrice = 400000; // $4000 (using 2 decimals: $1 = 100 units)
  const stopLossPercent = 5; // 5% loss
  const takeProfitPercent = 5; // 5% gain
  
  // Calculate SL/TP prices based on position direction
  // For LONG: SL below entry, TP above entry
  // For SHORT: SL above entry, TP below entry
  const stopLossPrice = isLongPosition
    ? Math.round(entryPrice * (1 - stopLossPercent / 100)) // LONG: SL below
    : Math.round(entryPrice * (1 + stopLossPercent / 100)); // SHORT: SL above
    
  const takeProfitPrice = isLongPosition
    ? Math.round(entryPrice * (1 + takeProfitPercent / 100)) // LONG: TP above
    : Math.round(entryPrice * (1 - takeProfitPercent / 100)); // SHORT: TP below
    
  const clientOrderIndex = Date.now();

  console.log('💡 Order Parameters:');
  console.log(`   Position: ${isLongPosition ? 'LONG (bought)' : 'SHORT (sold)'}`);
  console.log(`   Base Amount: 0.1 ETH (${baseAmount} units)`);
  console.log(`   Entry Price: $${(entryPrice / 100).toFixed(2)} (${entryPrice} units)`);
  console.log(`   SL Price: $${(stopLossPrice / 100).toFixed(2)} (${stopLossPrice} units) - ${stopLossPercent}% ${isLongPosition ? 'below' : 'above'}`);
  console.log(`   TP Price: $${(takeProfitPrice / 100).toFixed(2)} (${takeProfitPrice} units) - ${takeProfitPercent}% ${isLongPosition ? 'above' : 'below'}`);
  console.log(`   Reduce Only: true ✅\n`);

  // Create Take Profit Limit order
  // IMPORTANT: Direction must be OPPOSITE to the position to close it
  // LONG position → SELL (isAsk=true) to close
  // SHORT position → BUY (isAsk=false) to close
  console.log('📈 Creating Take Profit Limit Order...');
  const [tpTx, tpTxHash, tpErr] = await client.createTpLimitOrder(
    marketIndex,
    clientOrderIndex,
    baseAmount,
    takeProfitPrice, // trigger price
    takeProfitPrice, // limit price (same as trigger for immediate execution)
    isLongPosition,  // LONG=true (sell to close), SHORT=false (buy to close)
    true  // reduceOnly = true ✅ MUST BE TRUE for SL/TP
  );

  if (tpErr) {
    console.error('❌ Take Profit order submission failed:', tpErr);
  } else {
    console.log('✅ Take Profit order submitted!');
    console.log(`   Order Index: ${tpTx.ClientOrderIndex}`);
    console.log(`   Trigger Price: $${(takeProfitPrice / 100).toFixed(2)}`);
    console.log(`   Limit Price: $${(takeProfitPrice / 100).toFixed(2)}`);
    console.log(`   Amount: ${baseAmount / 10000} ETH (${baseAmount} units)`);
    console.log(`   Direction: ${isLongPosition ? 'SELL' : 'BUY'} (closes ${isLongPosition ? 'LONG' : 'SHORT'} position)`);
    console.log(`   Reduce Only: true ✅`);

    // Wait for transaction confirmation with proper error handling
    if (tpTxHash) {
      const tempClient = new ApiClient({ host: BASE_URL });
      const result = await waitAndCheckTransaction(tempClient, tpTxHash, {
        maxWaitTime: 30000,
        pollInterval: 2000
      });
      
      printTransactionResult('Take Profit Order', tpTxHash, result);
      await tempClient.close();
      console.log('');
    } else {
      console.log('⚠️ No transaction hash available\n');
    }
  }

  // Wait between orders to avoid nonce conflicts
  console.log('⏳ Waiting 2 seconds before placing Stop Loss...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create Stop Loss Limit order
  // IMPORTANT: Direction must be OPPOSITE to the position to close it
  console.log('🛡️ Creating Stop Loss Limit Order...');
  const [slLimitTx, slLimitTxHash, slLimitErr] = await client.createSlLimitOrder(
    marketIndex,
    clientOrderIndex + 2,
    baseAmount,
    stopLossPrice, // trigger price
    stopLossPrice, // limit price (same as trigger for immediate execution)
    isLongPosition,  // LONG=true (sell to close), SHORT=false (buy to close)
    true  // reduceOnly = true ✅ MUST BE TRUE for SL/TP
  );

  if (slLimitErr) {
    console.error('❌ Stop Loss Limit order submission failed:', slLimitErr);
  } else {
    console.log('✅ Stop Loss Limit order submitted!');
    console.log(`   Order Index: ${slLimitTx.ClientOrderIndex}`);
    console.log(`   Trigger Price: $${(stopLossPrice / 100).toFixed(2)}`);
    console.log(`   Limit Price: $${(stopLossPrice / 100).toFixed(2)}`);
    console.log(`   Amount: ${baseAmount / 10000} ETH (${baseAmount} units)`);
    console.log(`   Direction: ${isLongPosition ? 'SELL' : 'BUY'} (closes ${isLongPosition ? 'LONG' : 'SHORT'} position)`);
    console.log(`   Reduce Only: true ✅`);

    // Wait for transaction confirmation with proper error handling
    if (slLimitTxHash) {
      const tempClient = new ApiClient({ host: BASE_URL });
      const result = await waitAndCheckTransaction(tempClient, slLimitTxHash, {
        maxWaitTime: 30000,
        pollInterval: 2000
      });
      
      printTransactionResult('Stop Loss Limit Order', slLimitTxHash, result);
      await tempClient.close();
    } else {
      console.log('⚠️ No transaction hash available\n');
    }
  }

  console.log('\n✅ Both SL and TP orders configured correctly!');
  console.log('📝 Key Points:');
  console.log('   • reduceOnly: true - prevents opening new positions');
  console.log('   • Direction: opposite to position - closes it when triggered');
  console.log('   • Trigger prices: calculated based on entry + target %');

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
