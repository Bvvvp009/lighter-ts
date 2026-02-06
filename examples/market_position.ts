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
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '237600', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '5', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
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
    avgExecutionPrice: currentPrice,
   // maxSlippage: 0.001, // 0.1% max slippage
    isAsk: false, // Buy
    reduceOnly: false,
  }
  
   // const [txInfo, txHash, error] = await signerClient.createGroupedOrders(3, orders);
    const [txInfo, txHash, error] = await signerClient.createMarketOrder(marketOrderParams);


    // Log detailed results
    console.log(`\n📊 Order Creation Results:`);
    console.log(`   Error: ${error || 'None'}`);
    console.log(`   Tx Hash: ${txHash}`);
    
    if (error) {
      console.error(`❌ Order failed: ${error}`);
      return;
    }

    if (!txHash) {
      console.error(`❌ No transaction hash returned`);
      return;
    }
    
    console.log(`✅ Market order created: ${txHash.substring(0, 16)}...`);
    console.log(`   Main order: Market buy ${marketOrderParams.baseAmount} units`);
    console.log(`   Avg Execution Price: $${(marketOrderParams.avgExecutionPrice || 0) / 100}`);

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
    
}

if (require.main === module) {
  createMarketOrderExample().catch(console.error);
}

export { createMarketOrderExample };
