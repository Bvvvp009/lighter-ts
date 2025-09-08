import { ApiClient, OrderApi, RootApi } from '../src';

// The API_KEY_PRIVATE_KEY provided belongs to a dummy account registered on Testnet.
// It was generated using the setup_system.py script, and serves as an example.
const BASE_URL = "https://testnet.zklighter.elliot.ai";

async function main(): Promise<void> {
  // Create API client only (no signing functionality)
  const apiClient = new ApiClient({ host: BASE_URL });
  
  try {
    // Example: Get root info
    try {
      const rootApi = new RootApi(apiClient);
      const info = await rootApi.getInfo();
      console.log(`Root info: ${JSON.stringify(info, null, 2)}`);
    } catch (e) {
      console.error(`Error getting root info: ${e}`);
    }
    
    // Example: Get orderbook for market 0
    try {
      const orderApi = new OrderApi(apiClient);
      const orderbook = await orderApi.getOrderBooks();
      console.log(`Orderbook for market 0: ${JSON.stringify(orderbook, null, 2)}`);
    } catch (e) {
      console.error(`Error getting orderbook: ${e}`);
    }
    
    // Example: Get recent trades
    try {
      const orderApi = new OrderApi(apiClient);
      const trades = await orderApi.getRecentTrades({ market_id: 0, limit: 10 });
      console.log(`Recent trades for market 0: ${JSON.stringify(trades, null, 2)}`);
    } catch (e) {
      console.error(`Error getting trades: ${e}`);
    }
    
  } finally {
    apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 