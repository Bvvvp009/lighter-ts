import { SignerClient } from '../src/signer/wasm-signer-client';
import { TransactionApi } from '../src/api/transaction-api';
import { ApiClient } from '../src/api/api-client';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function wsFlow(txTypes: number[], txInfos: string[]): Promise<void> {
  const ws = new WebSocket(BASE_URL.replace('https', 'wss') + '/stream');
  
  return new Promise((resolve, reject) => {
    ws.on('open', async () => {
      try {
        const msg = await new Promise<string>((resolve) => {
          ws.once('message', (data) => resolve(data.toString()));
        });
        console.log('Received:', msg);

        await ws.send(JSON.stringify({
          type: 'jsonapi/sendtxbatch',
          data: {
            id: `my_random_batch_id_${12345678}`, // optional, helps id the response
            tx_types: JSON.stringify(txTypes),
            tx_infos: JSON.stringify(txInfos),
          },
        }));

        const response = await new Promise<string>((resolve) => {
          ws.once('message', (data) => resolve(data.toString()));
        });
        console.log('Response:', response);
        
        ws.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    ws.on('error', reject);
  });
}

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const transactionApi = new TransactionApi(apiClient);

  await client.initialize();
  await (client as any).ensureWasmClient();

  const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
  let nonceValue = nextNonce.nonce;

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
    nonce: nonceValue++,
  });

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
    nonce: nonceValue++,
  });

  const txTypes = [
    SignerClient.TX_TYPE_CREATE_ORDER,
    SignerClient.TX_TYPE_CREATE_ORDER,
  ];
  const txInfos = [askTxInfo, bidTxInfo];

  await wsFlow(txTypes, txInfos);

  await client.close();
  await apiClient.close();
}

if (require.main === module) {
  main().catch(console.error);
}
