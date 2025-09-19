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

  // Create Take Profit order (using limit order with trigger price)
  const [tpTx, tpTxHash, tpErr] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000,
    price: 500000,
    isAsk: false,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 500000,
  });
  console.log('Create TP Order:', { tx: tpTx, txHash: tpTxHash, err: tpErr });

  // Create Stop Loss order (using limit order with trigger price)
  const [slTx, slTxHash, slErr] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now() + 1,
    baseAmount: 1000,
    price: 500000,
    isAsk: false,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 500000,
  });
  console.log('Create SL Order:', { tx: slTx, txHash: slTxHash, err: slErr });

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
