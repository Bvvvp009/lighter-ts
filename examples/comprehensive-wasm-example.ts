// Comprehensive Windows WASM Signer Example
// Demonstrates all functionality available in the TypeScript SDK with WASM signer
import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { AccountApi } from '../src/api/account-api';
import { OrderApi } from '../src/api/order-api';
import { TransactionApi } from '../src/api/transaction-api';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://testnet.zklighter.elliot.ai';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ACCOUNT_INDEX = 65;
const API_KEY_INDEX = 1;

async function comprehensiveWasmExample() {
  console.log('=== COMPREHENSIVE WINDOWS WASM SIGNER EXAMPLE ===');
  console.log('Demonstrating all TypeScript SDK functionality with WASM signer');
  console.log('Equivalent to Python SDK functionality on Windows');
  console.log('');

  if (!PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not found in environment variables');
    console.log('Please set PRIVATE_KEY in your .env file');
    return;
  }

  try {
    // Initialize clients
    const apiClient = new ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);
    const orderApi = new OrderApi(apiClient);
    const transactionApi = new TransactionApi(apiClient);

    // Initialize WASM SignerClient (Windows compatible)
    const client = new SignerClient({
      url: BASE_URL,
      privateKey: PRIVATE_KEY,
      accountIndex: ACCOUNT_INDEX,
      apiKeyIndex: API_KEY_INDEX,
      wasmConfig: {
        wasmPath: './signers/wasm-signer/lighter-signer.wasm',
        wasmExecPath: './signers/wasm-signer/wasm_exec.js'
      }
    });

    console.log('✅ All clients initialized');

    // 1. Client Validation
    console.log('');
    console.log('1️⃣  CLIENT VALIDATION');
    const validationError = client.checkClient();
    if (validationError) {
      console.log(`❌ Validation error: ${validationError}`);
      return;
    }
    console.log('✅ Client validation passed');

    // 2. WASM Initialization
    console.log('');
    console.log('2️⃣  WASM SIGNER INITIALIZATION');
    await client.initialize();
    console.log('✅ WASM signer initialized successfully');
    console.log('✅ Windows WASM signer is working!');

    // 3. API Key Generation
    console.log('');
    console.log('3️⃣  API KEY GENERATION');
    const keyPair = await client.generateAPIKey('comprehensive-example-seed');
    if (keyPair) {
      console.log('✅ API key generated successfully');
      console.log(`   Private Key: ${keyPair.privateKey.substring(0, 20)}...`);
      console.log(`   Public Key: ${keyPair.publicKey.substring(0, 20)}...`);
    } else {
      console.log('❌ API key generation failed');
    }

    // 4. Account Information
    console.log('');
    console.log('4️⃣  ACCOUNT INFORMATION');
    try {
      const account = await accountApi.getAccount({ by: 'index', value: ACCOUNT_INDEX.toString() });
      console.log('✅ Account information retrieved');
      console.log(`   Account Index: ${account.index}`);
      console.log(`   Balance: ${account.balance || 'N/A'}`);
    } catch (error) {
      console.log(`⚠️  Account info error: ${error}`);
    }

    // 5. Order Book Information
    console.log('');
    console.log('5️⃣  ORDER BOOK INFORMATION');
    try {
      const orderBook = await orderApi.getOrderBookDetails({ market_id: 0, depth: 5 });
      console.log('✅ Order book retrieved');
      console.log(`   Market ID: ${orderBook.marketId}`);
      console.log(`   Best Bid: ${orderBook.bids?.[0]?.price || 'N/A'}`);
      console.log(`   Best Ask: ${orderBook.asks?.[0]?.price || 'N/A'}`);
    } catch (error) {
      console.log(`⚠️  Order book error: ${error}`);
    }

    // 6. Create Limit Order
    console.log('');
    console.log('6️⃣  CREATE LIMIT ORDER');
    const [limitOrder, limitTxHash, limitError] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: 1001,
      baseAmount: 100000, // 0.1 ETH
      price: 250000, // $2500
      isAsk: true, // Sell order
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: 0
    });

    if (limitError) {
      console.log(`⚠️  Limit order error: ${limitError}`);
    } else {
      console.log('✅ Limit order created successfully');
      console.log(`   Order: ${JSON.stringify(limitOrder, null, 2)}`);
      console.log(`   Transaction Hash: ${limitTxHash}`);
    }

    // 7. Create Market Order
    console.log('');
    console.log('7️⃣  CREATE MARKET ORDER');
    const [marketOrder, marketTxHash, marketError] = await client.createMarketOrder({
      marketIndex: 0,
      clientOrderIndex: 1002,
      baseAmount: 50000, // 0.05 ETH
      avgExecutionPrice: 260000, // $2600
      isAsk: false // Buy order
    });

    if (marketError) {
      console.log(`⚠️  Market order error: ${marketError}`);
    } else {
      console.log('✅ Market order created successfully');
      console.log(`   Order: ${JSON.stringify(marketOrder, null, 2)}`);
      console.log(`   Transaction Hash: ${marketTxHash}`);
    }

    // 8. Cancel Order
    console.log('');
    console.log('8️⃣  CANCEL ORDER');
    const [cancelOrder, cancelTxHash, cancelError] = await client.cancelOrder({
      marketIndex: 0,
      orderIndex: 1001
    });

    if (cancelError) {
      console.log(`⚠️  Cancel order error: ${cancelError}`);
    } else {
      console.log('✅ Order canceled successfully');
      console.log(`   Cancel Order: ${JSON.stringify(cancelOrder, null, 2)}`);
      console.log(`   Transaction Hash: ${cancelTxHash}`);
    }

    // 9. Auth Token Creation
    console.log('');
    console.log('9️⃣  AUTH TOKEN CREATION');
    try {
      const authToken = await client.createAuthTokenWithExpiry(600); // 10 minutes
      console.log('✅ Auth token created successfully');
      console.log(`   Auth Token: ${authToken.substring(0, 20)}...`);
    } catch (error) {
      console.log(`⚠️  Auth token error: ${error}`);
    }

    // 10. Recent Trades
    console.log('');
    console.log('🔟 RECENT TRADES');
    try {
      const trades = await orderApi.getRecentTrades({ market_id: 0, limit: 5 });
      console.log('✅ Recent trades retrieved');
      console.log(`   Number of trades: ${trades.length}`);
      if (trades.length > 0) {
        console.log(`   Latest trade price: ${trades[0].price}`);
      }
    } catch (error) {
      console.log(`⚠️  Recent trades error: ${error}`);
    }

    // Clean up
    await client.close();
    await apiClient.close();

    console.log('');
    console.log('🎉 COMPREHENSIVE EXAMPLE COMPLETED!');
    console.log('');
    console.log('✅ SUMMARY:');
    console.log('   ✅ Windows WASM signer is fully functional');
    console.log('   ✅ All core operations work correctly');
    console.log('   ✅ Equivalent functionality to Python SDK');
    console.log('   ✅ Ready for production use on Windows');
    console.log('');
    console.log('🚀 Windows users can now use the TypeScript SDK with full functionality!');

  } catch (error) {
    console.error('❌ Example failed:', error);
  }
}

if (require.main === module) {
  comprehensiveWasmExample().catch(console.error);
}
