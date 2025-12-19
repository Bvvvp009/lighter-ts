/**
 * Example: Using Proxy Support
 * Demonstrates how to configure and use HTTP and WebSocket proxies
 */

import { ApiClient, OrderApi, WsClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function httpProxyExample() {
  console.log('🚀 HTTP Proxy Example');

  const proxyConfig: any = {
    host: process.env['PROXY_HOST'] || 'proxy.example.com',
    port: parseInt(process.env['PROXY_PORT'] || '8080'),
    protocol: 'http',
  };
  
  if (process.env['PROXY_USER'] && process.env['PROXY_PASS']) {
    proxyConfig.auth = {
      username: process.env['PROXY_USER'],
      password: process.env['PROXY_PASS']
    };
  }
  
  const apiClient = new ApiClient({
    host: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    proxy: proxyConfig
  });

  const orderApi = new OrderApi(apiClient);

  try {
    const orderBooks = await orderApi.getOrderBooks();
    console.log(`✅ Fetched ${orderBooks.length} order books via proxy`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await apiClient.close();
  }
}

async function websocketProxyExample() {
  console.log('🚀 WebSocket Proxy Example');

  const wsProxyConfig: any = {
    host: process.env['PROXY_HOST'] || 'proxy.example.com',
    port: parseInt(process.env['PROXY_PORT'] || '8080'),
    protocol: 'http',
  };
  
  if (process.env['PROXY_USER'] && process.env['PROXY_PASS']) {
    wsProxyConfig.auth = {
      username: process.env['PROXY_USER'],
      password: process.env['PROXY_PASS']
    };
  }
  
  const wsClient = new WsClient({
    url: process.env['WS_URL'] || 'wss://mainnet.zklighter.elliot.ai/stream',
    proxy: wsProxyConfig,
    onOpen: () => console.log('✅ Connected via proxy'),
    onMessage: () => {}, // Silent
    onClose: () => console.log('🔌 Closed'),
    onError: (error) => console.error('❌ Error:', error.message)
  });

  try {
    await wsClient.connect();
    console.log('✅ Connected to WebSocket through proxy\n');

    // Subscribe to order book
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    console.log('✅ Subscribed to order book channel\n');

    // Keep connection alive for 10 seconds
    setTimeout(() => {
      wsClient.disconnect();
      console.log('🎉 WebSocket proxy example completed!');
    }, 10000);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message.includes('Proxy agent library')) {
      console.log('\n💡 Install proxy agent library:');
      console.log('   npm install https-proxy-agent');
    }
  }
}

async function socksProxyExample() {
  console.log('🚀 SOCKS5 Proxy Example...\n');

  // Create API client with SOCKS5 proxy
  const socksProxyConfig: any = {
    host: process.env['SOCKS_PROXY_HOST'] || 'socks-proxy.example.com',
    port: parseInt(process.env['SOCKS_PROXY_PORT'] || '1080'),
    protocol: 'socks5',
  };
  
  if (process.env['SOCKS_PROXY_USER'] && process.env['SOCKS_PROXY_PASS']) {
    socksProxyConfig.auth = {
      username: process.env['SOCKS_PROXY_USER'],
      password: process.env['SOCKS_PROXY_PASS']
    };
  }
  
  const apiClient = new ApiClient({
    host: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    proxy: socksProxyConfig
  });

  const orderApi = new OrderApi(apiClient);

  try {
    console.log('📊 Fetching order books through SOCKS5 proxy...');
    const orderBooks = await orderApi.getOrderBooks();
    console.log(`✅ Successfully fetched ${orderBooks.length} order books through SOCKS5 proxy\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message.includes('Proxy agent library')) {
      console.log('\n💡 Install SOCKS proxy agent library:');
      console.log('   npm install socks-proxy-agent');
    }
  } finally {
    await apiClient.close();
  }
}

async function proxyWithoutAuthExample() {
  console.log('🚀 Proxy Without Authentication Example...\n');

  // Create API client with proxy (no authentication)
  const apiClient = new ApiClient({
    host: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai',
    proxy: {
      host: process.env['PROXY_HOST'] || 'proxy.example.com',
      port: parseInt(process.env['PROXY_PORT'] || '8080'),
      protocol: 'https',
      // No auth field
    }
  });

  const orderApi = new OrderApi(apiClient);

  try {
    console.log('📊 Fetching order books through proxy (no auth)...');
    const orderBooks = await orderApi.getOrderBooks();
    console.log(`✅ Successfully fetched ${orderBooks.length} order books\n`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  } finally {
    await apiClient.close();
  }
}

// Main function
async function main() {
  console.log('📋 Proxy Support Examples\n');
  console.log('Note: These examples require proxy agent libraries:');
  console.log('  - npm install https-proxy-agent (for HTTP/HTTPS proxies)');
  console.log('  - npm install socks-proxy-agent (for SOCKS proxies)\n');
  console.log('='.repeat(60) + '\n');

  // Run examples based on environment or all
  const example = process.env['PROXY_EXAMPLE'] || 'http';

  switch (example) {
    case 'http':
      await httpProxyExample();
      break;
    case 'ws':
      await websocketProxyExample();
      break;
    case 'socks':
      await socksProxyExample();
      break;
    case 'no-auth':
      await proxyWithoutAuthExample();
      break;
    default:
      console.log('Available examples: http, ws, socks, no-auth');
      console.log('Set PROXY_EXAMPLE environment variable to run specific example');
      await httpProxyExample();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { httpProxyExample, websocketProxyExample, socksProxyExample, proxyWithoutAuthExample };


