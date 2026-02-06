/**
 * Example: WebSocket Transaction Sending
 * Demonstrates attempting to send transactions via WebSocket using WebSocketOrderClient
 * 
 * NOTE: As of testing, the WebSocket endpoint (/stream) does not appear to support
 * transaction submission on testnet. Transactions time out. The example includes
 * automatic fallback to HTTP API.
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
  console.log(`📡 WebSocket URL: ${wsUrl}`);
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

    // Get Rust WASM signer for signing without sending
    const rustSigner = (signerClient as any).rustSigner;
    if (!rustSigner) {
      throw new Error('Rust WASM signer not available');
    }

    // Get chainId from signerClient
    const chainId = (signerClient as any).chainId || 304;

    // Build transaction structure for signing
    const txStruct = {
      ChainId: chainId,
      MarketIndex: 0,
      ClientOrderIndex: Date.now(),
      BaseAmount: tinyBaseAmount,
      Price: farBelowMarketPrice,
      IsAsk: 0, // BUY
      Type: OrderType.LIMIT,
      TimeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      ReduceOnly: 0,
      TriggerPrice: SC.NIL_TRIGGER_PRICE,
      OrderExpiry: Date.now() + (60 * 60 * 1000), // 1h expiry (milliseconds)
      Nonce: nextNonce.nonce,
      ApiKeyIndex: apiKeyIndex,
      AccountIndex: accountIndex,
      ExpiredAt: Date.now() + (10 * 60 * 1000)
    };

    // Sign the transaction using Rust WASM
    console.log('📝 Signing transaction...');
    const signedResponse = await rustSigner.signCreateOrder(JSON.stringify(txStruct));
    
    if (signedResponse.error) {
      throw new Error(`Failed to sign order: ${signedResponse.error}`);
    }
    
    console.log('✅ Transaction signed successfully');
    const signedTx = { txInfo: signedResponse.txInfo, txType: signedResponse.txType || SC.TX_TYPE_CREATE_ORDER };

    console.log('\n🔌 Connecting to WebSocket...');
    await wsOrderClient.connect();
    console.log('✅ WebSocket connected');
    // Wait for initial connection message
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      console.log('\n📤 Sending transaction via WebSocket...');
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
          // Get a fresh nonce for HTTP fallback
          const freshNonce = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);
          
          // Re-sign with fresh nonce
          const fallbackTxStruct = {
            ...JSON.parse(signedTx.txInfo),
            Nonce: freshNonce.nonce
          };
          delete fallbackTxStruct.Sig; // Remove old signature
          
          const freshSignedResponse = await rustSigner.signCreateOrder(JSON.stringify(fallbackTxStruct));
          if (freshSignedResponse.error) {
            throw new Error(`Failed to re-sign: ${freshSignedResponse.error}`);
          }
          
          const httpResult = await transactionApi.sendTxWithIndices(
            freshSignedResponse.txType || SC.TX_TYPE_CREATE_ORDER,
            freshSignedResponse.txInfo,
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
