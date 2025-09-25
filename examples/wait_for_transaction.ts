// Example showing how to wait for transaction confirmation
// This demonstrates waiting for a transaction hash to be confirmed before proceeding

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

  console.log('🚀 Creating an order and waiting for transaction confirmation...\n');

  // Create a market order (more likely to succeed)
  const [tx, txHash, createErr] = await client.createMarketOrder({
    marketIndex: 0, // ETH/USDC
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 0.001 ETH
    avgExecutionPrice: 400000000, // $4000 max price
    isAsk: true, // Sell order
    reduceOnly: false,
  });

  if (createErr) {
    console.error('❌ Order creation failed:', createErr);
    return;
  }

  console.log('📝 Order created successfully!');
  console.log(`   Order Index: ${tx.ClientOrderIndex}`);
  console.log(`   Transaction Hash: ${txHash}`);
  console.log(`   Market Index: ${tx.MarketIndex}`);
  console.log(`   Amount: ${tx.BaseAmount}`);
  console.log(`   Price: $${tx.Price / 100000}\n`);

  // Wait for transaction confirmation
  if (txHash) {
    console.log('⏳ Waiting for transaction confirmation...');
    try {
      const confirmedTx = await client.waitForTransaction(txHash, 60000, 2000);
      
      console.log('\n✅ Transaction confirmed!');
      console.log(`   Hash: ${confirmedTx.hash}`);
      console.log(`   Status: ${confirmedTx.status}`);
      console.log(`   Block Height: ${confirmedTx.block_height}`);
      console.log(`   Type: ${confirmedTx.type}`);
      console.log(`   Created At: ${confirmedTx.created_at}`);
      
    } catch (waitError) {
      console.error('❌ Failed to wait for transaction confirmation:', waitError);
    }
  } else {
    console.log('⚠️ No transaction hash returned, cannot wait for confirmation');
  }

  // Wait for order confirmation (this is a placeholder - would need order book checking)
  console.log('\n⏳ Waiting for order to appear in order book...');
  const orderConfirmed = await client.waitForOrderConfirmation(
    tx.MarketIndex,
    tx.ClientOrderIndex,
    30000, // 30 seconds max wait
    1000   // 1 second polling interval
  );

  if (orderConfirmed) {
    console.log('✅ Order confirmed in order book!');
  } else {
    console.log('⚠️ Order confirmation timeout or not found');
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
