// Get all market data and output as JSON
// Simple example to get market information without validation

import { ApiClient } from '../src/api/api-client';
import { OrderApi } from '../src/api/order-api';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

async function getMarketData(marketId: number, orderApi: OrderApi): Promise<any> {
  try {
    const details = await orderApi.getOrderBookDetails({ market_id: marketId, depth: 1 }) as any;
    
    if (details.order_book_details && details.order_book_details.length > 0) {
      const marketInfo = details.order_book_details[0];
      return {
        market_id: marketId,
        symbol: marketInfo.symbol,
        price: marketInfo.last_trade_price,
        volume_24h: parseFloat(marketInfo.daily_quote_token_volume),
        trades_24h: marketInfo.daily_trades_count,
        price_change_24h: marketInfo.daily_price_change,
        min_size: marketInfo.min_base_amount,
        status: marketInfo.status
      };
    }
  } catch (error) {
    return null;
  }
  
  return null;
}

async function main(): Promise<void> {
  const client = new ApiClient({ host: BASE_URL });
  const orderApi = new OrderApi(client);

  try {
    console.log('🔍 Fetching all market data...\n');

    const markets: any = {};
    
    // Get market data for IDs 0-50
    for (let marketId = 0; marketId <= 50; marketId++) {
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
      }
    }

    // Output as JSON
    console.log('📊 Market Data JSON:');
    console.log(JSON.stringify(markets, null, 2));

    // Also save to file
    const fs = require('fs');
    fs.writeFileSync('examples/market_data.json', JSON.stringify(markets, null, 2));
    console.log('\n💾 Market data saved to market_data.json');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
