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

  console.log('Creating order with skipNonce mode...');
  const [order, txHash, err] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 100,
    price: 178000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  });
  if (err) {
    console.error('Order error:', err);
  } else {
    console.log('Order created:', txHash);
  }
  if (err) {
    console.error('Order error:', err);
  } else {
    console.log('Order created:', txHash);
  }

  console.log('\nNow creating order with explicit skipNonce flag...');
  const [order2, txHash2, err2] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 100,
    price: 178000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    skipNonce: 1,
    nonce: await client.getNextNonce().then(n => n.nonce),
  });
  if (err2) {
    console.error('SkipNonce order error:', err2);
  } else {
    console.log('SkipNonce order created:', txHash2);
  }

  await client.close();
}

main().catch(console.error);
