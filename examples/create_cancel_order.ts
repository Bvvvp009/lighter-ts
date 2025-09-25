import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
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

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  // Create order
  const [tx, txHash, createErr] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: 123,
    baseAmount: 1000,
    price: 450000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 0,
  });

  console.log('Create Order:', { tx, txHash, err: createErr });
  if (createErr) {
    throw new Error(createErr);
  }

  console.log('✅ Order created successfully!');
  console.log('📋 Order Details:');
  console.log(`   Market Index: ${tx.MarketIndex}`);
  console.log(`   Client Order Index: ${tx.ClientOrderIndex}`);
  console.log(`   Base Amount: ${tx.BaseAmount}`);
  console.log(`   Price: ${tx.Price}`);
  console.log(`   Is Ask: ${tx.IsAsk ? 'Yes (Sell)' : 'No (Buy)'}`);
  console.log(`   Order Type: ${tx.Type === 0 ? 'Limit' : 'Market'}`);
  console.log(`   Time In Force: ${tx.TimeInForce === 1 ? 'Good Till Time' : 'Immediate or Cancel'}`);
  console.log(`   Nonce: ${tx.Nonce}`);

  // Wait for transaction confirmation if txHash is available
  if (txHash) {
    console.log('\n⏳ Waiting for transaction confirmation...');
    try {
      const confirmedTx = await client.waitForTransaction(txHash, 30000, 1000);
      console.log('✅ Transaction confirmed!');
      console.log(`   Hash: ${confirmedTx.hash}`);
      console.log(`   Status: ${confirmedTx.status}`);
      console.log(`   Block Height: ${confirmedTx.block_height}`);
    } catch (waitError) {
      console.log('⚠️ Transaction confirmation timeout or failed:', waitError instanceof Error ? waitError.message : 'Unknown error');
    }
  } else {
    console.log('⚠️ No transaction hash available for confirmation');
  }

  // Cancel order
  const [cancelTx, cancelTxHash, cancelErr] = await client.cancelOrder({
    marketIndex: 0,
    orderIndex: 123,
  });

  console.log('\nCancel Order:', { tx: cancelTx, txHash: cancelTxHash, err: cancelErr });
  if (cancelErr) {
    console.log('❌ Cancel order error:', cancelErr);
  } else {
    console.log('✅ Order cancelled successfully!');
    console.log('📋 Cancel Order Details:');
    console.log(`   Market Index: ${cancelTx.MarketIndex}`);
    console.log(`   Order Index: ${cancelTx.OrderIndex}`);
    console.log(`   Nonce: ${cancelTx.Nonce}`);

    // Wait for cancellation transaction confirmation if txHash is available
    if (cancelTxHash) {
      console.log('\n⏳ Waiting for cancellation transaction confirmation...');
      try {
        const confirmedCancelTx = await client.waitForTransaction(cancelTxHash, 30000, 1000);
        console.log('✅ Cancellation transaction confirmed!');
        console.log(`   Hash: ${confirmedCancelTx.hash}`);
        console.log(`   Status: ${confirmedCancelTx.status}`);
      } catch (waitError) {
        console.log('⚠️ Cancellation transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error');
      }
    }
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
