/**
 * Example: WebSocket Batch Transaction Sending
 * Demonstrates attempting to send batch transactions via WebSocket using WebSocketOrderClient
 * 
 * NOTE: As of testing, the WebSocket endpoint (/stream) does not appear to support
 * transaction submission on testnet. Transactions time out. The example includes
 * automatic fallback to HTTP API.
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

    // Get Rust WASM signer for signing without sending
    const rustSigner = (signerClient as any).rustSigner;
    if (!rustSigner) {
      throw new Error('Rust WASM signer not available');
    }

    // Get chainId from signerClient
    const chainId = (signerClient as any).chainId || 304;

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
    const orderExpiry = Date.now() + (60 * 60 * 1000); // 1 hour (milliseconds)
    const market = new MarketHelper(0, new (require('../src').OrderApi)(apiClient));
    await market.initialize();
    const tinyAmount1 = market.amountToUnits(0.05); // Slightly larger amount
    const tinyAmount2 = market.amountToUnits(0.05); // Slightly larger amount
    
    // Get current market price and set reasonable prices (within 20% of market)
    const currentPrice = (market as any).lastPrice || market.priceToUnits(3000);
    const buyPrice = Math.floor(currentPrice * 0.85); // 15% below market
    const sellPrice = Math.floor(currentPrice * 1.15); // 15% above market
    
    console.log(`📊 Market info: currentPrice=${currentPrice}, buyPrice=${buyPrice}, sellPrice=${sellPrice}`);
    console.log(`📊 Amounts: amount1=${tinyAmount1}, amount2=${tinyAmount2}`);

    // Order 1: Limit buy order
    console.log('📝 Signing first order...');
    const firstTxStruct = {
      ChainId: chainId,
      MarketIndex: 0,
      ClientOrderIndex: baseIndex,
      BaseAmount: tinyAmount1,
      Price: buyPrice,
      IsAsk: 0, // BUY
      Type: OrderType.LIMIT,
      TimeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      ReduceOnly: 0,
      TriggerPrice: SC.NIL_TRIGGER_PRICE,
      OrderExpiry: orderExpiry,
      Nonce: nonces[0],
      ApiKeyIndex: apiKeyIndex,
      AccountIndex: accountIndex,
      ExpiredAt: Date.now() + (10 * 60 * 1000)
    };
    
    const firstTxResponse = await rustSigner.signCreateOrder(JSON.stringify(firstTxStruct));

    if (firstTxResponse.error) {
      throw new Error(`First order signing failed: ${firstTxResponse.error}`);
    }

    txTypes.push(firstTxResponse.txType || SC.TX_TYPE_CREATE_ORDER);
    txInfos.push(firstTxResponse.txInfo); // ✅ Push txInfo string, not hash
    console.log('✅ First order signed successfully');

    // Order 2: Limit sell order
    console.log('📝 Signing second order...');
    const secondTxStruct = {
      ChainId: chainId,
      MarketIndex: 0,
      ClientOrderIndex: baseIndex + 1,
      BaseAmount: tinyAmount2,
      Price: sellPrice,
      IsAsk: 1, // SELL
      Type: OrderType.LIMIT,
      TimeInForce: SC.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      ReduceOnly: 0,
      TriggerPrice: SC.NIL_TRIGGER_PRICE,
      OrderExpiry: orderExpiry,
      Nonce: nonces[1],
      ApiKeyIndex: apiKeyIndex,
      AccountIndex: accountIndex,
      ExpiredAt: Date.now() + (10 * 60 * 1000)
    };
    
    const secondTxResponse = await rustSigner.signCreateOrder(JSON.stringify(secondTxStruct));

    if (secondTxResponse.error) {
      throw new Error(`Second order signing failed: ${secondTxResponse.error}`);
    }

    txTypes.push(secondTxResponse.txType || SC.TX_TYPE_CREATE_ORDER);
    txInfos.push(secondTxResponse.txInfo); // ✅ Push txInfo string, not hash
    console.log('✅ Second order signed successfully');

    if (txInfos.length === 0) {
      throw new Error('No transactions were signed successfully');
    }

    // Skip WebSocket (currently not working on testnet) and go directly to HTTP
    console.log('\n📡 Sending batch transactions via HTTP API...');
    console.log(`   Batch size: ${txInfos.length} transactions`);
    
    try {
      const httpResult = await transactionApi.sendTransactionBatch({
        tx_types: JSON.stringify(txTypes),
        tx_infos: JSON.stringify(txInfos)
      });
      
      if (httpResult.hashes || httpResult.tx_hash) {
        const hashes = httpResult.hashes || httpResult.tx_hash || [];
        console.log(`✅ Batch transactions sent via HTTP: ${hashes.length} transaction(s)`);
        
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
      } else {
        console.error('❌ No transaction hashes returned');
      }
    } catch (error) {
      console.error('❌ HTTP batch send failed:', error instanceof Error ? error.message : 'Unknown');
      throw error;
    }

    /* WebSocket sending disabled - currently not working on testnet */

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
