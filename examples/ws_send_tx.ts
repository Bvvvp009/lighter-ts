/**
 * Example: WebSocket Transaction Sending
 * Demonstrates actually sending transactions via WebSocket using WebSocketOrderClient
 */

import { SignerClient, ApiClient, TransactionApi, WebSocketOrderClient, SignerClient as SC, MarketHelper, OrderType } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function webSocketSendTransactionExample() {
  const signerClient = new SignerClient({
    url: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    privateKey: process.env['API_PRIVATE_KEY'] || '',
    accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
    apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
  });

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

  if (!process.env['API_PRIVATE_KEY']) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    const wasmClient = (signerClient as any).wallet;
    if (!wasmClient) {
      throw new Error('WASM client not initialized');
    }

    const transactionApi = new TransactionApi(apiClient);
    const accountIndex = parseInt(process.env['ACCOUNT_INDEX'] || '0');
    const apiKeyIndex = parseInt(process.env['API_KEY_INDEX'] || '0');
    const nextNonce = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);

    // Use MarketHelper for proper unit conversion and safe, tiny test order
    const market = new MarketHelper(0, new (require('../src').OrderApi)(apiClient));
    await market.initialize();
    // Use minimum valid amount (0.01 ETH) to avoid "invalid order base or quote amount" error
    const tinyBaseAmount = market.amountToUnits(0.01); // 0.01 base (minimum)
    const farBelowMarketPrice = market.priceToUnits(1000); // Set low price to avoid execution on buy

    const signedTx = await wasmClient.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: tinyBaseAmount,
      price: farBelowMarketPrice,
      isAsk: 0, // BUY
      orderType: OrderType.LIMIT,
      timeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0,
      triggerPrice: SC.NIL_TRIGGER_PRICE,
      orderExpiry: Date.now() + (60 * 60 * 1000), // 1h expiry
      nonce: nextNonce.nonce,
      apiKeyIndex: apiKeyIndex,
      accountIndex: accountIndex
    });

    if (signedTx.error) {
      throw new Error(`Failed to sign order: ${signedTx.error}`);
    }

    await wsOrderClient.connect();
    // Wait for initial connection message
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const result = await wsOrderClient.sendTransaction(
        signedTx.txType || SC.TX_TYPE_CREATE_ORDER,
        signedTx.txInfo
      );

      console.log(`✅ Transaction sent via WebSocket: ${result.hash.substring(0, 16)}...`);
      // Verify transaction status via HTTP API
      try {
        const tx = await transactionApi.getTransaction({ by: 'hash', value: result.hash });
        console.log('🔍 Verification (HTTP):', {
          hash: tx.hash,
          status: tx.status,
          block_height: tx.block_height ?? 'pending'
        });
      } catch (verifyErr) {
        console.log('⚠️  Could not verify over HTTP yet:', verifyErr instanceof Error ? verifyErr.message : String(verifyErr));
      }
    } catch (wsError) {
      const errorMsg = wsError instanceof Error ? wsError.message : 'Unknown error';
      console.error('❌ WebSocket send failed:', errorMsg);
      
      // Fallback to HTTP if WebSocket fails (timeout, connection issues, etc.)
      if (errorMsg.includes('timeout') || errorMsg.includes('404') || errorMsg.includes('not connected')) {
        console.log('\n🔄 Falling back to HTTP API...');
        try {
          const httpResult = await transactionApi.sendTxWithIndices(
            signedTx.txType || SC.TX_TYPE_CREATE_ORDER,
            signedTx.txInfo,
            accountIndex,
            apiKeyIndex,
            true
          );
          
          if (httpResult.hash || httpResult.tx_hash) {
            const txHash = httpResult.hash || httpResult.tx_hash || '';
            console.log(`✅ Transaction sent via HTTP (fallback): ${txHash.substring(0, 16)}...`);
            
            // Verify
            try {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const tx = await transactionApi.getTransaction({ by: 'hash', value: txHash });
              console.log('🔍 Verification (HTTP):', {
                hash: tx.hash,
                status: tx.status,
                block_height: tx.block_height ?? 'pending'
              });
            } catch (verifyErr) {
              console.log('⚠️  Verification failed:', verifyErr instanceof Error ? verifyErr.message : String(verifyErr));
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
  webSocketSendTransactionExample().catch(console.error);
}

export { webSocketSendTransactionExample };
