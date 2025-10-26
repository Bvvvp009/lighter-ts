/**
 * Example: WebSocket Batch Transaction Sending
 * Demonstrates sending batch transactions via WebSocket using the correct format
 */

import { SignerClient, ApiClient, TransactionApi, TransferParams } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function webSocketSendBatchTransactionExample() {
  console.log('🚀 WebSocket Batch Transaction Sending Example...\n');

  // Initialize signer client for creating signed transactions
  const signerClient = new SignerClient({
    url: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    privateKey: process.env['API_PRIVATE_KEY'] || '',
    accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
    apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
  });

  // Initialize API client for transaction monitoring
  const apiClient = new ApiClient({
    host: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai'
  });

  // Validate required environment variables
  if (!process.env['API_PRIVATE_KEY']) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  try {
    // Initialize signer
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Create multiple orders for batch sending
    const orders: Array<{ tx_type: number; tx_info: string }> = [];
    
    // Order 1: Market buy order for ETH
    const [order1Info, txHash1, error1] = await signerClient.createOrder({
      marketIndex: 0, // ETH market
      clientOrderIndex: Date.now(),
      baseAmount: 10000, // 0.001 ETH
      price: 410000, // Market order - this is avgExecutionPrice
      isAsk: false, // Buy order
      orderType: 1, // Market order
      orderExpiry: 0, // Immediate execution for market orders
      timeInForce: 0 // IMMEDIATE_OR_CANCEL for market orders
    });

    if (!error1 && txHash1) {
      orders.push({
        tx_type: 1, // Create order transaction type
        tx_info: txHash1
      });
      console.log('✅ Order 1 created successfully');
    }

    // Order 2: Limit sell order for ETH
    const [order2Info, txHash2, error2] = await signerClient.createOrder({
      marketIndex: 0, // ETH market
      clientOrderIndex: Date.now() + 1,
      baseAmount: 5000, // 0.0005 ETH
      price: 400000, // Limit price
      isAsk: true, // Sell order
      orderType: 0, // Limit order
      orderExpiry: Date.now() + (24 * 60 * 60 * 1000), // 24 hours in milliseconds
      timeInForce: 1 // GOOD_TILL_TIME for limit orders
    });

    if (!error2 && txHash2) {
      orders.push({
        tx_type: 1, // Create order transaction type
        tx_info: txHash2
      });
      console.log('✅ Order 2 created successfully');
    }

    // Order 3: Transfer transaction
    const [transferInfo, transferTxHash, transferError] = await signerClient.transfer({
      toAccountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
      usdcAmount: 1.0, // 1 USDC
      fee: 0,
      memo: 'a'.repeat(32),
      ethPrivateKey: process.env['API_PRIVATE_KEY'] || '',
      nonce: -1
    });

    if (!transferError && transferTxHash) {
      orders.push({
        tx_type: 3, // Transfer transaction type
        tx_info: transferTxHash
      });
      console.log('✅ Transfer created successfully');
    }

    if (orders.length === 0) {
      throw new Error('No transactions were created successfully');
    }

    // Prepare batch transaction message
    const batchMessage = {
      type: 'jsonapi/sendtxbatch',
      data: {
        tx_types: `[${orders.map(o => o.tx_type).join(',')}]`,
        tx_infos: `[${orders.map(o => `"${o.tx_info}"`).join(',')}]`
      }
    };

    console.log('\n📡 Sending batch transactions via WebSocket...');
    console.log(`   Batch size: ${orders.length} transactions`);
    console.log('Message:', JSON.stringify(batchMessage, null, 2));

    // Note: In a real implementation, you would send this via WebSocket
    // For this example, we'll just show the format
    console.log('\n✅ Batch transaction message prepared for WebSocket sending');
    console.log('   This would be sent via wsClient.send(batchMessage)');

    // Monitor transaction statuses via API
    console.log('\n🔍 Monitoring transaction statuses...');
    const transactionApi = new TransactionApi(apiClient);
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      try {
        const transactionResult = await transactionApi.getTransaction({
          by: 'hash',
          value: order.tx_info
        });

        console.log(`✅ Transaction ${i + 1} status:`);
        console.log(`   Type: ${order.tx_type}`);
        console.log(`   Hash: ${order.tx_info}`);
        console.log(`   Status: ${transactionResult.status}`);
        console.log(`   Block Height: ${transactionResult.block_height || 'Pending'}`);
      } catch (error) {
        console.log(`❌ Transaction ${i + 1} monitoring failed:`, error);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  webSocketSendBatchTransactionExample().catch(console.error);
}

export { webSocketSendBatchTransactionExample };
