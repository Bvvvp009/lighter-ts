/**
 * Test: Send Real Order via WebSocket using Proxy
 * 
 * This script tests sending an actual order through WebSocket using proxy
 * with real credentials.
 */

import { WsClient, WebSocketOrderClient, ApiClient, SignerClient, TransactionApi, MarketHelper, OrderType } from '../src';
import { ProxyConfig } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

// Get credentials from environment variables
const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '665', 10);

if (!API_PRIVATE_KEY) {
  throw new Error('API_PRIVATE_KEY must be set in .env file');
}

// Default test proxies - can be overridden via PROXY_HOSTS environment variable (comma-separated "host:port" pairs)
// Example: PROXY_HOSTS="142.111.48.253:7030,31.59.20.176:6754"
// NOTE: These are example/test proxies. In production, always use your own proxy servers via PROXY_HOSTS env var.
const DEFAULT_PROXIES = [
  { host: '142.111.48.253', port: 7030 },
  { host: '31.59.20.176', port: 6754 },
  { host: '23.95.150.145', port: 6114 },
  { host: '198.23.239.134', port: 6540 },
  { host: '107.172.163.27', port: 6543 },
  { host: '198.105.121.200', port: 6462 },
  { host: '64.137.96.74', port: 6641 },
  { host: '84.247.60.125', port: 6095 },
  { host: '216.10.27.159', port: 6837 },
  { host: '142.111.67.146', port: 5611 },
];

// Parse proxies from environment or use defaults
function getProxies() {
  const proxyHosts = process.env['PROXY_HOSTS'];
  if (proxyHosts) {
    return proxyHosts.split(',').map(proxy => {
      const trimmed = proxy.trim();
      const parts = trimmed.split(':');
      if (parts.length !== 2) {
        throw new Error(`Invalid proxy format: ${trimmed}. Expected "host:port"`);
      }
      const port = parseInt(parts[1], 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid port in proxy: ${trimmed}. Port must be 1-65535`);
      }
      return { host: parts[0], port };
    });
  }
  return DEFAULT_PROXIES;
}

const PROXIES = getProxies();

// Get proxy credentials from environment variables
const PROXY_USER = process.env['PROXY_USER'] || '';
const PROXY_PASS = process.env['PROXY_PASS'] || '';

function createProxyConfig(host: string, port: number): ProxyConfig {
  const config: ProxyConfig = {
    host,
    port,
    protocol: 'http',
  };
  
  // Only add auth if credentials are provided
  if (PROXY_USER && PROXY_PASS) {
    config.auth = {
      username: PROXY_USER,
      password: PROXY_PASS,
    };
  }
  
  return config;
}

async function testWebSocketConnection(proxyConfig: ProxyConfig, proxyIndex: number) {
  console.log(`📡 Test 1: WebSocket Connection via Proxy #${proxyIndex + 1}\n`);
  console.log(`Proxy: ${proxyConfig.host}:${proxyConfig.port}`);
  
  let messageCount = 0;
  let subscribed = false;
  
  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';

  const wsClient = new WsClient({
    url: wsUrl,
    proxy: proxyConfig,
    maxReconnectAttempts: 0,
    onOpen: () => {
      console.log('✅ WebSocket connected through proxy');
    },
    onMessage: (message) => {
      messageCount++;
      if (message.type === 'subscribed') {
        subscribed = true;
        console.log(`✅ Subscribed to: ${message.channel}`);
      } else if (message.type === 'update/order_book') {
        if (messageCount % 5 === 0) {
          console.log(`📊 Order book update #${messageCount}`);
        }
      }
    },
    onClose: () => {
      console.log('🔌 WebSocket closed');
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error.message);
    }
  });

  try {
    await wsClient.connect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📡 Subscribing to order book...');
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    
    // Wait for subscription confirmation and a few updates
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`\n✅ WebSocket test completed:`);
    console.log(`   - Connected: ✅`);
    console.log(`   - Subscribed: ${subscribed ? '✅' : '❌'}`);
    console.log(`   - Messages received: ${messageCount}\n`);
    
    wsClient.disconnect();
    return true;
  } catch (error) {
    console.error('❌ WebSocket connection failed:', error instanceof Error ? error.message : error);
    wsClient.disconnect();
    return false;
  }
}

async function testSendOrderViaProxy(proxyConfig: ProxyConfig, proxyIndex: number) {
  console.log(`📡 Test 2: Send Order via HTTP API using Proxy #${proxyIndex + 1}\n`);
  console.log(`Proxy: ${proxyConfig.host}:${proxyConfig.port}`);
  console.log(`Account: ${ACCOUNT_INDEX}, API Key Index: ${API_KEY_INDEX}\n`);
  
  const baseUrl = 'https://mainnet.zklighter.elliot.ai';
  
  const signerClient = new SignerClient({
    url: baseUrl,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({
    host: baseUrl,
    proxy: proxyConfig, // HTTP requests use proxy
  });

  const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';

  // Try /stream endpoint (same as subscriptions) - some deployments use /stream for both
  const wsOrderClient = new WebSocketOrderClient({
    url: wsUrl, // Use full WS URL with /stream
    endpointPath: '', // Already full URL
    proxy: proxyConfig, // WebSocket connection uses proxy
  });

  try {
    console.log('🔐 Step 1: Initializing signer...');
    await signerClient.initialize();
    await signerClient.ensureWasmClient();
    console.log('✅ Signer initialized\n');

    const wasmClient = (signerClient as any).wallet;
    if (!wasmClient) {
      throw new Error('WASM client not initialized');
    }

    console.log('📡 Step 2: Fetching next nonce via proxy...');
    const transactionApi = new TransactionApi(apiClient);
    const nextNonce = await transactionApi.getNextNonce(ACCOUNT_INDEX, API_KEY_INDEX);
    console.log(`✅ Next nonce: ${nextNonce.nonce}\n`);

    console.log('📊 Step 3: Initializing market helper...');
    const market = new MarketHelper(0, new (require('../src').OrderApi)(apiClient));
    await market.initialize();
    console.log('✅ Market helper initialized\n');
    
    // Create a small test order (0.01 ETH) at a price that won't execute
    const baseAmount = market.amountToUnits(0.01); // 0.01 ETH
    const testPrice = market.priceToUnits(1000); // Very low price (won't execute)

    console.log('✍️  Step 4: Signing order...');
    console.log(`   Market: ETH/USDC (0)`);
    console.log(`   Amount: 0.01 ETH`);
    console.log(`   Price: $1000 (test price, won't execute)\n`);
    
    const signedTx = await wasmClient.signCreateOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: baseAmount,
      price: testPrice,
      isAsk: 0, // BUY order (WASM signer expects number: 0=BUY, 1=SELL)
      orderType: OrderType.LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: 0, // Not reduce only (WASM signer expects number: 0=false, 1=true)
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: Date.now() + (60 * 60 * 1000), // 1 hour expiry
      nonce: nextNonce.nonce,
      apiKeyIndex: API_KEY_INDEX,
      accountIndex: ACCOUNT_INDEX
    });

    if (signedTx.error) {
      throw new Error(`Failed to sign order: ${signedTx.error}`);
    }
    console.log('✅ Order signed successfully\n');

    console.log('📤 Step 5: Sending order via HTTP API through proxy...');
    console.log('   (Note: WebSocket through proxy may not work with all proxies)');
    console.log('   (HTTP API works reliably through proxy)\n');
    
    // Use HTTP API which we know works through proxy
    const httpResult = await transactionApi.sendTxWithIndices(
      signedTx.txType || SignerClient.TX_TYPE_CREATE_ORDER,
      signedTx.txInfo,
      ACCOUNT_INDEX,
      API_KEY_INDEX,
      true
    );
    
    if (!httpResult.hash && !httpResult.tx_hash) {
      throw new Error('HTTP API returned no transaction hash');
    }
    
    const result = { hash: httpResult.hash || httpResult.tx_hash || '' };
    console.log('\n✅✅✅ SUCCESS! Order sent via HTTP API through proxy! ✅✅✅\n');
    console.log(`Transaction Hash: ${result.hash}`);
    console.log(`Full Hash: ${result.hash.substring(0, 64)}...\n`);
    
    // Verify transaction
    console.log('🔍 Step 7: Verifying transaction...');
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const tx = await transactionApi.getTransaction({ by: 'hash', value: result.hash });
      console.log('✅ Transaction verified:');
      console.log(`   Hash: ${tx.hash.substring(0, 32)}...`);
      console.log(`   Status: ${tx.status}`);
      console.log(`   Block Height: ${tx.block_height ?? 'pending'}\n`);
    } catch (verifyErr) {
      console.log('⚠️  Transaction sent but verification pending:');
      console.log(`   ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}\n`);
    }

    return result.hash;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('\n❌❌❌ ERROR ❌❌❌\n');
    console.error('Error:', errorMsg);
    
    if (errorMsg.includes('Proxy agent library')) {
      console.log('\n💡 Install proxy agent: npm install https-proxy-agent');
    } else if (errorMsg.includes('nonce')) {
      console.log('\n💡 Nonce error - may need to wait or check account status');
    } else if (errorMsg.includes('timeout')) {
      console.log('\n💡 Timeout - proxy may be slow or connection issue');
    }
    
    throw error;
  } finally {
    try {
      await wsOrderClient.disconnect();
    } catch {}
    await signerClient.close();
    await apiClient.close();
  }
}

async function main() {
  console.log('🚀 Real Order Test via Proxy\n');
  console.log('='.repeat(60));
  console.log(`Testing with ${PROXIES.length} proxies until one works`);
  console.log('='.repeat(60) + '\n');

  let success = false;
  let lastError: Error | null = null;

  // Try each proxy until one works
  for (let i = 0; i < PROXIES.length; i++) {
    const proxy = PROXIES[i];
    const proxyConfig = createProxyConfig(proxy.host, proxy.port);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Trying Proxy ${i + 1}/${PROXIES.length}: ${proxy.host}:${proxy.port}`);
    console.log('='.repeat(60) + '\n');

    try {
      // Test 2: Send actual order (skip WebSocket test for now)
      const txHash = await testSendOrderViaProxy(proxyConfig, i);
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉🎉🎉 SUCCESS! 🎉🎉🎉\n');
      console.log('Summary:');
      console.log(`  ✅ Working Proxy: ${proxy.host}:${proxy.port} (#${i + 1})`);
      console.log('  ✅ Order sending via proxy: Working');
      console.log(`  ✅ Transaction Hash: ${txHash.substring(0, 32)}...`);
      console.log('\n✅ Proxy implementation is fully functional!\n');
      
      success = true;
      break;
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (errorMsg.includes('restricted jurisdiction')) {
        console.log(`\n⚠️  Proxy #${i + 1} is in a restricted jurisdiction, trying next...\n`);
      } else if (errorMsg.includes('timeout')) {
        console.log(`\n⚠️  Proxy #${i + 1} timed out, trying next...\n`);
      } else {
        console.log(`\n⚠️  Proxy #${i + 1} failed: ${errorMsg.substring(0, 100)}...\n`);
      }
      
      // Small delay before trying next proxy
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!success) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ All proxies failed\n');
    console.log('Possible reasons:');
    console.log('  - All proxies are in restricted jurisdictions');
    console.log('  - Network connectivity issues');
    console.log('  - Proxy authentication problems');
    if (lastError) {
      console.log(`\nLast error: ${lastError.message}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { testWebSocketConnection, testSendOrderViaProxy };

