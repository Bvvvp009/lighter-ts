/**
 * Example: WebSocket Ping-Pong Connection Maintenance
 * Demonstrates how to keep WebSocket connections alive using ping-pong mechanism
 * This prevents connections from closing after 1-2 minutes of inactivity
 */

import { WsClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function webSocketPingPongExample() {
  console.log('🚀 WebSocket Ping-Pong Connection Maintenance Example...\n');

  let pingCount = 0;
  let pongCount = 0;
  let lastPingTime = 0;
  let connectionStartTime = Date.now();
  let isAlive = true;

  // Initialize WebSocket client with ping-pong handling
  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
  const wsClient = new WsClient({
    url: wsUrl,
    reconnectInterval: 5000,
    maxReconnectAttempts: 3,
    onOpen: () => {
      console.log('✅ WebSocket connected');
      connectionStartTime = Date.now();
      isAlive = true;
      pingCount = 0;
      pongCount = 0;
    },
    onMessage: (message) => {
      // Handle different message types
      if (message.type === 'pong') {
        pongCount++;
        const pingLatency = Date.now() - lastPingTime;
        console.log(`🏓 Pong received! Latency: ${pingLatency}ms (Ping: ${pingCount}, Pong: ${pongCount})`);
      } else if (message.type === 'ping') {
        // Respond to server ping with pong
        wsClient.send({ type: 'pong' });
        console.log('🏓 Responded to server ping with pong');
      } else if (message.type === 'update/order_book') {
        // Handle order book updates (but don't log every one to avoid spam)
        if (message.offset % 100 === 0) { // Log every 100th update
          console.log(`📊 Order Book Update #${message.offset} (${Math.floor((Date.now() - connectionStartTime) / 1000)}s connected)`);
        }
      } else if (message.type === 'update/market_stats') {
        console.log(`📈 Market Stats: Price ${message.market_stats?.last_trade_price} (${Math.floor((Date.now() - connectionStartTime) / 1000)}s connected)`);
      } else if (message.type === 'update/trade') {
        if (message.trades?.length > 0) {
          const trade = message.trades[0];
          console.log(`💱 Trade: ${trade.size} @ ${trade.price} (${Math.floor((Date.now() - connectionStartTime) / 1000)}s connected)`);
        }
      } else if (message.type === 'connected') {
        console.log(`🔗 Connection established with session: ${message.session_id}`);
      } else {
        console.log(`📡 Message: ${message.type} (${Math.floor((Date.now() - connectionStartTime) / 1000)}s connected)`);
      }
    },
    onClose: () => {
      console.log('🔌 WebSocket closed');
      isAlive = false;
    },
    onError: (error) => {
      console.error('❌ WebSocket error:', error);
      isAlive = false;
    }
  });

  try {
    // Connect to WebSocket
    await wsClient.connect();
    
    // Wait for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Subscribe to order book for ETH market (market 0)
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    console.log('✅ Subscribed to order book for market 0 (ETH)');
    
    // Subscribe to market stats for ETH
    wsClient.send({
      type: 'subscribe',
      channel: 'market_stats/0'
    });
    console.log('✅ Subscribed to market stats for market 0 (ETH)');
    
    // Subscribe to trades for ETH
    wsClient.send({
      type: 'subscribe',
      channel: 'trade/0'
    });
    console.log('✅ Subscribed to trades for market 0 (ETH)');

    // Set up ping-pong mechanism
    const pingInterval = setInterval(() => {
      if (isAlive && wsClient) {
        // Send ping to keep connection alive
        lastPingTime = Date.now();
        wsClient.send({ type: 'ping' });
        pingCount++;
        
        const uptime = Math.floor((Date.now() - connectionStartTime) / 1000);
        console.log(`🏓 Ping sent (${pingCount}) - Uptime: ${uptime}s`);
      }
    }, 30000); // Send ping every 30 seconds

    // Set up connection health monitoring
    const healthInterval = setInterval(() => {
      if (isAlive) {
        const uptime = Math.floor((Date.now() - connectionStartTime) / 1000);
        console.log(`💓 Connection Health - Uptime: ${uptime}s, Pings: ${pingCount}, Pongs: ${pongCount}`);
        
        // Check if we're getting pongs back
        if (pingCount > pongCount + 2) {
          console.log('⚠️  Warning: Missing pongs detected, connection may be unstable');
        }
      }
    }, 60000); // Health check every 60 seconds

    // Keep connection alive for 5 minutes to demonstrate ping-pong
    setTimeout(async () => {
      clearInterval(pingInterval);
      clearInterval(healthInterval);
      
      console.log('\n📊 Ping-Pong Summary:');
      console.log(`   Total connection time: ${Math.floor((Date.now() - connectionStartTime) / 1000)}s`);
      console.log(`   Total pings sent: ${pingCount}`);
      console.log(`   Total pongs received: ${pongCount}`);
      console.log(`   Ping success rate: ${pongCount > 0 ? Math.round((pongCount / pingCount) * 100) : 0}%`);
      console.log(`   Connection status: ${isAlive ? 'Alive' : 'Closed'}`);
      
      await wsClient.disconnect();
      console.log('🎉 Ping-Pong WebSocket example completed!');
    }, 3000000); // 30 minutes

  } catch (error) {
    console.error('❌ Error:', error);
    await wsClient.disconnect();
  }
}

/**
 * Advanced Ping-Pong Example with Custom Implementation
 * Shows how to implement custom ping-pong logic for different use cases
 */
async function advancedPingPongExample() {
  console.log('\n🚀 Advanced Ping-Pong Example...\n');

  let customPingCount = 0;
  let customPongCount = 0;
  let missedPongs = 0;
  const maxMissedPongs = 3;

  const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
  const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
  const wsClient = new WsClient({
    url: wsUrl,
    onOpen: () => {
      console.log('✅ Advanced WebSocket connected');
      customPingCount = 0;
      customPongCount = 0;
      missedPongs = 0;
    },
    onMessage: (message) => {
      if (message.type === 'pong') {
        customPongCount++;
        missedPongs = Math.max(0, missedPongs - 1);
        console.log(`🏓 Custom Pong received! (${customPongCount} total, ${missedPongs} missed)`);
      } else if (message.type === 'ping') {
        wsClient.send({ type: 'pong' });
        console.log('🏓 Responded to server ping');
      }
    },
    onClose: () => console.log('🔌 Advanced WebSocket closed'),
    onError: (error) => console.error('❌ Advanced WebSocket error:', error)
  });

  try {
    await wsClient.connect();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Subscribe to data
    wsClient.send({ type: 'subscribe', channel: 'order_book/0' });

    // Custom ping-pong with adaptive timing
    let pingInterval = 20000; // Start with 20 seconds
    const pingTimer = setInterval(() => {
      if (missedPongs >= maxMissedPongs) {
        console.log('❌ Too many missed pongs, reconnecting...');
        wsClient.disconnect();
        setTimeout(() => {
          wsClient.connect();
        }, 1000);
        missedPongs = 0;
        return;
      }

      wsClient.send({ type: 'ping' });
      customPingCount++;
      missedPongs++;
      
      console.log(`🏓 Custom Ping sent (${customPingCount}) - Interval: ${pingInterval}ms`);
      
      // Adaptive ping interval based on missed pongs
      if (missedPongs === 0) {
        pingInterval = Math.max(10000, pingInterval - 1000); // Decrease interval if no missed pongs
      } else {
        pingInterval = Math.min(60000, pingInterval + 5000); // Increase interval if missed pongs
      }
    }, pingInterval);

    // Keep running for 30 seconds for testing
    setTimeout(() => {
      clearInterval(pingTimer);
      console.log('\n📊 Advanced Ping-Pong Summary:');
      console.log(`   Custom pings sent: ${customPingCount}`);
      console.log(`   Custom pongs received: ${customPongCount}`);
      console.log(`   Missed pongs: ${missedPongs}`);
      
      wsClient.disconnect();
      console.log('🎉 Advanced Ping-Pong example completed!');
    }, 30000); // 30 seconds for testing

  } catch (error) {
    console.error('❌ Advanced example error:', error);
    await wsClient.disconnect();
  }
}

// Run the examples
if (require.main === module) {
  console.log('Choose an example to run:');
  console.log('1. Basic Ping-Pong Example (5 minutes)');
  console.log('2. Advanced Ping-Pong Example (2 minutes)');
  console.log('3. Run both examples sequentially');
  
  const choice = process.argv[2] || '1';
  
  switch (choice) {
    case '1':
      webSocketPingPongExample().catch(console.error);
      break;
    case '2':
      advancedPingPongExample().catch(console.error);
      break;
    case '3':
      webSocketPingPongExample()
        .then(() => {
          console.log('\n' + '='.repeat(50));
          return advancedPingPongExample();
        })
        .catch(console.error);
      break;
    default:
      console.log('Invalid choice. Running basic example...');
      webSocketPingPongExample().catch(console.error);
  }
}

export { webSocketPingPongExample, advancedPingPongExample };
