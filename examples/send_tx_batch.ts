import { SignerClient, ApiClient, OrderType, TransactionApi } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const BASE_URL = process.env.BASE_URL || "https://mainnet.zklighter.elliot.ai";
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || "";
  const ACCOUNT_INDEX = parseInt(process.env.ACCOUNT_INDEX || "1000");
  const API_KEY_INDEX = parseInt(process.env.API_KEY_INDEX || "4");

  const apiClient = new ApiClient({ host: BASE_URL });
  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  try {
    console.log('🚀 Sending Batch Transactions...\n');

    // Initialize WASM client (required)
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Check client connection
    const checkError = signerClient.checkClient();
    if (checkError) {
      console.error(`❌ CheckClient error: ${checkError}`);
      await apiClient.close();
      return;
    }

    console.log(`📋 Preparing batch transactions...\n`);

    // Get nonces for batch (ensures sequential nonces without conflicts)
    // Access private method through instance
    const nonces = await (signerClient as any).getNextNonces(2);
    console.log(`📋 Acquired nonces: ${nonces.join(', ')}\n`);

    // Create batch transactions
    const txTypes = [SignerClient.TX_TYPE_CREATE_ORDER, SignerClient.TX_TYPE_CREATE_ORDER];
    const txInfos: string[] = [];

    // Use unique client order indices to avoid conflicts
    const baseIndex = Date.now();
    const orderExpiry = Date.now() + (60 * 60 * 1000); // 1 hour from now

    // First order - sign directly with WASM signer
    console.log(`📋 Signing first order...`);
    try {
      const firstTxInfo = await (signerClient as any).wallet.signCreateOrder({
        marketIndex: 0,
        clientOrderIndex: baseIndex,
        baseAmount: 100000, // 0.01 ETH
        price: 440000, // $4400
        isAsk: 1, // SELL
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: 0,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: orderExpiry,
        nonce: nonces[0]
      });
      
      txInfos.push(firstTxInfo);
      console.log(`✅ First order signed successfully`);
    } catch (firstError) {
      console.error(`❌ First order signing failed:`, firstError);
      await apiClient.close();
      return;
    }

    // Second order - sign directly with WASM signer (uses different nonce)
    console.log(`📋 Signing second order...`);
    try {
      const secondTxInfo = await (signerClient as any).wallet.signCreateOrder({
        marketIndex: 0,
        clientOrderIndex: baseIndex + 1,
        baseAmount: 200000, // 0.02 ETH
        price: 400000, // $4000
        isAsk: 0, // BUY
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        reduceOnly: 0,
        triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
        orderExpiry: orderExpiry,
        nonce: nonces[1]
      });
      
      txInfos.push(secondTxInfo);
      console.log(`✅ Second order signed successfully`);
    } catch (secondError) {
      console.error(`❌ Second order signing failed:`, secondError);
      await apiClient.close();
      return;
    }

    // Send batch transaction
    console.log(`\n📡 Sending batch transaction...`);
    console.log(`   Batch size: ${txInfos.length} transactions`);
    
    try {
      const transactionApi = new TransactionApi(apiClient);
      const batchResult = await transactionApi.sendTransactionBatch({
        tx_types: JSON.stringify(txTypes),
        tx_infos: JSON.stringify(txInfos)
      });
      
      if (batchResult.code && batchResult.code !== 200) {
        console.error(`❌ Batch transaction failed: ${batchResult.message || 'Unknown error'}`);
        await apiClient.close();
        return;
      }

      console.log(`✅ Batch transaction submitted successfully`);
      
      if (batchResult.tx_hash && Array.isArray(batchResult.tx_hash)) {
        console.log(`\n📋 Transaction Hashes:`);
        batchResult.tx_hash.forEach((hash, index) => {
          console.log(`   Order ${index + 1}: ${hash.substring(0, 16)}...`);
        });
        
        // Wait for all transactions
        console.log(`\n⏳ Waiting for confirmations...`);
        let successCount = 0;
        let failureCount = 0;
        
        for (let i = 0; i < batchResult.tx_hash.length; i++) {
          const hash = batchResult.tx_hash[i];
          if (!hash || hash === '') {
            console.error(`❌ Transaction ${i + 1}: No hash provided`);
            failureCount++;
            continue;
          }
          
          try {
            await signerClient.waitForTransaction(hash, 30000, 2000);
            console.log(`✅ Transaction ${i + 1} confirmed`);
            successCount++;
          } catch (waitError) {
            console.error(`❌ Transaction ${i + 1} confirmation failed:`, waitError);
            failureCount++;
          }
        }
        
        console.log(`\n📊 Batch Summary: ${successCount} succeeded, ${failureCount} failed`);
      } else {
        console.warn('⚠️ No transaction hashes returned from batch submission');
      }

      console.log('\n🎉 Batch transaction complete!');
      await apiClient.close();
    } catch (e) {
      console.error(`❌ Error sending batch transaction:`, e);
      await apiClient.close();
    }

  } catch (error) {
    console.error(`❌ Error:`, error);
    await apiClient.close();
  }
}

main();