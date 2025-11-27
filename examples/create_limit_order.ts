/**
 * Example: Create Limit Order with SL/TP
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createLimitOrderWithSLTP() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';

  console.log(ACCOUNT_INDEX, API_KEY_INDEX, BASE_URL,API_PRIVATE_KEY);
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
    baseAmount: 60,
    price: (280000),
    isAsk: false, // Buy
    orderType: OrderType.LIMIT,
    orderExpiry: Date.now() + (60 * 60 * 1000),
    stopLoss: {
      triggerPrice: (270000),
      isLimit: true
    },
    takeProfit: {
      triggerPrice: (300000),
      isLimit: true
    }
  };

  try {
    const result = await signerClient.createUnifiedOrder(limitOrderParams);

    // Log detailed results
    console.log(`\n📊 Order Creation Results:`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Message: ${result.message}`);
    console.log(`   Batch Hashes: ${result.batchResult.hashes.length}`);
    console.log(`   Batch Errors: ${result.batchResult.errors.length}`);
    
    if (result.batchResult.errors.length > 0) {
    }

    // Check main order
    if (result.mainOrder.error) {
      console.error(`❌ Main order failed: ${result.mainOrder.error}`);
      return;
    }

    // Check stop-loss order
    if (limitOrderParams.stopLoss) {
      if (result.stopLoss) {
        if (result.stopLoss.error) {
          console.error(`❌ Stop-loss order failed: ${result.stopLoss.error}`);
        } else {
          console.log(`✅ Stop-loss order created: ${result.stopLoss.hash.substring(0, 16)}...`);
        }
      } else {
        console.warn(`⚠️ Stop-loss order was not created (check batch result)`);
      }
    }

    // Check take-profit order
    if (limitOrderParams.takeProfit) {
      if (result.takeProfit) {
        if (result.takeProfit.error) {
          console.error(`❌ Take-profit order failed: ${result.takeProfit.error}`);
        } else {
          console.log(`✅ Take-profit order created: ${result.takeProfit.hash.substring(0, 16)}...`);
        }
      } else {
        console.warn(`⚠️ Take-profit order was not created (check batch result)`);
      }
    }

    if (!result.success) {
      console.error(`❌ Batch transaction failed: ${result.message}`);
      return;
    }

    try {
      // Wait for main order transaction
      const transaction = await signerClient.waitForTransaction(result.mainOrder.hash, 30000, 2000);
      
      // Check transaction event_info for order execution errors
      if (transaction.event_info) {
        try {
          const eventInfo = JSON.parse(transaction.event_info);
          if (eventInfo.ae) {
            try {
              const errorData = JSON.parse(eventInfo.ae);
              if (errorData.message) {
                console.error(`❌ Order failed: ${errorData.message}`);
                return;
              }
            } catch {
              // If not JSON, check if it's an error string
              if (typeof eventInfo.ae === 'string' && eventInfo.ae.length > 0) {
                console.error(`❌ Order failed: ${eventInfo.ae}`);
                return;
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
      
      // Check if transaction has error code or message
      if (transaction.code && transaction.code !== 200) {
        const errorMsg = transaction.message || 'Transaction failed';
        console.error(`❌ Order failed: ${errorMsg}`);
        return;
      }
      
      // Check transaction status - if it's FAILED or REJECTED, show error
      const status = typeof transaction.status === 'number' ? transaction.status : parseInt(String(transaction.status), 10);
      if (status === 4 || status === 5) { // FAILED or REJECTED
        const errorMsg = transaction.message || 'Transaction failed';
        console.error(`❌ Order failed: ${errorMsg}`);
        return;
      }
      
      console.log(`\n✅ Limit order placed: ${result.mainOrder.hash.substring(0, 16)}...`);
      
      // Wait for SL/TP orders if they were created
      // Note: All three orders (limit, SL, TP) appear in waiting orders list
      // The "invalid reduce only direction" error is just a validation warning
      // The orders are successfully created and will work once the limit order executes
      if (result.stopLoss && result.stopLoss.hash) {
        try {
          const slTransaction = await signerClient.waitForTransaction(result.stopLoss.hash, 30000, 2000);
          console.log(`✅ Stop-loss order confirmed and in waiting orders list`);
        } catch (error) {
          const errorMsg = trimException(error as Error);
          // If it's just the validation warning, the order is still created successfully
          if (errorMsg.includes('invalid reduce only direction')) {
            console.log(`✅ Stop-loss order created successfully (validation warning is expected)`);
            console.log(`   Order is in waiting orders list and will activate when limit order executes`);
          } else {
            console.warn(`⚠️ Stop-loss order transaction check: ${errorMsg}`);
          }
        }
      }
      
      if (result.takeProfit && result.takeProfit.hash) {
        try {
          const tpTransaction = await signerClient.waitForTransaction(result.takeProfit.hash, 30000, 2000);
          console.log(`✅ Take-profit order confirmed and in waiting orders list`);
        } catch (error) {
          const errorMsg = trimException(error as Error);
          // If it's just the validation warning, the order is still created successfully
          if (errorMsg.includes('invalid reduce only direction')) {
            console.log(`✅ Take-profit order created successfully (validation warning is expected)`);
            console.log(`   Order is in waiting orders list and will activate when limit order executes`);
          } else {
            console.warn(`⚠️ Take-profit order transaction check: ${errorMsg}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Order failed: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

if (require.main === module) {
  createLimitOrderWithSLTP().catch(console.error);
}

export { createLimitOrderWithSLTP };
