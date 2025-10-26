/**
 * Example: Create Market Order with Error Handling and Status Checking
 */

import { SignerClient, ApiClient, OrderApi, getCancelReason, checkOrderStatus, OrderType } from '../src';
import dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function getAuthToken(signerClient: SignerClient, expiryInSeconds: number = 3600): Promise<string> {
  const auth = await signerClient.createAuthTokenWithExpiry(expiryInSeconds);
  return auth;
}

async function createMarketOrderExample() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "52548");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const MARKET_ID = parseInt(process.env['MARKET_ID'] || '0');
  const CLIENT_ORDER_INDEX = Date.now(); // Unique identifier for tracking this order

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  const apiClient = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(apiClient);

  try {
    console.log('Submitting market order with SL/TP and slippage protection...')
    const result = await signerClient.createUnifiedOrder({
      marketIndex: MARKET_ID,
      clientOrderIndex: CLIENT_ORDER_INDEX,
      baseAmount: 10000, // 0.01 ETH
      idealPrice: 394000, // Current market price
      maxSlippage: 0.001, // 0.1% max slippage (default if not specified)
      isAsk: false, //BUY
      orderType: OrderType.MARKET,
      stopLoss: {
        triggerPrice: Math.round(380000),
        isLimit: false
      },
      takeProfit: {
        triggerPrice: Math.round(400000),
        isLimit: false
      }
    });

    if (!result.success) {
      console.log(`\n❌ Error creating order: ${result.mainOrder.error || 'Unknown error'}`);
      await signerClient.close();
      return;
    }

    const txHash = result.mainOrder.hash;

    if (!txHash || txHash === '') {
      console.log(`\n❌ No transaction hash returned`);
      await signerClient.close();
      return;
    }

    console.log(`\n✅ Transaction submitted successfully!`);
    console.log(`Main Order TX Hash: ${txHash}`);
    if (result.stopLoss) {
      console.log(`Stop Loss TX Hash: ${result.stopLoss.hash}`);
    }
    if (result.takeProfit) {
      console.log(`Take Profit TX Hash: ${result.takeProfit.hash}`);
    }

    await signerClient.close();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Checking order status for client_order_index: ${CLIENT_ORDER_INDEX}`);
    console.log(`${'='.repeat(60)}`);
    
    const auth = await getAuthToken(signerClient, 3600);
    
    // Check main order status
    const mainOrderResult = await checkOrderStatus(orderApi, ACCOUNT_INDEX, MARKET_ID, CLIENT_ORDER_INDEX, auth, 3);
    
    if (mainOrderResult.found && mainOrderResult.order) {
      const order = mainOrderResult.order;
      
      console.log(`\n✅ Main Order Status: ${order.status}`);
      if (order.status === 'filled') {
      } else if (order.status?.startsWith('canceled') || order.status === 'cancelled') {
        console.log(`Reason: ${getCancelReason(order.status)}`);
      }
    } else {
      console.log('⚠️ Main order not found');
    }
    
    // Check SL/TP orders if they exist
    if (result.stopLoss) {
      console.log(`\n📋 Checking Stop Loss order...`);
      const slClientIndex = CLIENT_ORDER_INDEX + 1; // SL orders have +1 offset
      const slResult = await checkOrderStatus(orderApi, ACCOUNT_INDEX, MARKET_ID, slClientIndex, auth, 0);
      
      if (slResult.found && slResult.order) {
        console.log(`Stop Loss Status: ${slResult.order.status}`);
      } else {
        console.log('⚠️ Stop Loss order not found');
      }
    }
    
    if (result.takeProfit) {
      console.log(`\n📋 Checking Take Profit order...`);
      const tpClientIndex = CLIENT_ORDER_INDEX + 2; // TP orders have +2 offset
      const tpResult = await checkOrderStatus(orderApi, ACCOUNT_INDEX, MARKET_ID, tpClientIndex, auth, 0);
      
      if (tpResult.found && tpResult.order) {
        console.log(`Take Profit Status: ${tpResult.order.status}`);
      } else {
        console.log('⚠️ Take Profit order not found');
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Status checking complete');
    console.log(`${'='.repeat(60)}\n`);
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  }
}

if (require.main === module) {
  createMarketOrderExample().catch(console.error);
}

export { createMarketOrderExample };
