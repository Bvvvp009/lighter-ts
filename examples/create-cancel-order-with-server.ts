import { ApiClient, SignerClient } from '../src';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// The API_KEY_PRIVATE_KEY provided belongs to a dummy account registered on Testnet.
// It was generated using the setup_system.py script, and serves as an example.
const BASE_URL = "https://testnet.zklighter.elliot.ai";
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const SIGNER_SERVER_URL = process.env['SIGNER_SERVER_URL'] || 'http://localhost:8080';

const ACCOUNT_INDEX = 65;
const API_KEY_INDEX = 1;

function trimException(e: any): string {
  return e.toString().trim().split('\n').pop() || e.toString();
}

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    return;
  }

  console.log(`Using signer server at: ${SIGNER_SERVER_URL}`);

  const apiClient = new ApiClient({ host: BASE_URL });

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    signerServerUrl: SIGNER_SERVER_URL,
  });

  try {
    const err = client.checkClient();
    if (err) {
      console.error(`CheckClient error: ${trimException(err)}`);
      return;
    }

    // Create order
    const [tx, txHash, createErr] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 123,
      baseAmount: 100000,
      price: 270000,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
      orderExpiry: Date.now() + 24 * 60 * 60 * 1000, // 1 day from now (milliseconds)
    });

    console.log(`Create Order tx=${JSON.stringify(tx)} txHash=${txHash} err=${createErr}`);
    if (createErr) {
      throw new Error(createErr);
    }

    const [auth, authErr] = await client.createAuthTokenWithExpiry(SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY);
    console.log(`auth=${auth}`);
    if (authErr) {
      throw new Error(authErr);
    }

    // Cancel order
    const [cancelTx, cancelTxHash, cancelErr] = await client.cancelOrder({
      marketIndex: 0,
      orderIndex: 123,
    });

    console.log(`Cancel Order tx=${JSON.stringify(cancelTx)} txHash=${cancelTxHash} err=${cancelErr}`);
    if (cancelErr) {
      throw new Error(cancelErr);
    }

  } finally {
    await client.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 