/**
 * Example: WebSocket Batch Transaction Sending
 * Demonstrates actually sending batch transactions via WebSocket using WebSocketOrderClient
 */

import { SignerClient, ApiClient, TransactionApi, WebSocketOrderClient, SignerClient as SC, MarketHelper, OrderType } from '../src';
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

  // Use the same /stream endpoint as regular WsClient for transaction sending
  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
  const wsOrderClient = new WebSocketOrderClient({
    url: wsUrl,
    endpointPath: '' // Already a full WS URL, don't append path
  });

  // Validate required environment variables
  if (!process.env['API_PRIVATE_KEY']) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  try {
    // Initialize signer
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Get WASM client for signing
    const wasmClient = (signerClient as any).wallet;
    if (!wasmClient) {
      throw new Error('WASM client not initialized');
    }

    // Get nonces for batch (ensures sequential nonces)
    const transactionApi = new TransactionApi(apiClient);
    const accountIndex = parseInt(process.env['ACCOUNT_INDEX'] || '0');
    const apiKeyIndex = parseInt(process.env['API_KEY_INDEX'] || '0');
    const nonces = await (signerClient as any).getNextNonces(2);

    console.log(`📋 Acquired nonces: ${nonces.join(', ')}\n`);

    // Prepare batch transactions
    const txTypes: number[] = [];
    const txInfos: string[] = [];
    const baseIndex = Date.now();
    const orderExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
    const market = new MarketHelper(0, new (require('../src').OrderApi)(apiClient));
    await market.initialize();
    const tinyAmount1 = market.amountToUnits(0.001);
    const tinyAmount2 = market.amountToUnits(0.002);
    const farBelowPrice = market.priceToUnits(100);  // buy far below market
    const farAbovePrice = market.priceToUnits(100000); // sell far above market

    // Order 1: Limit buy order
    console.log('📝 Signing first order...');
    const firstTxResponse = await wasmClient.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: baseIndex,
      baseAmount: tinyAmount1,
      price: farBelowPrice,
      isAsk: 0, // BUY
      orderType: OrderType.LIMIT,
      timeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: SC.NIL_TRIGGER_PRICE,
      orderExpiry: orderExpiry,
      nonce: nonces[0],
      apiKeyIndex: apiKeyIndex,
      accountIndex: accountIndex
    });

    if (firstTxResponse.error) {
      throw new Error(`First order signing failed: ${firstTxResponse.error}`);
    }

    txTypes.push(firstTxResponse.txType || SC.TX_TYPE_CREATE_ORDER);
    txInfos.push(firstTxResponse.txInfo); // ✅ Push txInfo string, not hash
    console.log('✅ First order signed successfully');

    // Order 2: Limit sell order
    console.log('📝 Signing second order...');
    const secondTxResponse = await wasmClient.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: baseIndex + 1,
      baseAmount: tinyAmount2,
      price: farAbovePrice,
      isAsk: 1, // SELL
      orderType: OrderType.LIMIT,
      timeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: SC.NIL_TRIGGER_PRICE,
      orderExpiry: orderExpiry,
      nonce: nonces[1],
      apiKeyIndex: apiKeyIndex,
      accountIndex: accountIndex
    });

    if (secondTxResponse.error) {
      throw new Error(`Second order signing failed: ${secondTxResponse.error}`);
    }

    txTypes.push(secondTxResponse.txType || SC.TX_TYPE_CREATE_ORDER);
    txInfos.push(secondTxResponse.txInfo); // ✅ Push txInfo string, not hash
    console.log('✅ Second order signed successfully');

    if (txInfos.length === 0) {
      throw new Error('No transactions were signed successfully');
    }

    // Connect to WebSocket
    console.log('\n🔌 Connecting to WebSocket...');
    await wsOrderClient.connect();
    console.log('✅ WebSocket connected');

    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Send batch transactions via WebSocket
    console.log('\n📡 Sending batch transactions via WebSocket...');
    console.log(`   Batch size: ${txInfos.length} transactions`);
    
    try {
      const results = await wsOrderClient.sendBatchTransactions(txTypes, txInfos);

      console.log('✅ Batch transactions sent successfully via WebSocket!');
      console.log(`   Received ${results.length} transaction result(s):`);
      
      results.forEach((result, index) => {
        console.log(`\n   Transaction ${index + 1}:`);
        console.log(`     Hash: ${result.hash}`);
        console.log(`     Status: ${result.status}`);
        console.log(`     Type: ${result.type}`);
      });

      // Monitor transaction statuses
      console.log('\n🔍 Monitoring transaction statuses...');
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        try {
          const txStatus = await transactionApi.getTransaction({
            by: 'hash',
            value: result.hash
          });

          console.log(`\n✅ Transaction ${i + 1} Status:`);
          console.log(`   Hash: ${txStatus.hash}`);
          console.log(`   Status: ${txStatus.status}`);
          console.log(`   Block Height: ${txStatus.block_height || 'Pending'}`);
        } catch (error) {
          console.log(`⚠️  Transaction ${i + 1} monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

    } catch (wsError) {
      const errorMsg = wsError instanceof Error ? wsError.message : String(wsError);
      console.error('❌ WebSocket batch send failed:', errorMsg);
      
      // Fallback to HTTP if WebSocket fails
      if (errorMsg.includes('timeout') || errorMsg.includes('404') || errorMsg.includes('not connected')) {
        console.log('\n🔄 Falling back to HTTP API...');
        try {
          const httpResult = await transactionApi.sendTransactionBatch({
            tx_types: JSON.stringify(txTypes),
            tx_infos: JSON.stringify(txInfos)
          });
          
          if (httpResult.hashes || httpResult.tx_hash) {
            const hashes = httpResult.hashes || httpResult.tx_hash || [];
            console.log(`✅ Batch transactions sent via HTTP (fallback): ${hashes.length} transaction(s)`);
            
            hashes.forEach((hash, idx) => {
              console.log(`   Tx ${idx + 1}: ${hash.substring(0, 16)}...`);
            });
            
            // Verify
            for (let i = 0; i < hashes.length; i++) {
              try {
                await new Promise(resolve => setTimeout(resolve, 2000));
                const tx = await transactionApi.getTransaction({ by: 'hash', value: hashes[i] });
                console.log(`\n✅ Transaction ${i + 1} Status:`);
                console.log(`   Hash: ${tx.hash}`);
                console.log(`   Status: ${tx.status}`);
                console.log(`   Block Height: ${tx.block_height || 'Pending'}`);
              } catch (verifyErr) {
                console.log(`⚠️  Transaction ${i + 1} verification failed:`, verifyErr instanceof Error ? verifyErr.message : String(verifyErr));
              }
            }
          }
        } catch (httpError) {
          console.error('❌ HTTP fallback also failed:', httpError instanceof Error ? httpError.message : 'Unknown');
          throw wsError; // Throw original WebSocket error
        }
      } else {
        throw wsError;
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await wsOrderClient.disconnect();
    await signerClient.close();
    await apiClient.close();
  }
}

// Run the example
if (require.main === module) {
  webSocketSendBatchTransactionExample().catch(console.error);
}

export { webSocketSendBatchTransactionExample };
