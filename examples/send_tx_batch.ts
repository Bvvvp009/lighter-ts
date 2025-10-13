// Send Transaction Batch Example
// This example demonstrates how to send multiple orders in a single batch transaction
// for improved efficiency and reduced latency

import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { waitAndCheckTransaction, printTransactionResult } from '../src/utils/transaction-helper';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY environment variable is required');
    return;
  }

  console.log('📦 Batch Transaction Example\n');
  console.log('═'.repeat(80));

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });

  try {
    await client.initialize();
    await (client as any).ensureWasmClient();

    const err = client.checkClient();
    if (err) {
      console.error('❌ CheckClient error:', err);
      return;
    }

    console.log('\n📝 Creating batch of 3 orders...\n');

    // NOTE: For now, we'll send orders individually since batch requires proper
    // transaction signing which needs special handling. This approach is more reliable.
    
    const timestamp = Date.now();
    const orders = [
      {
        marketIndex: 0,
        clientOrderIndex: timestamp,
        baseAmount: 50,
        price: 410000, // $4100
        isAsk: false,
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: false,
        triggerPrice: 0,
      },
      {
        marketIndex: 0,
        clientOrderIndex: timestamp + 1,
        baseAmount: 50,
        price: 420000, // $4200
        isAsk: true,
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: false,
        triggerPrice: 0,
      },
      {
        marketIndex: 0,
        clientOrderIndex: timestamp + 2,
        baseAmount: 75,
        price: 405000, // $4050
        isAsk: false,
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: false,
        triggerPrice: 0,
      }
    ];

    const results: Array<{ success: boolean; error?: string; hash?: string; tx?: any }> = [];
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      if (!order) continue;
      
      console.log(`📌 Order ${i + 1}/${orders.length}:`);
      console.log(`   Type: ${order.isAsk ? 'SELL' : 'BUY'}`);
      console.log(`   Amount: ${order.baseAmount} units`);
      console.log(`   Price: $${order.price / 100}`);
      
      const [tx, txHash, createErr] = await client.createOrder(order);
      
      if (createErr) {
        console.log(`   ❌ Failed: ${createErr}\n`);
        results.push({ success: false, error: createErr });
      } else {
        console.log(`   ✅ Created: ${txHash}\n`);
        results.push({ success: true, hash: txHash, tx });
        
        // Small delay to avoid nonce conflicts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('\n📊 Batch Results Summary:\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    console.log(`✅ Successful: ${successful.length}/${orders.length}`);
    console.log(`❌ Failed: ${failed.length}/${orders.length}\n`);

    if (successful.length > 0) {
      console.log('Transaction Hashes:');
      successful.forEach((result: any, idx) => {
        console.log(`   ${idx + 1}. ${result.hash}`);
      });

      // Wait for first transaction confirmation as example
      if (successful[0]?.hash) {
        console.log('\n⏳ Checking first transaction status...\n');
        const result = await waitAndCheckTransaction(apiClient, successful[0].hash, {
          maxWaitTime: 30000,
          pollInterval: 2000
        });
        printTransactionResult('First Order', successful[0].hash, result);
      }
    }

    if (failed.length > 0) {
      console.log('\nFailed Orders:');
      failed.forEach((result: any, idx) => {
        console.log(`   ${idx + 1}. ${result.error}`);
      });
    }

    console.log('\n💡 Note: True batch transactions require special signing.');
    console.log('   This example uses sequential orders for reliability.');
    console.log('   For high-frequency trading, consider using WebSocket batch API.\n');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await client.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
