/**
 * Example: Create Limit Order with SL/TP
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../src';
import dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createLimitOrderWithSLTP() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "1000");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "1");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);
  
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  // Initialize market helper once
  const market = new MarketHelper(0, orderApi);
  await market.initialize();

  const limitOrderParams = {
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: market.amountToUnits(0.01),
    price: market.priceToUnits(4050),
    isAsk: false, // Buy
    orderType: OrderType.LIMIT,
    orderExpiry: Date.now() + (60 * 60 * 1000),
    stopLoss: {
      triggerPrice: market.priceToUnits(4000),
      isLimit: false
    },
    takeProfit: {
      triggerPrice: market.priceToUnits(4100),
      isLimit: false
    }
  };

  try {
    const result = await signerClient.createUnifiedOrder(limitOrderParams);

    if (result.success) {
      console.log(`✓ Limit order created: ${result.mainOrder.hash.substring(0, 16)}...`);
      
      // Wait for main order
      try {
        await signerClient.waitForTransaction(result.mainOrder.hash, 30000, 2000);
        console.log('✓ Limit order placed');
      } catch (error) {
        console.error(`❌ Limit order failed: ${trimException(error as Error)}`);
      }
      
      // Wait for SL/TP orders
      if (result.batchResult.hashes.length > 0) {
        console.log(`✓ ${result.batchResult.hashes.length} SL/TP order(s) pending`);
        for (const hash of result.batchResult.hashes) {
          if (hash) {
            try {
              await signerClient.waitForTransaction(hash, 30000, 2000);
            } catch (error) {
              // SL/TP errors are logged but don't fail the main order
              console.log(`⚠️ SL/TP: ${trimException(error as Error)}`);
            }
          }
        }
      }
    } else {
      console.error(`❌ Order failed: ${result.mainOrder.error || 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

if (require.main === module) {
  createLimitOrderWithSLTP().catch(console.error);
}

export { createLimitOrderWithSLTP };
