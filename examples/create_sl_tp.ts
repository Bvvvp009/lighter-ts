import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_KEY_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  console.log('🎯 Creating Take Profit and Stop Loss orders...\n');

  // Example: Assume we have a long position and want to set TP/SL
  const marketIndex = 0; // ETH/USDC
  const baseAmount = 1000000; // 0.001 ETH
  const takeProfitPrice = 420000000; // $4200 (5% profit)
  const stopLossPrice = 380000000; // $3800 (5% loss)
  const clientOrderIndex = Date.now();

  // Create Take Profit Limit order
  console.log('📈 Creating Take Profit Limit Order...');
  const [tpTx, tpTxHash, tpErr] = await client.createTpLimitOrder(
    marketIndex,
    clientOrderIndex,
    baseAmount,
    takeProfitPrice, // trigger price
    takeProfitPrice, // limit price
    true, // isAsk = true (sell order to take profit on long position)
    true  // reduceOnly = true (closing position)
  );

  if (tpErr) {
    console.error('❌ Take Profit order failed:', tpErr);
  } else {
    console.log('✅ Take Profit order created successfully!');
    console.log(`   Order Index: ${tpTx.ClientOrderIndex}`);
    console.log(`   Trigger Price: $${takeProfitPrice / 100000}`);
    console.log(`   Limit Price: $${takeProfitPrice / 100000}`);
    console.log(`   Amount: ${baseAmount} units`);
    console.log(`   TX Hash: ${tpTxHash}`);

    // Wait for transaction confirmation if txHash is available
    if (tpTxHash) {
      console.log('⏳ Waiting for Take Profit transaction confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(tpTxHash, 30000, 1000);
        console.log('✅ Take Profit transaction confirmed!');
        console.log(`   Hash: ${confirmedTx.hash}`);
        console.log(`   Status: ${confirmedTx.status}\n`);
      } catch (waitError) {
        console.log('⚠️ Take Profit transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error\n');
      }
    } else {
      console.log('⚠️ No transaction hash available for Take Profit confirmation\n');
    }
  }

  // Create Stop Loss order (market order) - Note: Currently has issues with expiry validation
  console.log('🛡️ Creating Stop Loss Order...');
  console.log('⚠️  Note: Stop Loss market orders currently have expiry validation issues');
  console.log('   Consider using Stop Loss Limit orders instead for better reliability\n');
  
  // Uncomment the following code when the Stop Loss market order issue is resolved:
  /*
  const [slTx, slTxHash, slErr] = await client.createSlOrder(
    marketIndex,
    clientOrderIndex + 1,
    baseAmount,
    stopLossPrice, // trigger price
    0, // price = 0 for market order
    true, // isAsk = true (sell order to stop loss on long position)
    true  // reduceOnly = true (closing position)
  );

  if (slErr) {
    console.error('❌ Stop Loss order failed:', slErr);
  } else {
    console.log('✅ Stop Loss order created successfully!');
    console.log(`   Order Index: ${slTx.ClientOrderIndex}`);
    console.log(`   Trigger Price: $${stopLossPrice / 100000}`);
    console.log(`   Amount: ${baseAmount} units`);
    console.log(`   TX Hash: ${slTxHash}\n`);
  }
  */

  // Create Stop Loss Limit order (alternative to market order)
  console.log('🛡️ Creating Stop Loss Limit Order...');
  const [slLimitTx, slLimitTxHash, slLimitErr] = await client.createSlLimitOrder(
    marketIndex,
    clientOrderIndex + 2,
    baseAmount,
    stopLossPrice, // trigger price
    stopLossPrice - 1000000, // limit price (slightly below trigger)
    true, // isAsk = true (sell order to stop loss on long position)
    true  // reduceOnly = true (closing position)
  );

  if (slLimitErr) {
    console.error('❌ Stop Loss Limit order failed:', slLimitErr);
  } else {
    console.log('✅ Stop Loss Limit order created successfully!');
    console.log(`   Order Index: ${slLimitTx.ClientOrderIndex}`);
    console.log(`   Trigger Price: $${stopLossPrice / 100000}`);
    console.log(`   Limit Price: $${(stopLossPrice - 1000000) / 100000}`);
    console.log(`   Amount: ${baseAmount} units`);
    console.log(`   TX Hash: ${slLimitTxHash}`);

    // Wait for transaction confirmation if txHash is available
    if (slLimitTxHash) {
      console.log('⏳ Waiting for Stop Loss Limit transaction confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(slLimitTxHash, 30000, 1000);
        console.log('✅ Stop Loss Limit transaction confirmed!');
        console.log(`   Hash: ${confirmedTx.hash}`);
        console.log(`   Status: ${confirmedTx.status}\n`);
      } catch (waitError) {
        console.log('⚠️ Stop Loss Limit transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error\n');
      }
    } else {
      console.log('⚠️ No transaction hash available for Stop Loss Limit confirmation\n');
    }
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
