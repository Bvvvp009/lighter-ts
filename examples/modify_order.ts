/**
 * Example: Create a Limit Order and Modify It (with Position Verification)
 * 
 * This example demonstrates:
 * 1. Checking initial position state
 * 2. Creating a limit order (market orders execute immediately, so we use limit orders)
 * 3. Waiting for the order to be confirmed
 * 4. Finding the order index from active orders
 * 5. Modifying the order's parameters (price, amount, trigger price)
 * 6. Verifying the order modification
 * 7. Checking position changes after modification (if order was filled)
 */

import { SignerClient, ApiClient, OrderApi, AccountApi, OrderType, MarketHelper } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 8 * 60 * 60): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function modifyOrderExample() {
  // Use testnet credentials (matching create_market_order.ts for consistency)
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '271', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '4', 10);
  const BASE_URL = 'https://testnet.zklighter.elliot.ai';
  const MARKET_ID = 0; // ETH/USDC perps

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);
  const accountApi = new AccountApi(apiClient);

  try {
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    const market = new MarketHelper(MARKET_ID, orderApi);
    await market.initialize();
    const lastPriceUnits = market.priceToUnits(market.lastPrice || 2800);
    const marketDetails = await orderApi.getOrderBookDetails({ market_id: MARKET_ID });

    // Get auth token for account queries (used throughout the example)
    const auth = await getAuthToken(signerClient, 8 * 60 * 60);

    // Step 0: Check initial position state
    console.log('📊 Step 0: Checking initial position state...\n');
    let account;
    try {
      account = await accountApi.getAccount({ by: 'index', value: ACCOUNT_INDEX.toString() });
      const position = account.positions?.find(p => p.market_id === MARKET_ID);
      if (position) {
        console.log(`   Position: ${position.side.toUpperCase()} ${position.size} @ $${parseInt(position.entry_price) / 100}`);
        console.log(`   Mark Price: $${parseInt(position.mark_price) / 100}`);
        console.log(`   Unrealized PnL: $${parseInt(position.unrealized_pnl) / 100}\n`);
      } else {
        console.log(`   No position found for market ${MARKET_ID}\n`);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not fetch account info: ${trimException(error as Error)}\n`);
    }

    // Step 1: Create a limit order first (since market orders execute immediately)
    console.log('📝 Step 1: Creating a limit order to modify...\n');
    
    const clientOrderIndex = Date.now();
    const initialPrice = Math.max(1, Math.floor(lastPriceUnits * 0.99)); // Slightly below market for BUY limit
    const minBaseAmount = Math.ceil(Number(marketDetails.min_base_amount || 0));
    const minQuoteAmount = Math.ceil(Number(marketDetails.min_quote_amount || 0));
    const baseFromQuoteFloor = initialPrice > 0 ? Math.ceil((minQuoteAmount * 2) / initialPrice) : 0;
    const initialAmount = Math.max(market.amountToUnits(0.05), minBaseAmount * 2, baseFromQuoteFloor);

    const [createTx, createTxHash, createError] = await signerClient.createOrder({
      marketIndex: MARKET_ID,
      clientOrderIndex: clientOrderIndex,
      baseAmount: initialAmount,
      price: initialPrice,
      isAsk: false, // Buy order
      orderType: OrderType.LIMIT,
      orderExpiry: Date.now() + (60 * 60 * 1000) // Expires in 1 hour
    });

    if (createError || !createTxHash) {
      console.error(`❌ Failed to create order: ${createError}`);
      return;
    }

    console.log(`✅ Limit order created: ${createTxHash}`);
    console.log(`   Client Order Index: ${clientOrderIndex}`);
    console.log(`   Initial Price: $${initialPrice / 100}`);
    console.log(`   Initial Amount: ${initialAmount} units\n`);

    // Step 2: Wait for order to be confirmed
    console.log('⏳ Step 2: Waiting for order confirmation...');
    try {
      await signerClient.waitForTransaction(createTxHash, 30000, 2000);
      console.log('✅ Order confirmed!\n');
    } catch (error) {
      console.error(`❌ Order confirmation failed: ${trimException(error as Error)}`);
      return;
    }

    // Step 3: Wait a bit for order to appear in active orders list
    console.log('⏳ Step 3: Waiting for order to appear in active orders...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Find the order in active orders list
    console.log('📋 Step 4: Finding order in active orders list...');
    const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_ID, auth);
    
    // Find order by clientOrderIndex
    const order = activeOrders.find(o => 
      o.client_order_index?.toString() === clientOrderIndex.toString() ||
      o.client_order_id === clientOrderIndex.toString()
    );

    if (!order) {
      console.error('❌ Order not found in active orders list');
      console.log(`   Searched for clientOrderIndex: ${clientOrderIndex}`);
      console.log(`   Found ${activeOrders.length} active orders`);
      if (activeOrders.length > 0) {
      }
      return;
    }

    const orderIndex = order.order_index || parseInt(order.id || order.order_id || '0', 10);
    if (!orderIndex || orderIndex === 0) {
      console.error('❌ Could not determine order index');
      return;
    }

    console.log(`✅ Order found!`);
    console.log(`   Order Index: ${orderIndex}`);
    console.log(`   Current Price: $${order.price ? parseInt(order.price) / 100 : 'N/A'}`);
    console.log(`   Current Amount: ${order.remaining_base_amount || order.remaining_size || 'N/A'}\n`);

    // Step 5: Modify the order
    console.log('📝 Step 5: Modifying order...');
    const newPrice = Math.max(1, Math.floor(lastPriceUnits * 0.995)); // Move closer to market while staying realistic
    const newAmount = Math.max(initialAmount + 1, Math.floor(initialAmount * 1.2)); // Increase size by ~20%
    const newTriggerPrice = 0; // No trigger price (0 for non-conditional orders)

    console.log(`   New Price: $${newPrice / 100}`);
    console.log(`   New Amount: ${newAmount} units`);
    console.log(`   Trigger Price: ${newTriggerPrice === 0 ? 'None' : `$${newTriggerPrice / 100}`}\n`);

    const [orderInfo, txHash, error] = await signerClient.modifyOrder(
      MARKET_ID,
      orderIndex,
      newAmount,
      newPrice,
      newTriggerPrice,
    );

    if (error) {
      console.error(`❌ Failed to modify order: ${error}`);
      return;
    }

    if (!txHash) {
      console.error('❌ No transaction hash returned');
      return;
    }

    console.log(`✅ Order modification submitted!`);
    console.log(`   Transaction Hash: ${txHash}\n`);

    // Step 6: Wait for modification to be confirmed
    console.log('⏳ Step 6: Waiting for modification confirmation...');
    try {
      await signerClient.waitForTransaction(txHash, 30000, 2000);
      console.log('✅ Order modified successfully!\n');
      
      // Step 7: Verify the modification by checking the order again
      console.log('🔍 Step 7: Verifying order modification...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for order to update
      
      const updatedOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_ID, auth);
      const updatedOrder = updatedOrders.find(o => 
        o.order_index === orderIndex ||
        o.id === orderIndex.toString() ||
        o.order_id === orderIndex.toString()
      );
      
      if (updatedOrder) {
        console.log('✅ Modified order verified!');
        const updatedPrice = updatedOrder.price ? parseInt(updatedOrder.price) / 100 : 'N/A';
        const updatedAmount = updatedOrder.remaining_base_amount || updatedOrder.remaining_size || 'N/A';
        console.log(`   Updated Price: $${updatedPrice}`);
        console.log(`   Updated Amount: ${updatedAmount} units`);
        console.log(`   Price Change: $${initialPrice / 100} → $${newPrice / 100}`);
        console.log(`   Amount Change: ${initialAmount} → ${newAmount} units\n`);
      } else {
        console.log('⚠️ Could not find updated order (may have been filled or cancelled)\n');
      }
      
      // Step 8: Check position after modification (if order was filled)
      console.log('📊 Step 8: Checking position after order modification...');
      try {
        const updatedAccount = await accountApi.getAccount({ by: 'index', value: ACCOUNT_INDEX.toString() });
        const updatedPosition = updatedAccount.positions?.find(p => p.market_id === MARKET_ID);
        
        if (updatedPosition) {
          const positionSize = parseFloat(updatedPosition.size);
          const initialPosition = account?.positions?.find(p => p.market_id === MARKET_ID);
          const initialSize = initialPosition ? parseFloat(initialPosition.size) : 0;
          
          console.log(`   Position: ${updatedPosition.side.toUpperCase()} ${updatedPosition.size} @ $${parseInt(updatedPosition.entry_price) / 100}`);
          console.log(`   Mark Price: $${parseInt(updatedPosition.mark_price) / 100}`);
          console.log(`   Unrealized PnL: $${parseInt(updatedPosition.unrealized_pnl) / 100}`);
          
          if (Math.abs(positionSize - initialSize) > 0.001) {
            console.log(`   Position Size Change: ${initialSize} → ${positionSize} (${positionSize - initialSize > 0 ? '+' : ''}${(positionSize - initialSize).toFixed(4)})\n`);
          } else {
            console.log(`   Position unchanged (order not filled yet)\n`);
          }
        } else {
          console.log(`   No position for market ${MARKET_ID}\n`);
        }
      } catch (error) {
        console.log(`   ⚠️ Could not fetch updated position: ${trimException(error as Error)}\n`);
      }
      
    } catch (waitError) {
      console.error(`❌ Modification confirmation failed: ${trimException(waitError as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('modify_order');
if (isMain) {
  modifyOrderExample().catch(console.error);
}

export { modifyOrderExample };


