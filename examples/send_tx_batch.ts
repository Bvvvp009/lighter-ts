// Send Transaction Batch Example
// This example demonstrates how to send multiple transactions in a single batch
// for improved efficiency and reduced latency

import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { TransactionApi } from '../src/api/transaction-api';
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

  console.log('📦 Batch Transaction Example\n');

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const transactionApi = new TransactionApi(apiClient);

  try {
    await client.initialize();
    await (client as any).ensureWasmClient();

    const err = client.checkClient();
    if (err) {
      console.error('❌ CheckClient error:', err);
      return;
    }

    console.log('📝 Creating batch of 2 limit orders...\n');

    // Get next nonce
    const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
    let nonceValue = nextNonce.nonce;

    // Calculate order expiry (1 hour from now)
    const oneHourLater = Date.now() + (60 * 60 * 1000);

    // Sign first order
    const askTxInfo = await (client as any).wallet.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 50,
      price: 420000, // $4200
      isAsk: 1,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: 0,
      orderExpiry: oneHourLater,
      nonce: nonceValue++
    });

    // Sign second order
    const bidTxInfo = await (client as any).wallet.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now() + 1,
      baseAmount: 50,
      price: 410000, // $4100
      isAsk: 0,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: 0,
      orderExpiry: oneHourLater,
      nonce: nonceValue++
    });

    // Send batch transaction
    const txTypes = JSON.stringify([
      SignerClient.TX_TYPE_CREATE_ORDER,
      SignerClient.TX_TYPE_CREATE_ORDER
    ]);
    const txInfos = JSON.stringify([askTxInfo, bidTxInfo]);
    
    const batch1Hashes = await transactionApi.sendTransactionBatch({
      tx_types: txTypes,
      tx_infos: txInfos
    });
    
    console.log('✅ Batch 1 submitted successfully!');
    console.log('📋 Transaction Hashes:');
    if (batch1Hashes.tx_hash && Array.isArray(batch1Hashes.tx_hash)) {
      batch1Hashes.tx_hash.forEach((hash: string, idx: number) => {
        console.log(`   ${idx + 1}. ${hash}`);
      });
    }
    console.log('');

    // Wait before second batch
    console.log('⏳ Waiting 5 seconds before second batch...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📝 Creating mixed batch (cancel + create order)...\n');

    // Sign cancel order
    const cancelTxInfo = await (client as any).wallet.signCancelOrder({
      marketIndex: 0,
      orderIndex: Date.now(),
      nonce: nonceValue++
    });

    // Sign new order
    const newAskTxInfo = await (client as any).wallet.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now() + 2,
      baseAmount: 75,
      price: 415000, // $4150
      isAsk: 1,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: 0,
      orderExpiry: oneHourLater,
      nonce: nonceValue++
    });

    // Send second batch
    const txTypes2 = JSON.stringify([
      SignerClient.TX_TYPE_CANCEL_ORDER,
      SignerClient.TX_TYPE_CREATE_ORDER
    ]);
    const txInfos2 = JSON.stringify([cancelTxInfo, newAskTxInfo]);
    
    const batch2Hashes = await transactionApi.sendTransactionBatch({
      tx_types: txTypes2,
      tx_infos: txInfos2
    });
    
    console.log('✅ Batch 2 submitted successfully!');
    console.log('📋 Transaction Hashes:');
    if (batch2Hashes.tx_hash && Array.isArray(batch2Hashes.tx_hash)) {
      batch2Hashes.tx_hash.forEach((hash: string, idx: number) => {
        console.log(`   ${idx + 1}. ${hash}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await client.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
