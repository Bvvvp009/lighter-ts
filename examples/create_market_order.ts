/**
 * Example: Create Market Order with Error Handling and Status Checking
 */

import { SignerClient, ApiClient, OrderType } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createMarketOrderExample() {
  // Use testnet credentials (matching create_limit_order.ts - hardcoded for consistency)
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  const MARKET_ID = 0; // ETH/USDC perps
  const CLIENT_ORDER_INDEX = Date.now();

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });

  // Get current market price for better pricing
  const { OrderApi, MarketHelper } = await import('../src');
  const orderApi = new OrderApi(apiClient);
  const market = new MarketHelper(0, orderApi);
  await market.initialize();
  const currentPrice = (market as any).lastPrice || market.priceToUnits(2800) || 280000;
  
  const marketOrderParams = {
    marketIndex: MARKET_ID,
    clientOrderIndex: CLIENT_ORDER_INDEX,
    baseAmount: 60, // Small amount for testing (matching limit order example)
    idealPrice: 303282,
    maxSlippage: 0.001, // 0.1% max slippage
    isAsk: false, // Buy
    orderType: OrderType.MARKET,
    stopLoss: {
      triggerPrice:280000, // 5% below current price
      price: 280000,
      isLimit: false // Market SL
    },
    takeProfit: {
      triggerPrice: 310000, // 5% above current price
      price: 300000,
      isLimit: false // Market TP
    }
  }
  
  console.log(`📝 Creating MARKET order with SL/TP (using OTOCO)`);
  console.log(`   Market Index: ${MARKET_ID}`);
  console.log(`   Base Amount: ${marketOrderParams.baseAmount} units`);
  console.log(`   Ideal Price: ${marketOrderParams.idealPrice} ($${marketOrderParams.idealPrice / 100})`);
  console.log(`   SL Trigger: ${marketOrderParams.stopLoss.triggerPrice} ($${marketOrderParams.stopLoss.triggerPrice / 100})`);
  console.log(`   TP Trigger: ${marketOrderParams.takeProfit.triggerPrice} ($${marketOrderParams.takeProfit.triggerPrice / 100})\n`);
  try {
    const result = await signerClient.createUnifiedOrder(marketOrderParams);

    // Log detailed results
    console.log(`\n📊 Order Creation Results:`);
    console.log(`   Success: ${result.success}`);
    console.log(`   Message: ${result.message}`);
    console.log(`   Batch Hashes: ${result.batchResult.hashes.length}`);
    console.log(`   Batch Errors: ${result.batchResult.errors.length}`);
    
    if (result.batchResult.errors.length > 0) {
    }

    if (!result.success || result.mainOrder.error) {
      console.error(`❌ Order failed: ${result.mainOrder.error || result.message || 'Unknown error'}`);
      return;
    }

    const txHash = result.mainOrder.hash;
    if (!txHash) {
      console.error(`❌ No transaction hash returned`);
      return;
    }
    
    // Check SL/TP orders
    if (marketOrderParams.stopLoss) {
      if (result.stopLoss) {
        if (result.stopLoss.error) {
          console.error(`❌ Stop-loss order failed: ${result.stopLoss.error}`);
        } else {
          console.log(`✅ Stop-loss order created: ${result.stopLoss.hash.substring(0, 16)}...`);
        }
      } else {
        console.warn(`⚠️ Stop-loss order was not created`);
      }
    }

    if (marketOrderParams.takeProfit) {
      if (result.takeProfit) {
        if (result.takeProfit.error) {
          console.error(`❌ Take-profit order failed: ${result.takeProfit.error}`);
        } else {
          console.log(`✅ Take-profit order created: ${result.takeProfit.hash.substring(0, 16)}...`);
        }
      } else {
        console.warn(`⚠️ Take-profit order was not created`);
      }
    }

    try {
      const transaction = await signerClient.waitForTransaction(txHash, 30000, 2000);
      
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
      
      console.log(`✅ Market order placed: ${txHash.substring(0, 16)}...`);
    } catch (error) {
      console.error(`❌ Order failed: ${trimException(error as Error)}`);
      return;
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  createMarketOrderExample().catch(console.error);
}

export { createMarketOrderExample };
