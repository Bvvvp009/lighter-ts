/**
 * Example: Create ETH SPOT Limit Order with SL/TP
 * MarketIndex: 2048 (ETH SPOT)
 * MarketIndex: 2048 (ETH SPOT) - Available on mainnet
 */

import { SignerClient, OrderType, ApiClient, AccountApi } from '../../src';
import * as dotenv from 'dotenv';

dotenv.config();

function trimException(e: Error): string {
  return e.message.trim().split('\n').pop() || 'Unknown error';
}

async function checkPositions(accountApi: AccountApi, accountIndex: number, marketIndex: number) {
  try {
    const account = await accountApi.getAccount({
      by: 'index',
      value: accountIndex.toString()
    });
    
    const positions = (account as any).positions || [];
    const spotPosition = positions.find((p: any) => p.market_id === marketIndex);
    
    if (spotPosition) {
      console.log(`\n📊 Position Details for Market ${marketIndex}:`);
      console.log(`   Side: ${spotPosition.side}`);
      console.log(`   Size: ${spotPosition.size}`);
      console.log(`   Entry Price: ${spotPosition.entry_price}`);
      console.log(`   Mark Price: ${spotPosition.mark_price}`);
      console.log(`   Unrealized PnL: ${spotPosition.unrealized_pnl || 'N/A'}`);
      return spotPosition;
    } else {
      console.log(`\n📊 No open position for Market ${marketIndex}`);
      return null;
    }
  } catch (error) {
    console.warn(`⚠️ Could not check positions: ${trimException(error as Error)}`);
    return null;
  }
}

async function createSpotLimitOrderWithSLTP() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '271', 10);
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const MARKET_INDEX = 2048; // ETH SPOT

  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY must be set in .env file');
  }

  console.log(`📋 Creating ETH SPOT Limit Order with SL/TP`);
  console.log(`   Account Index: ${ACCOUNT_INDEX}`);
  console.log(`   API Key Index: ${API_KEY_INDEX}`);
  console.log(`   Market Index: ${MARKET_INDEX} (ETH SPOT)\n`);

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });
  const accountApi = new AccountApi(apiClient);
  
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  // Check initial position
  console.log('📊 Checking initial position...');
  await checkPositions(accountApi, ACCOUNT_INDEX, MARKET_INDEX);

  // For ETH SPOT: 1 ETH = 1,000,000 units, $1 = 100 price units
  // 0.001 ETH = 1,000 units
  // $3000 = 300,000 price units
  const limitOrderParams = {
    marketIndex: MARKET_INDEX,
    clientOrderIndex: Date.now(),
    baseAmount: 1000, // 0.001 ETH (1000 units)
    price: 280000, // $2800 (280,000 price units)
    isAsk: false, // Buy order
    orderType: OrderType.LIMIT,
    orderExpiry: Date.now() + (60 * 60 * 1000), // 1 hour expiry
    stopLoss: {
      triggerPrice: 270000, // $2700
      isLimit: true
    },
    takeProfit: {
      triggerPrice: 300000, // $3000
      isLimit: true
    }
  };

  console.log(`\n📝 Order Parameters:`);
  console.log(`   Base Amount: ${limitOrderParams.baseAmount} units (0.001 ETH)`);
  console.log(`   Price: ${limitOrderParams.price} units ($2800.00)`);
  console.log(`   Stop Loss: ${limitOrderParams.stopLoss.triggerPrice} units ($2700.00)`);
  console.log(`   Take Profit: ${limitOrderParams.takeProfit.triggerPrice} units ($3000.00)\n`);

  try {
    // Note: createUnifiedOrder doesn't support spot markets yet
    // For spot markets, use createOrder directly
    // SL/TP orders for spot markets may need to be created separately
    console.log('⚠️ Note: createUnifiedOrder doesn\'t support spot markets yet.');
    console.log('   Creating limit order only (SL/TP not supported in batch for spot markets).\n');
    
    const [orderInfo, txHash, error] = await signerClient.createOrder({
      marketIndex: limitOrderParams.marketIndex,
      clientOrderIndex: limitOrderParams.clientOrderIndex,
      baseAmount: limitOrderParams.baseAmount,
      price: limitOrderParams.price,
      isAsk: limitOrderParams.isAsk,
      orderType: limitOrderParams.orderType,
      orderExpiry: limitOrderParams.orderExpiry,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
    });

    if (error || !txHash) {
      console.error(`❌ Order failed: ${error || 'No transaction hash'}`);
      return;
    }

    console.log(`✅ Limit order created: ${txHash.substring(0, 16)}...`);
    console.log(`⚠️ Note: Stop-loss and take-profit orders are not yet supported for spot markets.`);
    console.log(`   You can create them separately after the limit order executes.`);

    try {
      const transaction = await signerClient.waitForTransaction(txHash, 30000, 2000);
      
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
      
      if (transaction.code && transaction.code !== 200) {
        const errorMsg = transaction.message || 'Transaction failed';
        console.error(`❌ Order failed: ${errorMsg}`);
        return;
      }
      
      const status = typeof transaction.status === 'number' ? transaction.status : parseInt(String(transaction.status), 10);
      if (status === 4 || status === 5) {
        const errorMsg = transaction.message || 'Transaction failed';
        console.error(`❌ Order failed: ${errorMsg}`);
        return;
      }
      
      console.log(`✅ Limit order placed: ${txHash.substring(0, 16)}...`);
      
      // Check position after order
      console.log('\n📊 Checking position after order...');
      await checkPositions(accountApi, ACCOUNT_INDEX, MARKET_INDEX);
      
    } catch (error) {
      console.error(`❌ Error: ${trimException(error as Error)}`);
    }
  } catch (error) {
    console.error(`❌ Error: ${trimException(error as Error)}`);
  } finally {
    await signerClient.close();
    await apiClient.close();
  }
}

if (require.main === module) {
  createSpotLimitOrderWithSLTP().catch(console.error);
}

export { createSpotLimitOrderWithSLTP };

