// Check Transaction Status - Demonstrates proper transaction status handling
// This example shows how to check transaction status with detailed information

import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

// Helper function to display transaction status
function displayTransactionStatus(tx: any): void {
  const getStatusName = (status: number | string): string => {
    if (typeof status === 'string') return status;
    switch (status) {
      case SignerClient.TX_STATUS_PENDING: return 'Pending';
      case SignerClient.TX_STATUS_QUEUED: return 'Queued';
      case SignerClient.TX_STATUS_COMMITTED: return 'Committed';
      case SignerClient.TX_STATUS_EXECUTED: return 'Executed ✅';
      case SignerClient.TX_STATUS_FAILED: return 'Failed ❌';
      case SignerClient.TX_STATUS_REJECTED: return 'Rejected ❌';
      default: return `Unknown (${status})`;
    }
  };

  const getErrorInfo = (transaction: any): string | null => {
    try {
      if (transaction.event_info) {
        const eventInfo = JSON.parse(transaction.event_info);
        if (eventInfo.ae) {
          return eventInfo.ae; // ae = actual error
        }
      }
    } catch (e) {
      // Failed to parse
    }
    return null;
  };

  console.log('📋 Transaction Details:');
  console.log(`   Hash: ${tx.hash}`);
  console.log(`   Status: ${getStatusName(tx.status)}`);
  console.log(`   Type: ${tx.type}`);
  console.log(`   Block Height: ${tx.block_height}`);
  console.log(`   Account Index: ${tx.account_index}`);
  console.log(`   Nonce: ${tx.nonce}`);
  
  if (tx.queued_at) {
    const queueTime = new Date(tx.queued_at);
    console.log(`   Queued At: ${queueTime.toLocaleString()}`);
  }
  
  if (tx.executed_at) {
    const execTime = new Date(tx.executed_at);
    console.log(`   Executed At: ${execTime.toLocaleString()}`);
  }

  const errorInfo = getErrorInfo(tx);
  if (errorInfo) {
    console.log(`   ⚠️  Error: ${errorInfo}`);
  }

  if (tx.info) {
    try {
      const info = JSON.parse(tx.info);
      console.log(`   Info: ${JSON.stringify(info, null, 2)}`);
    } catch (e) {
      console.log(`   Info (raw): ${tx.info}`);
    }
  }
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

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  console.log('🔍 Transaction Status Check Example\n');

  // Create a market order to test
  console.log('📝 Creating a market order...');
  const [, txHash, createErr] = await client.createMarketOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 10,
    avgExecutionPrice: 450000,
    isAsk: true,
  });

  if (createErr) {
    console.error('❌ Order creation failed:', createErr);
    return;
  }

  console.log(`✅ Order submitted! TX Hash: ${txHash}\n`);

  // Wait for transaction with improved status handling
  if (txHash) {
    console.log('⏳ Waiting for transaction confirmation with detailed status...\n');
    
    try {
      const confirmedTx = await client.waitForTransaction(txHash, 60000, 2000);
      
      console.log('\n✅ TRANSACTION CONFIRMED!\n');
      displayTransactionStatus(confirmedTx);
      
    } catch (waitError) {
      console.log('\n❌ TRANSACTION FAILED OR TIMEOUT\n');
      
      if (waitError instanceof Error) {
        console.log('Error Message:', waitError.message);
        
        // Try to get the transaction details even if failed
        try {
          const txApi = (client as any).transactionApi;
          const failedTx = await txApi.getTransaction({ by: 'hash', value: txHash });
          console.log('\nFailed Transaction Details:');
          displayTransactionStatus(failedTx);
        } catch (e) {
          console.log('Could not retrieve transaction details');
        }
      }
    }
  }

  console.log('\n💡 Transaction Status Codes:');
  console.log(`   ${SignerClient.TX_STATUS_PENDING} = Pending (not yet processed)`);
  console.log(`   ${SignerClient.TX_STATUS_QUEUED} = Queued (waiting for execution)`);
  console.log(`   ${SignerClient.TX_STATUS_COMMITTED} = Committed (in block)`);
  console.log(`   ${SignerClient.TX_STATUS_EXECUTED} = Executed ✅ (successful)`);
  console.log(`   ${SignerClient.TX_STATUS_FAILED} = Failed ❌ (execution failed)`);
  console.log(`   ${SignerClient.TX_STATUS_REJECTED} = Rejected ❌ (validation failed)`);

  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
