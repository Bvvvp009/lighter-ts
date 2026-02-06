import { SignerClient, ApiClient, OrderType, TransactionApi } from '../src';
import { RustWasmOrderSigner } from '../src/signer/rust-wasm-adapter';
import * as dotenv from 'dotenv';

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
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    // Use RustWasmOrderSigner directly for batch signing
    const rustSigner = new RustWasmOrderSigner(API_PRIVATE_KEY);

    // Get chainId from signerClient
    const chainId = (signerClient as any).chainId || 304;

    const nonces = await (signerClient as any).getNextNonces(2);
    const txTypes: number[] = [];
    const txInfos: string[] = [];
    const baseIndex = Date.now();
    const orderExpiry = Date.now() + (60 * 60 * 1000);

    // Sign first order using Rust WASM
    const firstTxStruct = {
      ChainId: chainId,
      MarketIndex: 0,
      ClientOrderIndex: baseIndex,
      BaseAmount: 100000,
      Price: 292000,
      IsAsk: 1,
      Type: SignerClient.ORDER_TYPE_LIMIT,
      TimeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      ReduceOnly: 0,
      TriggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      OrderExpiry: orderExpiry,
      Nonce: nonces[0],
      ApiKeyIndex: API_KEY_INDEX,
      AccountIndex: ACCOUNT_INDEX,
      ExpiredAt: Date.now() + (10 * 60 * 1000)
    };
    
    const firstTxResponse = await rustSigner.signCreateOrder(JSON.stringify(firstTxStruct));
    
    if (firstTxResponse.error) {
      console.error(`❌ First order signing failed: ${firstTxResponse.error}`);
      return;
    }
    
    txTypes.push(firstTxResponse.txType || SignerClient.TX_TYPE_CREATE_ORDER);
    txInfos.push(firstTxResponse.txInfo);

    // Sign second order using Rust WASM
    const secondTxStruct = {
      ChainId: chainId,
      MarketIndex: 0,
      ClientOrderIndex: baseIndex + 1,
      BaseAmount: 200000,
      Price: 293000,
      IsAsk: 0,
      Type: SignerClient.ORDER_TYPE_LIMIT,
      TimeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      ReduceOnly: 0,
      TriggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      OrderExpiry: orderExpiry,
      Nonce: nonces[1],
      ApiKeyIndex: API_KEY_INDEX,
      AccountIndex: ACCOUNT_INDEX,
      ExpiredAt: Date.now() + (10 * 60 * 1000)
    };
    
    const secondTxResponse = await rustSigner.signCreateOrder(JSON.stringify(secondTxStruct));
    
    if (secondTxResponse.error) {
      console.error(`❌ Second order signing failed: ${secondTxResponse.error}`);
      return;
    }
    
    txTypes.push(secondTxResponse.txType || SignerClient.TX_TYPE_CREATE_ORDER);
    txInfos.push(secondTxResponse.txInfo);

    // Send batch
    const transactionApi = new TransactionApi(apiClient);
    const batchResult = await transactionApi.sendTransactionBatch({
      tx_types: JSON.stringify(txTypes),
      tx_infos: JSON.stringify(txInfos)
    });
    
    if (batchResult.code && batchResult.code !== 200) {
      console.error(`❌ Batch failed: ${batchResult.message || 'Unknown error'}`);
      return;
    }

    if (batchResult.tx_hash && Array.isArray(batchResult.tx_hash)) {
      for (const hash of batchResult.tx_hash) {
        if (hash) {
          try {
            await signerClient.waitForTransaction(hash, 30000, 2000);
          } catch (error) {
            console.error(`❌ Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
      console.log(`✅ Batch completed: ${batchResult.tx_hash.length} transaction(s)`);
    }

  } catch (error) {
    console.error(`❌ Error:`, error);
    await apiClient.close();
  }
}

main();