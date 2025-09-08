// Comprehensive example matching Python SDK's create_cancel_order.py
import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://testnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env.PRIVATE_KEY;
const ACCOUNT_INDEX = 65;
const API_KEY_INDEX = 1;

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || e.message;
}

async function main() {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in environment variables');
    console.log('Please set PRIVATE_KEY in your .env file');
    return;
  }

  console.log('=== Create and Cancel Order Example ===');
  console.log('Matching Python SDK create_cancel_order.py functionality');
  console.log('');

  try {
    // Initialize SignerClient with WASM configuration (Windows compatible)
    const client = new SignerClient({
      url: BASE_URL,
      privateKey: API_KEY_PRIVATE_KEY,
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      wasmConfig: {
        wasmPath: './signers/wasm-signer/lighter-signer.wasm',
        wasmExecPath: './signers/wasm-signer/wasm_exec.js'
      }
    });

    console.log('✅ SignerClient initialized with WASM configuration');

    // Check client connection
    const validationError = client.checkClient();
    if (validationError) {
      console.log(`❌ CheckClient error: ${trimException(new Error(validationError))}`);
      return;
    }
    console.log('✅ Client validation passed');

    // Initialize WASM signer
    await client.initialize();
    console.log('✅ WASM signer initialized');

    // Create order
    console.log('');
    console.log('📝 Creating order...');
    const [order, txHash, error] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 123,
      baseAmount: 100000,
      price: 270000,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0
    });

    if (error) {
      console.log(`❌ Create Order Error: ${error}`);
      return;
    }

    console.log(`✅ Order created successfully:`);
    console.log(`   Order: ${JSON.stringify(order, null, 2)}`);
    console.log(`   Transaction Hash: ${txHash}`);

    // Create auth token
    console.log('');
    console.log('🔐 Creating auth token...');
    try {
      const authToken = await client.createAuthTokenWithExpiry(SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY);
      console.log(`✅ Auth token created: ${authToken}`);
    } catch (authError) {
      console.log(`⚠️  Auth token creation failed: ${authError}`);
    }

    // Cancel order
    console.log('');
    console.log('❌ Canceling order...');
    const [cancelOrder, cancelTxHash, cancelError] = await client.cancelOrder({
      marketIndex: 0,
      orderIndex: 123
    });

    if (cancelError) {
      console.log(`❌ Cancel Order Error: ${cancelError}`);
      return;
    }

    console.log(`✅ Order canceled successfully:`);
    console.log(`   Cancel Order: ${JSON.stringify(cancelOrder, null, 2)}`);
    console.log(`   Transaction Hash: ${cancelTxHash}`);

    // Close client
    await client.close();
    console.log('');
    console.log('🎉 Example completed successfully!');
    console.log('✅ All operations matched Python SDK functionality');

  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
