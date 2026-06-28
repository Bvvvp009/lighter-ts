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

  const integratorIndex = Number(process.env.INTEGRATOR_INDEX) || 0;

  console.log('Creating IOC grouped orders with integrator fees...');
  const result = await client.createOcoOrder({
    orders: [
      {
        marketIndex: 0,
        baseAmount: 1000000,
        price: 310000000,
        isAsk: true,
        orderType: 0,
        timeInForce: 0,
        integratorAccountIndex: integratorIndex,
        integratorTakerFee: 100,
        integratorMakerFee: 50,
      },
      {
        marketIndex: 0,
        baseAmount: 1000000,
        price: 290000000,
        isAsk: false,
        orderType: 2,
        timeInForce: 0,
        triggerPrice: 290000000,
        integratorAccountIndex: integratorIndex,
        integratorTakerFee: 100,
        integratorMakerFee: 50,
      },
    ],
    integratorAccountIndex: integratorIndex,
    integratorTakerFee: 100,
    integratorMakerFee: 50,
  });

  if (result.error) {
    console.error('Grouped orders error:', result.error);
  } else {
    console.log('OCO order with integrator created:', result.hash);
  }

  await client.close();
}

main().catch(console.error);
