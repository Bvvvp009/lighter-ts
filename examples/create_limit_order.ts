/**
 * Example: Create Limit Order with SL/TP
 */

import { SignerClient, OrderType, ApiClient, OrderApi, MarketHelper } from '../src';
import * as dotenv from 'dotenv';
import { getAccountIndex } from './utils/account-helper';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function createLimitOrderWithSLTP() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '5', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  // Fetch account index dynamically
  const ACCOUNT_INDEX = await getAccountIndex(BASE_URL);
  if (!ACCOUNT_INDEX) {
    throw new Error('Account not found. Please ensure ETH_PRIVATE_KEY is set in .env or ACCOUNT_INDEX is provided.');
  }

  console.log('🚀 Creating Limit Order with SL/TP...');
  console.log(`📋 Using account index: ${ACCOUNT_INDEX}`);
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

  const orderExpiry = Date.now() + (60 * 60 * 1000); // 1 hour expiry in milliseconds
  const order_index = Date.now();
  const orders = [
    {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 100, // Small order (0.001 ETH)
      price: 294000,
      isAsk: false, // Buy
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0, // NIL_TRIGGER_PRICE for limit orders
      orderExpiry: orderExpiry
    },
    {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 100, // Same as main order for OTOCO
      price: 300000, // Take profit price
      isAsk: true, // Opposite of main order direction (SELL)
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0, // NIL_TRIGGER_PRICE for limit orders in OTOCO
      orderExpiry: orderExpiry
    },
    {
      marketIndex: 0,
      clientOrderIndex: 0, // MUST be 0 for grouped orders
      baseAmount: 100, // Same as main order for OTOCO
      price: 290000, // Stop loss price
      isAsk: true, // Opposite of main order direction (SELL)
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: true, // Reduce only for stop loss
      triggerPrice: 0, // NIL_TRIGGER_PRICE for limit orders in OTOCO
      orderExpiry: orderExpiry
    }
  ];

  try {
    const [txInfo, txHash, error] = await signerClient.createGroupedOrders(3, orders);

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

    console.log(`✅ Grouped OTOCO order created: ${txHash.substring(0, 16)}...`);
    console.log(`   Main order: Buy 100 @ $2940`);
    console.log(`   Take-profit: Sell @ trigger $3000`);
    console.log(`   Stop-loss: Sell @ trigger $2700`);

    try {
      // Wait for main order transaction
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
      
      console.log(`\n✅ Limit order placed: ${txHash.substring(0, 16)}...`);
      
      // Note: With createGroupedOrders, all orders are created in a single transaction
      // The transaction hash represents the entire OTOCO group

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
