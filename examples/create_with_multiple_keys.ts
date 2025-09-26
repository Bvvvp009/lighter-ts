import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);

// Use examples/system_setup.ts or the apikeys page (for mainnet) to generate new api keys
const KEYS: Record<number, string> = {
  5: process.env['API_PRIVATE_KEY_5'] || '',
  6: process.env['API_PRIVATE_KEY_6'] || '',
  7: process.env['API_PRIVATE_KEY_7'] || '',
};

// Check if required keys are available
const requiredKey = KEYS[5];
if (!requiredKey) {
  console.error('API_PRIVATE_KEY_5 environment variable is required');
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new SignerClient({
    url: BASE_URL,
    privateKey: requiredKey!,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: 5,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  for (let i = 0; i < 5; i++) { // Reduced from 20 to 5 for demo
    const [tx, txHash, createErr] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 123 + i,
      baseAmount: 100000 + i,
      price: 385000 + i,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0,
    });
    console.log({ tx, txHash, err: createErr });
    
    if (!createErr && txHash) {
      console.log('⏳ Waiting for transaction confirmation...');
      try {
        const confirmedTx = await client.waitForTransaction(txHash, 30000, 1000);
        console.log('✅ Transaction confirmed!');
        console.log(`   Hash: ${confirmedTx.hash}`);
        console.log(`   Status: ${confirmedTx.status}`);
      } catch (waitError) {
        console.log('⚠️ Transaction confirmation timeout:', waitError instanceof Error ? waitError.message : 'Unknown error');
      }
    }
  }

  const [cancelTx, cancelApiResponse, cancelErr] = await client.cancelAllOrders(
    SignerClient.CANCEL_ALL_TIF_IMMEDIATE, 
    Date.now()
  );
  console.log('Cancel All Orders:', { tx: cancelTx, apiResponse: cancelApiResponse, err: cancelErr });
}

if (require.main === module) {
  main().catch(console.error);
}
