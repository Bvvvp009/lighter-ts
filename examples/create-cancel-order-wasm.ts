import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BASE_URL = 'https://testnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = 65;
const API_KEY_INDEX = 1;

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  console.log('=== WASM Signer Client Example ===');
  console.log('This example demonstrates using the WASM signer for Windows compatibility');
  console.log('');

  try {
    // Initialize the WASM signer client
    const client = new SignerClient({
      url: BASE_URL,
      privateKey: API_KEY_PRIVATE_KEY,
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      wasmConfig: {
        wasmPath: './lighter-signer.wasm', // Path to your WASM binary
        wasmExecPath: './wasm_exec.js'     // Path to Go WASM runtime
      }
    });

    console.log('Initializing WASM signer...');
    await client.initialize();
    console.log('✓ WASM signer initialized successfully');
    console.log('');

    // Generate a new API key pair (demonstration)
    console.log('Generating a new API key pair...');
    const keyPair = await client.generateAPIKey();
    if (keyPair) {
      console.log('✓ Generated API key pair:');
      console.log(`  Private Key: ${keyPair.privateKey}`);
      console.log(`  Public Key: ${keyPair.publicKey}`);
    }
    console.log('');

    // Create an order using WASM signer
    console.log('Creating order with WASM signer...');
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

    if (createErr) {
      console.error('✗ Failed to create order:', createErr);
    } else {
      console.log('✓ Order created successfully!');
      console.log(`  Transaction Hash: ${txHash}`);
      console.log(`  Order Details:`, JSON.stringify(tx, null, 2));
    }
    console.log('');

    // Create a market order
    console.log('Creating market order with WASM signer...');
    const [marketTx, marketTxHash, marketErr] = await client.createMarketOrder({
      marketIndex: 0,
      clientOrderIndex: 124,
      baseAmount: 50000,
      avgExecutionPrice: 275000,
      isAsk: false,
    });

    if (marketErr) {
      console.error('✗ Failed to create market order:', marketErr);
    } else {
      console.log('✓ Market order created successfully!');
      console.log(`  Transaction Hash: ${marketTxHash}`);
      console.log(`  Order Details:`, JSON.stringify(marketTx, null, 2));
    }
    console.log('');

    // Create an authentication token
    console.log('Creating authentication token...');
    try {
      const authToken = await client.createAuthTokenWithExpiry(3600); // 1 hour expiry
      console.log('✓ Authentication token created:');
      console.log(`  Token: ${authToken}`);
    } catch (error) {
      console.error('✗ Failed to create auth token:', error);
    }
    console.log('');

    console.log('=== WASM Signer Example Complete ===');
    console.log('');
    console.log('Benefits of WASM Signer:');
    console.log('  ✓ Works on Windows without Go installation');
    console.log('  ✓ Runs in browser and Node.js environments');
    console.log('  ✓ Uses the exact same cryptographic libraries as Go');
    console.log('  ✓ No external dependencies or servers required');
    console.log('  ✓ Cross-platform compatibility');

  } catch (error) {
    console.error('Error in WASM signer example:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

