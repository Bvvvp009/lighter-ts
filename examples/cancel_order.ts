// Cancel a Specific Order in a Market
// This example shows how to cancel a specific order or the top order in a market

import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { waitAndCheckTransaction, printTransactionResult } from '../src/utils/transaction-helper';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

// Configuration - Set these values or pass as environment variables
const MARKET_INDEX = parseInt(process.env['MARKET_INDEX'] || '0', 10); // Market to cancel order in (0 = ETH/USDC)
const ORDER_INDEX = parseInt(process.env['ORDER_INDEX'] || '-1', 10); // -1 = cancel top order
const CLIENT_ORDER_INDEX = process.env['CLIENT_ORDER_INDEX']; // Optional: cancel by client order index

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  console.log('🎯 Cancel Specific Order Example\n');
  console.log(`📊 Market Index: ${MARKET_INDEX}`);
  console.log(`📍 Order Index: ${ORDER_INDEX === -1 ? 'Auto (top order)' : ORDER_INDEX}`);
  if (CLIENT_ORDER_INDEX) {
    console.log(`📍 Client Order Index: ${CLIENT_ORDER_INDEX}`);
  }
  console.log();

  try {
    // Get account data which includes orders
    const accountApi = (client as any).accountApi;
    const account = await accountApi.getAccount({
      by: 'index',
      value: ACCOUNT_INDEX.toString()
    });

    if (!account.orders || !Array.isArray(account.orders)) {
      console.log(`ℹ️  No orders data available`);
      await client.close();
      return;
    }

    // Filter for open orders in the specified market (not filled or cancelled)
    const openOrders = account.orders.filter(
      (order: any) => (order.status === 'open' || order.status === 'active') && 
                      order.market_id === MARKET_INDEX
    );

    if (openOrders.length === 0) {
      console.log(`ℹ️  No open orders found in market ${MARKET_INDEX}`);
      await client.close();
      return;
    }

    console.log(`📋 Found ${openOrders.length} open order(s) in market ${MARKET_INDEX}:\n`);
    openOrders.forEach((order: any, idx: number) => {
      console.log(`   ${idx + 1}. ${order.is_ask ? 'SELL' : 'BUY'}: ${order.size} units @ $${parseFloat(order.price) / 1000}`);
      console.log(`      Order Index: ${order.order_id}`);
      console.log(`      Client Order Index: ${order.client_order_id || 'N/A'}`);
      console.log(`      Filled: ${order.filled_size || 0} units\n`);
    });

    // Select order to cancel
    let orderToCancel;
    if (CLIENT_ORDER_INDEX) {
      // Find by client order index
      orderToCancel = openOrders.find((order: any) => order.client_order_id === CLIENT_ORDER_INDEX);
      if (!orderToCancel) {
        console.error(`❌ No order found with client order index ${CLIENT_ORDER_INDEX}`);
        await client.close();
        return;
      }
      console.log(`🎯 Canceling order with client order index ${CLIENT_ORDER_INDEX}...`);
    } else if (ORDER_INDEX === -1) {
      // Cancel the first (top) order
      orderToCancel = openOrders[0];
      console.log(`🎯 Canceling top order (auto-selected)...`);
    } else if (ORDER_INDEX < openOrders.length) {
      orderToCancel = openOrders[ORDER_INDEX];
      console.log(`🎯 Canceling order #${ORDER_INDEX + 1}...`);
    } else {
      console.error(`❌ Order index ${ORDER_INDEX} out of range (0-${openOrders.length - 1})`);
      await client.close();
      return;
    }

    console.log(`\n📝 Canceling order: ${orderToCancel.is_ask ? 'SELL' : 'BUY'} ${orderToCancel.size} @ $${parseFloat(orderToCancel.price) / 1000}`);
    console.log(`   Order ID: ${orderToCancel.order_id}`);

    // Cancel the order
    const [cancelTx, cancelTxHash, cancelErr] = await client.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex: parseInt(orderToCancel.order_id),
    });

    if (cancelErr) {
      console.error(`❌ Failed to cancel order: ${cancelErr}`);
      await client.close();
      return;
    }

    console.log('\n✅ Order cancellation submitted successfully!');
    console.log('📋 Cancellation Details:');
    console.log(`   Market Index: ${cancelTx.MarketIndex}`);
    console.log(`   Order Index: ${cancelTx.OrderIndex}`);
    console.log(`   Nonce: ${cancelTx.Nonce}`);
    console.log(`   TX Hash: ${cancelTxHash}`);

    // Wait for transaction confirmation with proper error handling
    if (cancelTxHash) {
      console.log('');
      const apiClient = new ApiClient({ host: BASE_URL });
      const result = await waitAndCheckTransaction(apiClient, cancelTxHash);
      printTransactionResult('Order Cancellation', cancelTxHash, result);
      await apiClient.close();
      
      if (result.success) {
        console.log('\n🎉 Order successfully canceled!');
      } else if (result.error) {
        console.log(`\n❌ Cancellation failed: ${result.error}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

