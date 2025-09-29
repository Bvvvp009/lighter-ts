// Close all positions by creating opposite market orders
// This example shows how to close all open positions

import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

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

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  console.log('🔄 Closing all positions...');

  // Close all positions
  const [closedTransactions, , errors] = await client.closeAllPositions();

  console.log('\n📊 Results:');
  console.log(`   Positions closed: ${closedTransactions.length}`);
  console.log(`   Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }

  if (closedTransactions.length > 0) {
    console.log('\n✅ Successfully closed positions:');
    closedTransactions.forEach((tx, index) => {
      console.log(`   ${index + 1}. Market ${tx.MarketIndex}: ${tx.IsAsk ? 'Sell' : 'Buy'} ${tx.BaseAmount} units`);
    });
  }

  if (closedTransactions.length === 0 && errors.length === 0) {
    console.log('ℹ️  No open positions found to close.');
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
