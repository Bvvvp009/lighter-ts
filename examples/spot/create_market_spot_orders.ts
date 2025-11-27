/**
 * Example: Create Market Spot Orders on Testnet
 * NOTE: Market indices: 2048 (ETH SPOT), 2049 (Prove SPOT), 2050 (Zk SPOT)
 * NOTE: Spot markets are currently testnet-only
 */

import { SignerClient, OrderType, ApiClient } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

interface OrderResult {
  marketIndex: number;
  marketName: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

async function createMarketSpotOrders() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  // Spot markets are testnet-only for now
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';

  console.log(`📋 Creating Market Spot Orders on Testnet`);
  console.log(`   Account Index: ${ACCOUNT_INDEX}`);
  console.log(`   API Key Index: ${API_KEY_INDEX}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  const results: OrderResult[] = [];

  // ETH SPOT Market Order
  // For ETH SPOT: 1 ETH = 1,000,000 units, $1 = 100 price units
  // 0.001 ETH = 1,000 units
  // $3500 = 350,000 price units (max execution price)
  const ethMarketOrder = {
    marketIndex: 2048, // ETH SPOT
    clientOrderIndex: Date.now() + 1,
    baseAmount: 1000, // 0.001 ETH (1,000 units)
    price: 350000, // $3500 max execution price (350,000 price units)
    isAsk: false, // Buy order
    orderType: OrderType.MARKET,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
    orderExpiry: 0, // NilOrderExpiry for market orders
    reduceOnly: false,
    triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
  };

  // Note: SOL SPOT (2051) may not be supported for market orders yet
  // Start with ETH SPOT (2048) which is known to work for limit orders
  const orders = [
    { params: ethMarketOrder, name: 'ETH SPOT' },
    // Uncomment when SOL SPOT market orders are supported
    // { params: solMarketOrder, name: 'SOL SPOT' }
  ];

  for (const { params, name } of orders) {
    console.log(`\n📝 Placing ${name} Market Order:`);
    console.log(`   Market Index: ${params.marketIndex}`);
    console.log(`   Base Amount: ${params.baseAmount} units`);
    console.log(`   Max Execution Price: ${params.price} units`);
    console.log(`   Side: ${params.isAsk ? 'SELL' : 'BUY'}\n`);

    try {
      const [orderInfo, txHash, error] = await signerClient.createOrder(params);

      if (error || !txHash) {
        const errorMsg = error || 'No transaction hash';
        console.error(`❌ ${name} order failed: ${errorMsg}`);
        
        // Handle nonce errors by refreshing nonce cache
        if (errorMsg.includes('invalid nonce') || errorMsg.includes('nonce')) {
          console.log(`   🔄 Refreshing nonce cache due to nonce error...`);
          try {
            // Access the nonce manager to refresh
            const nonceManager = (signerClient as any).nonceManager;
            if (nonceManager) {
              await nonceManager.hardRefreshNonce(API_KEY_INDEX);
              console.log(`   ✅ Nonce cache refreshed`);
            }
          } catch (refreshError) {
            console.warn(`   ⚠️ Could not refresh nonce cache: ${refreshError}`);
          }
        }
        
        if (errorMsg.includes('invalid signature')) {
          console.error(`   💡 Signature validation failed. Please verify:`);
          console.error(`   1. Private key matches the API key at index ${API_KEY_INDEX}`);
          console.error(`   2. API key is properly registered for account ${ACCOUNT_INDEX}`);
          console.error(`   3. If API key was just registered, wait a few seconds and try again`);
        }
        
        if (errorMsg.includes('invalid perps market index')) {
          console.error(`   💡 This market index may not be supported for market orders yet.`);
          console.error(`   Try using a limit order instead, or verify the market index is correct.`);
        }
        
        results.push({
          marketIndex: params.marketIndex,
          marketName: name,
          success: false,
          error: errorMsg
        });
        
        // Add delay after error to avoid nonce conflicts
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      console.log(`   ✅ Order signed and submitted! TX Hash: ${txHash.substring(0, 20)}...`);

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
                  console.error(`❌ ${name} order failed: ${errorData.message}`);
                  results.push({
                    marketIndex: params.marketIndex,
                    marketName: name,
                    success: false,
                    error: errorData.message
                  });
                  continue;
                }
              } catch {
                // If not JSON, check if it's an error string
                if (typeof eventInfo.ae === 'string' && eventInfo.ae.length > 0) {
                  console.error(`❌ ${name} order failed: ${eventInfo.ae}`);
                  results.push({
                    marketIndex: params.marketIndex,
                    marketName: name,
                    success: false,
                    error: eventInfo.ae
                  });
                  continue;
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
          console.error(`❌ ${name} order failed: ${errorMsg}`);
          results.push({
            marketIndex: params.marketIndex,
            marketName: name,
            success: false,
            error: errorMsg
          });
          continue;
        }
        
        // Check transaction status - if it's FAILED or REJECTED, show error
        const status = typeof transaction.status === 'number' ? transaction.status : parseInt(String(transaction.status), 10);
        if (status === 4 || status === 5) { // FAILED or REJECTED
          const errorMsg = transaction.message || 'Transaction failed';
          console.error(`❌ ${name} order failed: ${errorMsg}`);
          results.push({
            marketIndex: params.marketIndex,
            marketName: name,
            success: false,
            error: errorMsg
          });
          continue;
        }
        
        console.log(`✅ ${name} Market order placed successfully!`);
        console.log(`   Transaction Hash: ${txHash.substring(0, 16)}...`);
        results.push({
          marketIndex: params.marketIndex,
          marketName: name,
          success: true,
          txHash: txHash
        });
      } catch (error) {
        const errorMsg = trimException(error as Error);
        console.error(`❌ ${name} order failed: ${errorMsg}`);
        results.push({
          marketIndex: params.marketIndex,
          marketName: name,
          success: false,
          error: errorMsg
        });
      }
    } catch (error) {
      const errorMsg = trimException(error as Error);
      console.error(`❌ ${name} order error: ${errorMsg}`);
      results.push({
        marketIndex: params.marketIndex,
        marketName: name,
        success: false,
        error: errorMsg
      });
    }

    // Small delay between orders to avoid nonce conflicts
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log(`\n\n📊 Order Summary:`);
  console.log(`═══════════════════════════════════════`);
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.marketName} (${result.marketIndex}): SUCCESS`);
      console.log(`   TX: ${result.txHash?.substring(0, 20)}...`);
    } else {
      console.log(`❌ ${result.marketName} (${result.marketIndex}): FAILED`);
      console.log(`   Error: ${result.error}`);
    }
  }
  console.log(`═══════════════════════════════════════`);
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ Successfully placed: ${successCount}/${results.length} orders`);

  await signerClient.close();
  await apiClient.close();

  return results;
}

if (require.main === module) {
  createMarketSpotOrders().catch(console.error);
}

export { createMarketSpotOrders };

