// Create market order only if slippage is acceptable
// This example shows how to create a market order that only executes if slippage is within limits

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

  // Create market order only if slippage is acceptable
  const [tx, txHash, err_result] = await client.createMarketOrder_ifSlippage({
    marketIndex: 0, // ETH market
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 0.001 ETH (in wei scale)
    maxSlippage: 0.005, // 0.5% max slippage (very strict)
    isAsk: false, // Buy order
  });

  console.log('Create Market Order if Slippage Acceptable:', { tx, txHash, err: err_result });
  
  if (err_result) {
    console.log('❌ Order not created:', err_result);
  } else {
    console.log('✅ Order created successfully!');
    console.log('📋 Order Details:');
    console.log(`   Market Index: ${tx.MarketIndex}`);
    console.log(`   Client Order Index: ${tx.ClientOrderIndex}`);
    console.log(`   Base Amount: ${tx.BaseAmount}`);
    console.log(`   Price: ${tx.Price}`);
    console.log(`   Is Ask: ${tx.IsAsk ? 'Yes (Sell)' : 'No (Buy)'}`);
    console.log(`   Order Type: ${tx.Type === 0 ? 'Limit' : 'Market'}`);
    console.log(`   Time In Force: ${tx.TimeInForce === 0 ? 'Immediate or Cancel' : 'Good Till Time'}`);
    console.log(`   Nonce: ${tx.Nonce}`);
  }

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}

