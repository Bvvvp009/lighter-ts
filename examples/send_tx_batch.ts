import { SignerClient } from '../src/signer/wasm-signer-client';
import { TransactionApi } from '../src/api/transaction-api';
import { ApiClient } from '../src/api/api-client';
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

  const apiClient = new ApiClient({ host: BASE_URL });
  const transactionApi = new TransactionApi(apiClient);
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

  // Get next nonce
  const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
  let nonceValue = nextNonce.nonce;

  // Sign first order
  const askTxInfo = await (client as any).wallet.signCreateOrder({
    marketIndex: 0,
    clientOrderIndex: 1001,
    baseAmount: 100000,
    price: 280000,
    isAsk: 1,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: 0,
    triggerPrice: 0,
    nonce: nonceValue++
  });

  // Sign second order
  const bidTxInfo = await (client as any).wallet.signCreateOrder({
    marketIndex: 0,
    clientOrderIndex: 1002,
    baseAmount: 200000,
    price: 200000,
    isAsk: 0,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: 0,
    triggerPrice: 0,
    nonce: nonceValue++
  });

  try {
    const txHashes = await transactionApi.sendTransactionBatch({
      account_index: ACCOUNT_INDEX,
      api_key_index: API_KEY_INDEX,
      transactions: [askTxInfo, bidTxInfo]
    });
    console.log('Batch transaction successful:', txHashes);
  } catch (error: any) {
    console.error('Error sending batch transaction:', error.message);
  }

  await client.close();
  await apiClient.close();
}

if (require.main === module) {
  main().catch(console.error);
}
