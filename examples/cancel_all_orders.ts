// Cancel all orders for an account
// This example shows how to cancel all open orders

import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
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
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  // Cancel all orders
  // timeInForce: 0 = immediate, 1 = scheduled, 2 = abort
  // time: timestamp for scheduled cancellation (0 for immediate)
  const [tx, apiResponse, cancelErr] = await client.cancelAllOrders(
    SignerClient.CANCEL_ALL_TIF_IMMEDIATE, // Immediate cancellation
    0 // No scheduled time
  );

  console.log('Cancel All Orders:', { tx, apiResponse, err: cancelErr });
  
  if (cancelErr) {
    console.log('❌ Cancel all orders error:', cancelErr);
  } else {
    console.log('✅ All orders cancelled successfully!');
    console.log('📋 Transaction Details:');
    console.log(`   Time In Force: ${tx.TimeInForce}`);
    console.log(`   Time: ${tx.Time}`);
    console.log(`   Nonce: ${tx.Nonce}`);
    console.log(`   API Response: ${JSON.stringify(apiResponse)}`);

    // Wait for cancellation transaction confirmation if we have a hash
    if (apiResponse && apiResponse.hash) {
      console.log('\n⏳ Waiting for cancellation transaction confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(apiResponse.hash, 30000, 1000);
        console.log('✅ Cancellation transaction confirmed!');
        console.log(`   Hash: ${confirmedTx.hash}`);
        console.log(`   Status: ${confirmedTx.status}`);
        console.log(`   Block Height: ${confirmedTx.block_height}`);
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
