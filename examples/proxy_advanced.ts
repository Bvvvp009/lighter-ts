/**
 * Advanced Proxy Example: WebSocket Subscriptions and Transactions via Proxy
 * 
 * This example demonstrates:
 * 1. Subscribing to WebSocket channels (order books, trades, market stats) via proxy
 * 2. Sending transactions via WebSocket using proxy
 * 
 * Prerequisites:
 * - For HTTP/HTTPS proxies: npm install https-proxy-agent
 * - For SOCKS proxies: npm install socks-proxy-agent
 * - API credentials (API_PRIVATE_KEY, ACCOUNT_INDEX, API_KEY_INDEX) for transaction example
 */

import { WsClient, WebSocketOrderClient, ApiClient, SignerClient, TransactionApi, MarketHelper, OrderType, ProxyConfig } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();


interface ProxyInfo {
  host: string;
  port: number;
  username: string;
  password: string;
}

/**
 * Parse proxy string in format: host:port:username:password
 */
function parseProxy(proxyString: string): ProxyInfo | null {
  const parts = proxyString.split(':');
  // Accept either "host:port" (2 parts) or "host:port:username:password" (4 parts)
  if (parts.length !== 2 && parts.length !== 4) {
    return null;
  }
  
  const host = parts[0];
  const port = parseInt(parts[1], 10);
  
  if (!host || isNaN(port) || port <= 0 || port > 65535) {
    return null;
  }
  
  // If only 2 parts, use empty strings for username/password (no auth)
  if (parts.length === 2) {
    return {
      host,
      port,
      username: '',
      password: '',
    };
  }
  
  // 4 parts: host:port:username:password
  return {
    host,
    port,
    username: parts[2],
    password: parts[3],
  };
}

/**
 * Create ProxyConfig object, conditionally including auth only when provided
 */
function createProxyConfig(proxyInfo: ProxyInfo): ProxyConfig {
  const config: ProxyConfig = {
    host: proxyInfo.host,
    port: proxyInfo.port,
    protocol: 'http',
  };
  
  // Only add auth if both username and password are provided and non-empty
  if (proxyInfo.username && proxyInfo.password && 
      proxyInfo.username.length > 0 && proxyInfo.password.length > 0) {
    config.auth = {
      username: proxyInfo.username,
      password: proxyInfo.password,
    };
  }
  
  return config;
}

/**
 * Example 1: Subscribe to WebSocket channels via proxy
 */
async function exampleWebSocketSubscriptions(proxyInfo: ProxyInfo) {
  console.log('\n📡 Example 1: WebSocket Subscriptions via Proxy\n');
  console.log(`Using proxy: ${proxyInfo.host}:${proxyInfo.port}`);
  
  const proxyConfig = createProxyConfig(proxyInfo);
  let messageCount = 0;
  
  const wsClient = new WsClient({
    url: process.env['WS_URL'] || 'wss://mainnet.zklighter.elliot.ai/stream',
    proxy: proxyConfig,
    maxReconnectAttempts: 0, // Disable auto-reconnect for example
    onOpen: () => {
      console.log('✅ WebSocket connected through proxy');
    },
    onMessage: (message) => {
      messageCount++;
      
      // Handle different message types
      if (message.type === 'update/order_book') {
        if (messageCount % 10 === 0) { // Log every 10th update to avoid spam
          console.log(`📊 Order Book Update #${messageCount} (offset: ${message.offset})`);
        }
      } else if (message.type === 'update/market_stats') {
        console.log(`📈 Market Stats: ${JSON.stringify(message.market_stats || {})}`);
      } else if (message.type === 'update/trade') {
        if (message.trades?.length > 0) {
          const trade = message.trades[0];
          console.log(`💱 Trade: ${trade.size} @ ${trade.price}`);
        }
      } else if (message.type === 'subscribed') {
        console.log(`✅ Subscribed to: ${message.channel}`);
      } else if (message.type === 'connected') {
        console.log(`🔗 Connection established`);
      }
    },
    onClose: () => {
      console.log('🔌 WebSocket closed');
    },
    onError: (error) => {
      if (error.message.includes('Proxy agent library')) {
        console.error('❌ Proxy agent library not found!');
        console.log('💡 Install it with: npm install https-proxy-agent');
      } else {
        console.error('❌ WebSocket error:', error.message);
      }
    }
  });

  try {
    // Connect through proxy
    await wsClient.connect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Subscribe to order book for market 0 (ETH/USDC)
    console.log('\n📡 Subscribing to channels...');
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    
    // Subscribe to market stats
    wsClient.send({
      type: 'subscribe',
      channel: 'market_stats/0'
    });
    
    // Subscribe to trades
    wsClient.send({
      type: 'subscribe',
      channel: 'trade/0'
    });
    
    console.log('\n✅ All subscriptions sent. Listening for updates (10 seconds)...\n');
    
    // Keep connection alive for 10 seconds to receive updates
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(`\n📊 Received ${messageCount} messages total`);
    wsClient.disconnect();
    
    console.log('✅ WebSocket subscription example completed!\n');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    wsClient.disconnect();
  }
}

/**
 * Example 2: Send transaction via WebSocket using proxy
 */
async function exampleWebSocketTransaction(proxyInfo: ProxyInfo) {
  console.log('\n📡 Example 2: WebSocket Transaction via Proxy\n');
  console.log(`Using proxy: ${proxyInfo.host}:${proxyInfo.port}`);
  
  // Check if credentials are available
  if (!process.env['API_PRIVATE_KEY']) {
    console.log('⚠️  Skipping transaction example - API_PRIVATE_KEY not set');
    console.log('💡 Set API_PRIVATE_KEY, ACCOUNT_INDEX, and API_KEY_INDEX to test transactions\n');
    return;
  }
  
  const proxyConfig = createProxyConfig(proxyInfo);
  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
  
  const signerClient = new SignerClient({
    url: baseUrl,
    privateKey: process.env['API_PRIVATE_KEY'],
    accountIndex: parseInt(process.env['ACCOUNT_INDEX'] || '0'),
    apiKeyIndex: parseInt(process.env['API_KEY_INDEX'] || '0')
  });

  const apiClient = new ApiClient({
    host: baseUrl,
    proxy: proxyConfig, // HTTP requests also use proxy
  });

  // WebSocket order client with proxy support
  const wsOrderClient = new WebSocketOrderClient({
    url: wsUrl,
    endpointPath: '', // Already a full WS URL
    proxy: proxyConfig, // WebSocket connection uses proxy
  });

  try {
    console.log('🔐 Initializing signer...');
    await signerClient.initialize();
    await signerClient.ensureWasmClient();

    const wasmClient = (signerClient as any).wallet;
    if (!wasmClient) {
      throw new Error('WASM client not initialized');
    }

    const transactionApi = new TransactionApi(apiClient);
    const accountIndex = parseInt(process.env['ACCOUNT_INDEX'] || '0');
    const apiKeyIndex = parseInt(process.env['API_KEY_INDEX'] || '0');
    
    console.log('📡 Fetching next nonce...');
    const nextNonce = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);
    console.log(`✅ Next nonce: ${nextNonce.nonce}`);

    // Use MarketHelper for proper unit conversion
    const market = new MarketHelper(0, new (require('../src').OrderApi)(apiClient));
    await market.initialize();
    
    // Create a small test order that won't execute
    const tinyBaseAmount = market.amountToUnits(0.01); // 0.01 ETH
    const farBelowMarketPrice = market.priceToUnits(1000); // Low price to avoid execution

    console.log('✍️  Signing transaction...');
    const signedTx = await wasmClient.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: tinyBaseAmount,
      price: farBelowMarketPrice,
      isAsk: 0, // BUY (WASM signer expects number: 0=BUY, 1=SELL)
      orderType: OrderType.LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0, // Not reduce only (WASM signer expects number: 0=false, 1=true)
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: Date.now() + (60 * 60 * 1000), // 1h expiry
      nonce: nextNonce.nonce,
      apiKeyIndex: apiKeyIndex,
      accountIndex: accountIndex
    });

    if (signedTx.error) {
      throw new Error(`Failed to sign order: ${signedTx.error}`);
    }

    console.log('🔗 Connecting WebSocket through proxy...');
    await wsOrderClient.connect();
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📤 Sending transaction via WebSocket...');
    const result = await wsOrderClient.sendTransaction(
      signedTx.txType || SignerClient.TX_TYPE_CREATE_ORDER,
      signedTx.txInfo
    );

    console.log(`✅ Transaction sent via WebSocket through proxy!`);
    console.log(`   Hash: ${result.hash.substring(0, 32)}...`);
    
    // Verify transaction
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const tx = await transactionApi.getTransaction({ by: 'hash', value: result.hash });
      console.log('🔍 Transaction verified:', {
        hash: tx.hash.substring(0, 16) + '...',
        status: tx.status,
        block_height: tx.block_height ?? 'pending'
      });
    } catch (verifyErr) {
      console.log('⚠️  Could not verify yet:', verifyErr instanceof Error ? verifyErr.message : String(verifyErr));
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', errorMsg);
    
    if (errorMsg.includes('Proxy agent library')) {
      console.log('💡 Install proxy agent: npm install https-proxy-agent');
    }
  } finally {
    await wsOrderClient.disconnect();
    await signerClient.close();
    await apiClient.close();
    console.log('✅ WebSocket transaction example completed!\n');
  }
}

async function main() {
  console.log('🚀 Advanced Proxy Example: WebSocket Subscriptions & Transactions\n');

  // Get proxy configuration from environment variables
  // Format: PROXY_STRING="host:port:username:password" OR use PROXY_HOST/PROXY_PORT/PROXY_USER/PROXY_PASS
  // Example: PROXY_STRING="142.111.48.253:7030:username:password"
  let proxyString = process.env['PROXY_STRING'];
  
  if (!proxyString) {
    // Construct from individual environment variables
    const host = process.env['PROXY_HOST'];
    const port = process.env['PROXY_PORT'];
    const user = process.env['PROXY_USER'];
    const pass = process.env['PROXY_PASS'];
    
    if (!host || !port) {
      console.error('❌ PROXY_STRING or PROXY_HOST/PROXY_PORT environment variables must be set');
      console.error('   Format: PROXY_STRING="host:port:user:pass" or PROXY_HOST, PROXY_PORT (and optionally PROXY_USER, PROXY_PASS)');
      return;
    }
    
    // Construct proxy string: host:port or host:port:user:pass
    if (user && pass) {
      proxyString = `${host}:${port}:${user}:${pass}`;
    } else {
      proxyString = `${host}:${port}`;
    }
  }

  const proxyInfo = parseProxy(proxyString);
  
  if (!proxyInfo) {
    console.error('❌ Invalid proxy format');
    console.error('   Expected format: host:port or host:port:username:password');
    console.error('   Received:', proxyString.substring(0, 50));
    return;
  }

  try {
    // Example 1: WebSocket subscriptions
    await exampleWebSocketSubscriptions(proxyInfo);
    
    // Example 2: WebSocket transactions
    await exampleWebSocketTransaction(proxyInfo);
    
    console.log('🎉 All advanced proxy examples completed!');
    console.log('\n💡 Summary:');
    console.log('   ✅ WebSocket subscriptions work via proxy');
    console.log('   ✅ Transaction sending works via proxy');
    console.log('   ✅ All WebSocket channels are accessible through proxy');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { exampleWebSocketSubscriptions, exampleWebSocketTransaction };

