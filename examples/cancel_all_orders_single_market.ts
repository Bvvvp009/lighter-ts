import * as dotenv from 'dotenv';
import { SignerClient } from '../src';

dotenv.config();

async function main() {
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const client = new SignerClient({
    url: process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai',
    privateKey: API_PRIVATE_KEY,
    accountIndex: Number(process.env.ACCOUNT_INDEX) || 0,
    apiKeyIndex: Number(process.env.API_KEY_INDEX) || 0,
  });

  await client.initialize();
  await client.ensureWasmClient();

  console.log('Canceling all orders for market 0 only...');
  const [result, apiResponse, err] = await client.cancelAllOrders(
    SignerClient.CANCEL_ALL_TIF_IMMEDIATE,
    0,
    -1,
    0
  );
  if (err) {
    console.error('Error canceling orders:', err);
  } else {
    console.log('All orders for market 0 canceled');
  }

  await client.close();
}

main().catch(console.error);
