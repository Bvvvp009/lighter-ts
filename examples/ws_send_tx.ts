/**
 * Example: WebSocket Transaction Sending
 * Demonstrates sending transactions via WebSocket using the correct format
 */

import { SignerClient, ApiClient, TransactionApi } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function webSocketSendTransactionExample() {
  console.log('🚀 WebSocket Transaction Sending Example...\n');

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

    // Create a simple market order
    const [orderInfo, txHash, error] = await signerClient.createOrder({
      marketIndex: 0, // ETH market
      clientOrderIndex: Date.now(),
      baseAmount: 10000, // 0.001 ETH (scaled correctly)
      price: 400000, // $4000 - avgExecutionPrice for market order
      isAsk: false, // Buy order
      orderType: 1, // Market order
      orderExpiry: 0, // Immediate execution for market orders
      timeInForce: 0 // IMMEDIATE_OR_CANCEL for market orders
    });

    if (error) {
      throw new Error(`Failed to create order: ${error}`);
    }

    console.log('✅ Order created successfully');
    console.log(`   Transaction Hash: ${txHash}`);

    // Send transaction via WebSocket
    const wsMessage = {
      type: 'jsonapi/sendtx',
      data: {
        tx_type: 1, // Create order transaction type
        tx_info: txHash // The signed transaction hash
      }
    };

    console.log('\n📡 Sending transaction via WebSocket...');
    console.log('Message:', JSON.stringify(wsMessage, null, 2));

    // Note: In a real implementation, you would send this via WebSocket
    // For this example, we'll just show the format
    console.log('\n✅ Transaction message prepared for WebSocket sending');
    console.log('   This would be sent via wsClient.send(wsMessage)');

    // Monitor transaction status via API
    console.log('\n🔍 Monitoring transaction status...');
    const transactionApi = new TransactionApi(apiClient);
    const transactionResult = await transactionApi.getTransaction({
      by: 'hash',
      value: txHash
    });

    console.log('✅ Transaction status retrieved');
    console.log(`   Status: ${transactionResult.status}`);
    console.log(`   Block Height: ${transactionResult.block_height || 'Pending'}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  webSocketSendTransactionExample().catch(console.error);
}

export { webSocketSendTransactionExample };
