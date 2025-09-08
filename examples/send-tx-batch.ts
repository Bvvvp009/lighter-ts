import { ApiClient, TransactionApi, SignerClient } from '../src';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// The API_KEY_PRIVATE_KEY provided belongs to a dummy account registered on Testnet.
// It was generated using the setup_system.py script, and serves as an example.
const BASE_URL = "https://testnet.zklighter.elliot.ai";
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = 1146;
const API_KEY_INDEX = 0;

function trimException(e: any): string {
  return e.toString().trim().split('\n').pop() || e.toString();
}

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    return;
  }

  // Initialize configuration and clients
  const apiClient = new ApiClient({ host: BASE_URL });
  const transactionApi = new TransactionApi(apiClient);

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    // Check client connection by getting next nonce
    let nonceValue: number;
    try {
      const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
      nonceValue = nextNonce.nonce;
      console.log(`Next nonce: ${nonceValue}`);
    } catch (e) {
      console.error(`CheckClient error: ${trimException(e)}`);
      return;
    }

    // Create first order (ask)
    const [askTx, askTxHash, askErr] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 1001,
      baseAmount: 100000,
      price: 280000,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
    });

    if (askErr) {
      console.error(`Error creating first order: ${trimException(askErr)}`);
      return;
    }

    // Create second order (bid)
    const [bidTx, bidTxHash, bidErr] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 1002,
      baseAmount: 200000,
      price: 200000,
      isAsk: false,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
    });

    if (bidErr) {
      console.error(`Error creating second order: ${trimException(bidErr)}`);
      return;
    }

    // Send batch transaction
    try {
      const txHashes = await transactionApi.sendTransactionBatch({
        account_index: ACCOUNT_INDEX,
        api_key_index: API_KEY_INDEX,
        transactions: [askTxHash, bidTxHash],
      });
      console.log(`Batch transaction successful: ${JSON.stringify(txHashes, null, 2)}`);
    } catch (e) {
      console.error(`Error sending batch transaction: ${trimException(e)}`);
    }

    // Wait a bit to see the changes in the UI
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Cancel first order and create new one
    const [cancelTx, cancelTxHash, cancelErr] = await client.cancelOrder({
      marketIndex: 0,
      orderIndex: 1001,
    });

    if (cancelErr) {
      console.error(`Error canceling order: ${trimException(cancelErr)}`);
      return;
    }

    const [newAskTx, newAskTxHash, newAskErr] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 1003,
      baseAmount: 300000,
      price: 310000,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
    });

    if (newAskErr) {
      console.error(`Error creating new order: ${trimException(newAskErr)}`);
      return;
    }

    // Send second batch transaction
    try {
      const txHashes = await transactionApi.sendTransactionBatch({
        account_index: ACCOUNT_INDEX,
        api_key_index: API_KEY_INDEX,
        transactions: [cancelTxHash, newAskTxHash],
      });
      console.log(`Batch 2 transaction successful: ${JSON.stringify(txHashes, null, 2)}`);
    } catch (e) {
      console.error(`Error sending batch transaction 2: ${trimException(e)}`);
    }

  } finally {
    await client.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 