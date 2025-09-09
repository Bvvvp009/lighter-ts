# Usage Guide & Examples

This guide provides practical examples and patterns for using the Lighter TypeScript SDK effectively in real-world applications.

## Table of Contents

1. [Getting Started](#getting-started)
2. [API Client Usage](#api-client-usage)
3. [Signer Client Usage](#signer-client-usage)
4. [WebSocket Usage](#websocket-usage)
5. [Common Patterns](#common-patterns)
6. [Error Handling](#error-handling)
7. [Performance Tips](#performance-tips)
8. [Real-World Examples](#real-world-examples)

## Getting Started

### Basic Setup
```typescript
import { ApiClient, AccountApi, OrderApi } from 'lighter-ts';

// Create API client
const client = new ApiClient({
  host: 'https://testnet.zklighter.elliot.ai',
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
});

// Initialize API instances
const accountApi = new AccountApi(client);
const orderApi = new OrderApi(client);

// Use the APIs
const account = await accountApi.getAccount({ by: 'index', value: '1' });
const orderBook = await orderApi.getOrderBookDetails({ market_id: 0, depth: 10 });
```

### Environment Configuration
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

const client = new ApiClient({
  host: process.env.BASE_URL || 'https://testnet.zklighter.elliot.ai',
  apiKey: process.env.API_KEY,
  secretKey: process.env.SECRET_KEY,
});
```

## API Client Usage

### Account Operations
```typescript
import { AccountApi } from 'lighter-ts';

const accountApi = new AccountApi(client);

// Get account by different identifiers
const accountByIndex = await accountApi.getAccount({
  by: 'index',
  value: '1',
});

const accountByAddress = await accountApi.getAccount({
  by: 'l1_address',
  value: '0x8D7f03FdE1A626223364E592740a233b72395235',
});

// Get multiple accounts with pagination
const accounts = await accountApi.getAccounts({
  limit: 10,
  index: 0,
  sort: 'asc',
});

// Get account API keys
const apiKeys = await accountApi.getApiKeys(1, 0);

// Check account whitelist status
const isWhitelisted = await accountApi.isWhitelisted(1);

// Get account limits
const limits = await accountApi.getAccountLimits(1);

// Get account metadata
const metadata = await accountApi.getAccountMetadata(1);

// Get account PnL
const pnl = await accountApi.getAccountPnL(1);

// Get account statistics
const stats = await accountApi.getAccountStats(1);
```

### Order Operations
```typescript
import { OrderApi } from 'lighter-ts';

const orderApi = new OrderApi(client);

// Get exchange statistics
const exchangeStats = await orderApi.getExchangeStats();

// Get order book details
const orderBook = await orderApi.getOrderBookDetails({
  market_id: 0,
  depth: 10,
});

// Get recent trades
const recentTrades = await orderApi.getRecentTrades({
  market_id: 0,
  limit: 10,
});

// Get order book statistics
const orderBookStats = await orderApi.getOrderBookStats(0);

// Get market information
const marketInfo = await orderApi.getMarketInfo(0);
```

### Transaction Operations
```typescript
import { TransactionApi } from 'lighter-ts';

const transactionApi = new TransactionApi(client);

// Get current block height
const currentHeight = await transactionApi.getCurrentHeight();

// Get block information
const block = await transactionApi.getBlock({
  by: 'height',
  value: '1',
});

// Get transaction by hash
const transaction = await transactionApi.getTransaction({
  by: 'hash',
  value: 'tx-hash',
});

// Get next nonce
const nextNonce = await transactionApi.getNextNonce(1, 0);

// Get account transactions
const accountTxs = await transactionApi.getAccountTransactions(1, {
  limit: 10,
  index: 0,
});

// Get account pending transactions
const pendingTxs = await transactionApi.getAccountPendingTxs(1);
```

### Block Operations
```typescript
import { BlockApi } from 'lighter-ts';

const blockApi = new BlockApi(client);

// Get block by height
const block = await blockApi.getBlock({
  by: 'height',
  value: '1',
});

// Get block transactions
const blockTxs = await blockApi.getBlockTxs({
  by: 'height',
  value: '1',
  limit: 10,
  index: 0,
});
```

### Candlestick Operations
```typescript
import { CandlestickApi } from 'lighter-ts';

const candlestickApi = new CandlestickApi(client);

// Get candlesticks
const candlesticks = await candlestickApi.getCandlesticks({
  market_id: 0,
  interval: '1m',
  limit: 100,
  start_time: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
  end_time: Date.now(),
});

// Get funding rates
const fundingRates = await candlestickApi.getFundingRates({
  market_id: 0,
  limit: 10,
});
```

## Signer Client Usage

### WASM Signer Setup
```typescript
import { SignerClient } from 'lighter-ts';

const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: process.env.PRIVATE_KEY,
  accountIndex: 65,
  apiKeyIndex: 1,
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});

// Initialize WASM signer
await client.initialize();
```

### Order Creation
```typescript
// Create a limit order
const [order, txHash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
  baseAmount: 100000, // 1 USDC
  price: 270000, // $2700
  isAsk: true, // Sell order
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: 0,
  orderExpiry: Date.now() + 24 * 60 * 60 * 1000, // 1 day
});

if (error) {
  console.error('Order creation failed:', error);
} else {
  console.log('Order created successfully:', txHash);
}
```

### Market Orders
```typescript
// Create a market order
const [marketOrder, marketHash, marketError] = await client.createMarketOrder({
  marketIndex: 0,
  clientOrderIndex: 124,
  baseAmount: 100000, // 1 USDC
  isAsk: false, // Buy order
  reduceOnly: false,
});

if (marketError) {
  console.error('Market order failed:', marketError);
} else {
  console.log('Market order created:', marketHash);
}
```

### Order Cancellation
```typescript
// Cancel an existing order
const [cancelTx, cancelHash, cancelError] = await client.cancelOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
});

if (cancelError) {
  console.error('Order cancellation failed:', cancelError);
} else {
  console.log('Order cancelled successfully:', cancelHash);
}
```

### API Key Generation
```typescript
// Generate new API key pair
const keyPair = await client.generateAPIKey();
if (keyPair) {
  console.log('New API Key Pair:');
  console.log('Private Key:', keyPair.privateKey);
  console.log('Public Key:', keyPair.publicKey);
  
  // Save the private key securely for future use
  // Update your environment variables
}
```

### Authentication Tokens
```typescript
// Create authentication token
const authToken = await client.createAuthTokenWithExpiry(3600); // 1 hour
console.log('Auth Token:', authToken);

// Use token for API calls
const authenticatedClient = new ApiClient({
  host: 'https://testnet.zklighter.elliot.ai',
  authToken: authToken,
});
```

## WebSocket Usage

### Basic WebSocket Connection
```typescript
import { WsClient } from 'lighter-ts';

const wsClient = new WsClient({
  url: 'wss://testnet.zklighter.elliot.ai/ws',
  onMessage: (data) => {
    console.log('Received:', data);
  },
  onError: (error) => {
    console.error('WebSocket error:', error);
  },
  onClose: () => {
    console.log('WebSocket closed');
  },
});

// Connect to WebSocket
await wsClient.connect();
```

### Order Book Subscriptions
```typescript
// Subscribe to order book updates
wsClient.subscribe({
  channel: 'orderbook',
  params: { market_id: 0 },
});

// Handle order book updates
wsClient.onMessage = (data) => {
  if (data.type === 'orderbook') {
    console.log('Order book update:', data);
    // Update your local order book
  }
};
```

### Trade Subscriptions
```typescript
// Subscribe to trade updates
wsClient.subscribe({
  channel: 'trades',
  params: { market_id: 0 },
});

// Handle trade updates
wsClient.onMessage = (data) => {
  if (data.type === 'trades') {
    console.log('New trade:', data);
    // Update your trade history
  }
};
```

### Account Subscriptions
```typescript
// Subscribe to account updates
wsClient.subscribe({
  channel: 'account',
  params: { account_index: 1 },
});

// Handle account updates
wsClient.onMessage = (data) => {
  if (data.type === 'account') {
    console.log('Account update:', data);
    // Update your account state
  }
};
```

### Multiple Subscriptions
```typescript
// Subscribe to multiple channels
wsClient.subscribe({
  channel: 'orderbook',
  params: { market_id: 0 },
});

wsClient.subscribe({
  channel: 'trades',
  params: { market_id: 0 },
});

wsClient.subscribe({
  channel: 'account',
  params: { account_index: 1 },
});

// Handle different message types
wsClient.onMessage = (data) => {
  switch (data.type) {
    case 'orderbook':
      // Handle order book updates
      break;
    case 'trades':
      // Handle trade updates
      break;
    case 'account':
      // Handle account updates
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
};
```

## Common Patterns

### Trading Bot Pattern
```typescript
class TradingBot {
  private client: SignerClient;
  private wsClient: WsClient;
  private orderBook: any = { bids: [], asks: [] };

  constructor(config: any) {
    this.client = new SignerClient(config);
    this.wsClient = new WsClient({
      url: config.wsUrl,
      onMessage: this.handleMessage.bind(this),
    });
  }

  async initialize() {
    await this.client.initialize();
    await this.wsClient.connect();
    
    // Subscribe to order book updates
    this.wsClient.subscribe({
      channel: 'orderbook',
      params: { market_id: 0 },
    });
  }

  private handleMessage(data: any) {
    if (data.type === 'orderbook') {
      this.orderBook = data.data;
      this.checkTradingOpportunities();
    }
  }

  private checkTradingOpportunities() {
    // Implement your trading logic
    const bestBid = this.orderBook.bids[0];
    const bestAsk = this.orderBook.asks[0];
    
    if (bestBid && bestAsk) {
      const spread = bestAsk.price - bestBid.price;
      if (spread > 100) { // Arbitrage opportunity
        this.executeArbitrage(bestBid, bestAsk);
      }
    }
  }

  private async executeArbitrage(bid: any, ask: any) {
    // Implement arbitrage logic
    console.log('Executing arbitrage:', { bid, ask });
  }
}
```

### Portfolio Manager Pattern
```typescript
class PortfolioManager {
  private client: SignerClient;
  private accountApi: AccountApi;

  constructor(config: any) {
    this.client = new SignerClient(config);
    this.accountApi = new AccountApi(new ApiClient(config));
  }

  async initialize() {
    await this.client.initialize();
  }

  async getPortfolio() {
    const account = await this.accountApi.getAccount({
      by: 'index',
      value: '1',
    });
    
    const pnl = await this.accountApi.getAccountPnL(1);
    const stats = await this.accountApi.getAccountStats(1);
    
    return {
      account,
      pnl,
      stats,
      timestamp: Date.now(),
    };
  }

  async rebalancePortfolio(targetAllocation: any) {
    const portfolio = await this.getPortfolio();
    
    // Calculate rebalancing trades
    const trades = this.calculateRebalancingTrades(portfolio, targetAllocation);
    
    // Execute trades
    for (const trade of trades) {
      await this.executeTrade(trade);
    }
  }

  private calculateRebalancingTrades(portfolio: any, target: any) {
    // Implement rebalancing logic
    return [];
  }

  private async executeTrade(trade: any) {
    const [order, txHash, error] = await this.client.createOrder(trade);
    if (error) {
      console.error('Trade execution failed:', error);
    } else {
      console.log('Trade executed:', txHash);
    }
  }
}
```

### Market Data Aggregator Pattern
```typescript
class MarketDataAggregator {
  private wsClient: WsClient;
  private data: Map<string, any> = new Map();

  constructor(config: any) {
    this.wsClient = new WsClient({
      url: config.wsUrl,
      onMessage: this.handleMessage.bind(this),
    });
  }

  async initialize() {
    await this.wsClient.connect();
    
    // Subscribe to multiple markets
    for (const marketId of [0, 1, 2]) {
      this.wsClient.subscribe({
        channel: 'orderbook',
        params: { market_id: marketId },
      });
      
      this.wsClient.subscribe({
        channel: 'trades',
        params: { market_id: marketId },
      });
    }
  }

  private handleMessage(data: any) {
    const key = `${data.type}_${data.params?.market_id}`;
    this.data.set(key, data);
    
    // Emit data to subscribers
    this.emit('data', { key, data });
  }

  getMarketData(marketId: number, type: string) {
    return this.data.get(`${type}_${marketId}`);
  }

  getAllData() {
    return Object.fromEntries(this.data);
  }

  private emit(event: string, data: any) {
    // Implement event emission logic
    console.log('Event:', event, data);
  }
}
```

## Error Handling

### Comprehensive Error Handling
```typescript
import {
  ApiException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ServiceException,
} from 'lighter-ts';

async function safeApiCall<T>(apiCall: () => Promise<T>): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    if (error instanceof BadRequestException) {
      console.error('Bad request:', error.message);
      console.error('Status:', error.status);
      console.error('Response:', error.response);
    } else if (error instanceof UnauthorizedException) {
      console.error('Unauthorized:', error.message);
      // Handle authentication issues
    } else if (error instanceof NotFoundException) {
      console.error('Not found:', error.message);
      // Handle missing resources
    } else if (error instanceof ServiceException) {
      console.error('Server error:', error.message);
      // Handle server issues
    } else if (error instanceof ApiException) {
      console.error('API error:', error.message, error.status);
    } else {
      console.error('Unknown error:', error);
    }
    return null;
  }
}

// Usage
const account = await safeApiCall(() => 
  accountApi.getAccount({ by: 'index', value: '1' })
);
```

### Retry Logic
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const account = await withRetry(() => 
  accountApi.getAccount({ by: 'index', value: '1' })
);
```

### Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();
const account = await circuitBreaker.execute(() => 
  accountApi.getAccount({ by: 'index', value: '1' })
);
```

## Performance Tips

### Connection Pooling
```typescript
class ConnectionPool {
  private clients: ApiClient[] = [];
  private currentIndex: number = 0;

  constructor(private poolSize: number = 5) {
    for (let i = 0; i < poolSize; i++) {
      this.clients.push(new ApiClient({
        host: 'https://testnet.zklighter.elliot.ai',
        apiKey: process.env.API_KEY,
        secretKey: process.env.SECRET_KEY,
      }));
    }
  }

  getClient(): ApiClient {
    const client = this.clients[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;
    return client;
  }
}

// Usage
const pool = new ConnectionPool();
const client = pool.getClient();
const accountApi = new AccountApi(client);
```

### Caching
```typescript
class ApiCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private ttl: number = 60000; // 1 minute

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }
}

// Usage
const cache = new ApiCache();

async function getCachedAccount(index: string) {
  const cacheKey = `account_${index}`;
  let account = cache.get(cacheKey);
  
  if (!account) {
    account = await accountApi.getAccount({ by: 'index', value: index });
    cache.set(cacheKey, account);
  }
  
  return account;
}
```

### Batch Operations
```typescript
async function batchGetAccounts(indices: string[]) {
  const promises = indices.map(index => 
    accountApi.getAccount({ by: 'index', value: index })
  );
  
  return Promise.all(promises);
}

// Usage
const accounts = await batchGetAccounts(['1', '2', '3', '4', '5']);
```

## Real-World Examples

### Complete Trading Bot
```typescript
import { SignerClient, WsClient, AccountApi, OrderApi } from 'lighter-ts';

class CompleteTradingBot {
  private signerClient: SignerClient;
  private wsClient: WsClient;
  private accountApi: AccountApi;
  private orderApi: OrderApi;
  private isRunning: boolean = false;

  constructor(config: any) {
    this.signerClient = new SignerClient(config);
    this.wsClient = new WsClient({
      url: config.wsUrl,
      onMessage: this.handleMessage.bind(this),
    });
    this.accountApi = new AccountApi(new ApiClient(config));
    this.orderApi = new OrderApi(new ApiClient(config));
  }

  async start() {
    await this.signerClient.initialize();
    await this.wsClient.connect();
    
    this.isRunning = true;
    console.log('Trading bot started');
    
    // Subscribe to market data
    this.wsClient.subscribe({
      channel: 'orderbook',
      params: { market_id: 0 },
    });
    
    this.wsClient.subscribe({
      channel: 'trades',
      params: { market_id: 0 },
    });
    
    this.wsClient.subscribe({
      channel: 'account',
      params: { account_index: 1 },
    });
  }

  async stop() {
    this.isRunning = false;
    await this.wsClient.disconnect();
    console.log('Trading bot stopped');
  }

  private handleMessage(data: any) {
    if (!this.isRunning) return;
    
    switch (data.type) {
      case 'orderbook':
        this.handleOrderBookUpdate(data);
        break;
      case 'trades':
        this.handleTradeUpdate(data);
        break;
      case 'account':
        this.handleAccountUpdate(data);
        break;
    }
  }

  private handleOrderBookUpdate(data: any) {
    // Implement order book analysis
    console.log('Order book updated:', data);
  }

  private handleTradeUpdate(data: any) {
    // Implement trade analysis
    console.log('New trade:', data);
  }

  private handleAccountUpdate(data: any) {
    // Implement account monitoring
    console.log('Account updated:', data);
  }

  async placeOrder(orderParams: any) {
    const [order, txHash, error] = await this.signerClient.createOrder(orderParams);
    
    if (error) {
      console.error('Order placement failed:', error);
      return null;
    }
    
    console.log('Order placed:', txHash);
    return txHash;
  }

  async cancelOrder(clientOrderIndex: number) {
    const [cancelTx, cancelHash, error] = await this.signerClient.cancelOrder({
      marketIndex: 0,
      clientOrderIndex,
    });
    
    if (error) {
      console.error('Order cancellation failed:', error);
      return null;
    }
    
    console.log('Order cancelled:', cancelHash);
    return cancelHash;
  }
}

// Usage
const bot = new CompleteTradingBot({
  url: 'https://testnet.zklighter.elliot.ai',
  wsUrl: 'wss://testnet.zklighter.elliot.ai/ws',
  privateKey: process.env.PRIVATE_KEY,
  accountIndex: 65,
  apiKeyIndex: 1,
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});

await bot.start();

// Place a test order
await bot.placeOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
  baseAmount: 100000,
  price: 270000,
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: 0,
});

// Stop the bot
await bot.stop();
```

---

## Next Steps

1. **Try Examples**: Run the provided examples to understand the SDK
2. **Build Your App**: Use the patterns to create your own application
3. **Optimize Performance**: Implement caching and connection pooling
4. **Handle Errors**: Use comprehensive error handling strategies
5. **Monitor & Debug**: Use WebSocket connections for real-time monitoring

For more information, see:
- [Developer Guide](./DEVELOPER-GUIDE.md)
- [Build Guide](./BUILD-GUIDE.md)
- [Examples README](./examples/README.md)
