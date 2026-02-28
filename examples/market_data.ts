/**
 * Example: Market Data
 * Demonstrates fetching market data using proper API functions
 */

import { ApiClient, OrderApi, WsClient } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function fetchMarketData() {
  console.log('🚀 Fetching Market Data...\n');

  // Initialize clients explicitly
  const apiClient = new ApiClient({
    host: process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai'
  });

  const orderApi = new OrderApi(apiClient);

  try {
    // 1. Fetch Order Book Details using OrderApi
    console.log('📊 Fetching Order Book Details...');
    try {
      const orderBookDetails = await orderApi.getOrderBookDetails({
        market_id: 0
      });
      console.log('✅ Order Book Details fetched successfully!');
      console.log(`   Symbol: ${orderBookDetails.symbol}`);
      console.log(`   Market ID: ${orderBookDetails.market_id}`);
      console.log(`   Last Trade Price: ${orderBookDetails.last_trade_price}`);
      console.log(`   Daily Volume: ${orderBookDetails.daily_quote_token_volume}`);
      console.log(`   Daily Trades: ${orderBookDetails.daily_trades_count}\n`);
    } catch (error) {
      console.log('❌ Order Book Details error:', error);
    }

    // 2. Fetch Recent Trades using OrderApi
    console.log('📈 Fetching Recent Trades...');
    try {
      const recentTrades = await orderApi.getRecentTrades({
        market_id: 0,
        limit: 10
      });
      console.log('✅ Recent Trades fetched successfully!');
      console.log(`   Trades: ${recentTrades?.trades?.length || 0} recent trades\n`);
    } catch (error) {
      console.log('❌ Recent Trades error:', error);
    }

    // 3. Fetch Exchange Stats using OrderApi
    console.log('📊 Fetching Exchange Stats...');
    try {
      const exchangeStats = await orderApi.getExchangeStats();
      console.log('✅ Exchange Stats fetched successfully!');
      console.log(`   Total Volume 24h: ${exchangeStats.total_volume_24h}`);
      console.log(`   Total Trades 24h: ${exchangeStats.total_trades_24h}`);
      console.log(`   Active Markets: ${exchangeStats.active_markets}\n`);
    } catch (error) {
      console.log('❌ Exchange Stats error:', error);
    }

    // 4. Fetch Multiple Markets Data
    console.log('🔍 Fetching Multiple Markets Data...');
    const markets: any = {};
    
    // Get market data for IDs 0-10
    for (let marketId = 0; marketId <= 10; marketId++) {
      try {
        const marketData = await getMarketData(marketId, orderApi);
        if (marketData) {
          markets[marketData.symbol] = {
            market_id: marketData.market_id,
            price: marketData.price,
            volume_24h: marketData.volume_24h,
            trades_24h: marketData.trades_24h,
            price_change_24h: marketData.price_change_24h,
            min_size: marketData.min_size,
            status: marketData.status
          };
          console.log(`✅ Market ${marketId} (${marketData.symbol}) found`);
        } else {
          console.log(`❌ Market ${marketId} not found`);
        }
      } catch (error) {
        console.log(`❌ Market ${marketId} error: ${error}`);
      }
    }

    // Output as JSON
    console.log('\n📊 Market Data JSON:');
    console.log(`✅ Found ${Object.keys(markets).length} markets`);

    // 5. WebSocket Real-time Data
    console.log('\n🔌 Connecting to WebSocket for real-time data...');
    const baseUrl = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
    const wsUrl = process.env['WS_URL'] || baseUrl.replace('https://', 'wss://').replace('http://', 'ws://') + '/stream';
    const wsClient = new WsClient({
      url: wsUrl,
      onOpen: () => console.log('✅ WebSocket connected'),
      onMessage: (message) => {
        console.log('📡 WebSocket message received');
      },
      onClose: () => console.log('🔌 WebSocket closed'),
      onError: (error) => console.error('❌ WebSocket error:', error)
    });

    await wsClient.connect();
    
    // Wait a bit for connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Subscribe to order book updates using correct format
    wsClient.send({
      type: 'subscribe',
      channel: 'order_book/0'
    });
    console.log('✅ Subscribed to order book updates for market 0');
    
    // Subscribe to market stats
    wsClient.send({
      type: 'subscribe',
      channel: 'market_stats/0'
    });
    console.log('✅ Subscribed to market stats for market 0');
    
    // Subscribe to trades
    wsClient.send({
      type: 'subscribe',
      channel: 'trade/0'
    });
    console.log('✅ Subscribed to trades for market 0');

    // Keep connection alive for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    wsClient.disconnect();
    console.log('\n🎉 Market data fetching completed!');

  } catch (error) {
    console.error('❌ Error fetching market data:', error);
  } finally {
    await apiClient.close();
  }
}

async function getMarketData(marketId: number, orderApi: OrderApi): Promise<any> {
  try {
    const details = await orderApi.getOrderBookDetails({ market_id: marketId }) as any;
    return {
      market_id: marketId,
      symbol: details.symbol,
      price: details.last_trade_price,
      volume_24h: parseFloat(details.daily_quote_token_volume),
      trades_24h: details.daily_trades_count,
      price_change_24h: details.daily_price_change,
      min_size: details.min_base_amount,
      status: details.status
    };
  } catch (error) {
    return null;
  }
  
  return null;
}

// Run the example if this file is executed directly
// Run if executed directly (works with tsx, node, etc.)
const isMain = process.argv[1]?.includes('market_data');
if (isMain) {
  fetchMarketData().catch(console.error);
}

export { fetchMarketData };