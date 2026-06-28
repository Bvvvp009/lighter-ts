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

  console.log('Creating OTOCO grouped orders with self-trade prevention...');
  const result = await client.createOtocoOrder({
    mainOrder: {
      marketIndex: 0,
      baseAmount: 1000000,
      isAsk: true,
      orderType: 0,
      price: 300000000,
    },
    stopLoss: {
      triggerPrice: 280000000,
    },
    takeProfit: {
      triggerPrice: 320000000,
    },
    selfTradeBehaviorMode: SignerClient.SELF_TRADE_BEHAVIOR_EXPIRE_MAKER,
    selfTradeEqualityMode: SignerClient.SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
  });

  if (result.error) {
    console.error('Grouped orders error:', result.error);
  } else {
    console.log('OTOCO order created:', result.hash);
  }

  await client.close();
}

main().catch(console.error);
