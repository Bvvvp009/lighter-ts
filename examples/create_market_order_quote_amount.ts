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

  const marketIndex = 0;
  const leverage = 1;
  const margin_usdc = 5;
  const quoteAmount = margin_usdc * leverage;

  console.log(`Creating market order by quote amount: ${quoteAmount} USDC with ${leverage}x leverage...`);
  console.log('Note: The quote amount is in USDC. The SDK converts it to internal units (x 1e6).');
  console.log('Known issue: The slippage check may reject orders due to order book parsing.');
  console.log('If this happens, use createMarketOrder_maxSlippage instead for market orders with slippage protection.');
  const [result, txHash, err] = await client.createMarketOrder_quoteAmount({
    marketIndex,
    clientOrderIndex: Date.now(),
    quoteAmount,
    maxSlippage: 0.05,
    isAsk: true,
  });

  if (err) {
    console.error('Error creating market order by quote amount:', err);
    console.log('\nFalling back to regular market order...');
    const [fallbackResult, fallbackHash, fallbackErr] = await client.createMarketOrder_maxSlippage({
      marketIndex,
      clientOrderIndex: Date.now() + 1,
      baseAmount: 500,
      maxSlippage: 0.05,
      isAsk: true,
      idealPrice: 150000,
    });
    if (fallbackErr) {
      console.error('Fallback order also failed:', fallbackErr);
    } else {
      console.log('Fallback market order created:', fallbackHash);
    }
  } else {
    console.log('Market order created, tx hash:', txHash);
    console.log('Order result:', JSON.stringify(result, null, 2));
  }

  await client.close();
}

main().catch(console.error);