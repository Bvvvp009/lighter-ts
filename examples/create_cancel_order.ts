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
    price: 4500,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_MARKET,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 0,
  });

  console.log('Create Order:', { tx, txHash, err: createErr });
  if (createErr) {
    throw new Error(createErr);
  }

  const [auth, authErr] = await client.createAuthTokenWithExpiry(SignerClient.DEFAULT_10_MIN_AUTH_EXPIRY);
  console.log('Auth token:', auth);
  if (authErr) {
    throw new Error(authErr);
  }

  // Cancel order
  const [cancelTx, cancelTxHash, cancelErr] = await client.cancelOrder({
    marketIndex: 0,
    orderIndex: 123,
  });

  console.log('Cancel Order:', { tx: cancelTx, txHash: cancelTxHash, err: cancelErr });
  if (cancelErr) {
    throw new Error(cancelErr);
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
