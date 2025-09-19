# Lighter Protocol TypeScript SDK (Unofficial)

> **⚠️ Disclaimer**: This is an **unofficial** TypeScript SDK for Lighter Protocol, built by the community. It is not officially maintained by the Lighter Protocol team.

TypeScript SDK for Lighter Protocol - A decentralized perpetual exchange built on zkSync.

## Requirements

- Node.js 16+
- TypeScript 4.5+

## Installation & Usage

### npm install

```sh
npm install lighter-ts-sdk
```

### yarn install

```sh
yarn add lighter-ts-sdk
```

Then import the package:

```typescript
import { SignerClient, ApiClient } from 'lighter-ts-sdk';
```

## Quick Start Examples

### 1. Basic API Usage

```typescript
import { ApiClient, AccountApi } from 'lighter-protocol-sdk';

async function getAccountInfo() {
  const client = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const accountApi = new AccountApi(client);
  
  const account = await accountApi.getAccount({ by: 'index', value: '1' });
  console.log('Account:', account);
}

getAccountInfo().catch(console.error);
```

### 2. Create Market Order

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function createMarketOrder() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.createMarketOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 1 BTC in satoshis
    avgExecutionPrice: 300000000, // $30,000 in cents
    isAsk: true // Sell order
  });

  if (err) {
    console.error('Order failed:', err);
  } else {
    console.log('Market order created:', { tx, txHash });
  }
}

createMarketOrder().catch(console.error);
```

### 3. Create Limit Order

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function createLimitOrder() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 500000, // 0.5 BTC
    price: 295000000, // $29,500
    isAsk: false, // Buy order
    timeInForce: SignerClient.TIME_IN_FORCE_GTC // Good Till Cancel
  });

  if (err) {
    console.error('Order failed:', err);
  } else {
    console.log('Limit order created:', { tx, txHash });
  }
}

createLimitOrder().catch(console.error);
```

### 4. Cancel Order

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function cancelOrder() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.cancelOrder({
    marketIndex: 0,
    orderIndex: 12345
  });

  if (err) {
    console.error('Cancel failed:', err);
  } else {
    console.log('Order cancelled:', { tx, txHash });
  }
}

cancelOrder().catch(console.error);
```

### 5. Transfer USDC

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function transferUSDC() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.transfer({
    toAccountIndex: 456,
    usdcAmount: 1000000, // $10,000 in cents
    fee: 0,
    memo: 'a'.repeat(32) // 32-byte memo required
  });

  if (err) {
    console.error('Transfer failed:', err);
  } else {
    console.log('USDC transferred:', { tx, txHash });
  }
}

transferUSDC().catch(console.error);
```

### 6. Update Leverage

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function updateLeverage() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.updateLeverage({
    marketIndex: 0,
    fraction: 10, // 10x leverage
    marginMode: SignerClient.CROSS_MARGIN_MODE
  });

  if (err) {
    console.error('Leverage update failed:', err);
  } else {
    console.log('Leverage updated:', { tx, txHash });
  }
}

updateLeverage().catch(console.error);
```

### 7. Cancel All Orders

```typescript
import { SignerClient } from 'lighter-protocol-sdk';

async function cancelAllOrders() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await client.ensureWasmClient();

  const [tx, txHash, err] = await client.cancelAllOrders({
    timeInForce: SignerClient.TIME_IN_FORCE_GTC,
    time: Date.now()
  });

  if (err) {
    console.error('Cancel all failed:', err);
  } else {
    console.log('All orders cancelled:', { tx, txHash });
  }
}

cancelAllOrders().catch(console.error);
```

### 8. WebSocket Real-time Data

```typescript
import { WsClient } from 'lighter-protocol-sdk';

async function connectWebSocket() {
  const wsClient = new WsClient({
    url: 'wss://mainnet.zklighter.elliot.ai/ws',
    onOpen: () => console.log('WebSocket connected'),
    onMessage: (message) => console.log('Received:', message),
    onClose: () => console.log('WebSocket closed'),
    onError: (error) => console.error('WebSocket error:', error)
  });

  await wsClient.connect();
  
  // Subscribe to order book updates
  wsClient.subscribe('orderbook', { market_id: 0 });
  
  // Subscribe to account updates
  wsClient.subscribe('account', { account_index: 123 });
}

connectWebSocket().catch(console.error);
```

## Signer Client Configuration

The `SignerClient` requires the following configuration:

```typescript
interface SignerConfig {
  url: string;                    // API endpoint
  privateKey: string;            // API key private key
  accountIndex: number;          // Your account index
  apiKeyIndex: number;           // API key index (usually 0)
  wasmConfig: {
    wasmPath: string;           // Path to WASM file
  };
}
```

## Available Constants

```typescript
// Order Types
SignerClient.ORDER_TYPE_LIMIT = 0
SignerClient.ORDER_TYPE_MARKET = 1

// Time in Force
SignerClient.TIME_IN_FORCE_GTC = 0  // Good Till Cancel
SignerClient.TIME_IN_FORCE_IOC = 1  // Immediate or Cancel
SignerClient.TIME_IN_FORCE_FOK = 2  // Fill or Kill

// Margin Modes
SignerClient.CROSS_MARGIN_MODE = 0
SignerClient.ISOLATED_MARGIN_MODE = 1
```

## Documentation

- [Getting Started Guide](docs/GettingStarted.md)
- [API Reference](docs/API.md)
- [SignerClient Documentation](docs/SignerClient.md)
- [WebSocket Client](docs/WsClient.md)
- [Type Definitions](docs/types/)

## Examples

Check the `examples/` directory for comprehensive usage examples:

- `create_market_order.ts` - Basic market order creation
- `create_cancel_order.ts` - Order management
- `transfer_update_leverage.ts` - Account operations
- `system_setup.ts` - API key management
- `ws_*.ts` - WebSocket examples

## SDK Status Report

### ✅ **Currently Working & Released**

#### **Core Trading Functionality**
- ✅ **Market Orders** - Create market buy/sell orders with price limits
- ✅ **Limit Orders** - Create limit orders with GTC/IOC/FOK time in force
- ✅ **Order Cancellation** - Cancel individual orders by market and order index
- ✅ **Cancel All Orders** - Cancel all orders for an account
- ✅ **USDC Transfers** - Transfer USDC between accounts with memo support
- ✅ **Leverage Updates** - Update leverage for cross/isolated margin modes

#### **Account Management**
- ✅ **API Key Generation** - Generate new API keys for trading
- ✅ **API Key Management** - Change API keys and manage permissions
- ✅ **Account Information** - Retrieve account details, positions, and balances
- ✅ **Nonce Management** - Automatic nonce handling for transactions

#### **Real-time Data**
- ✅ **WebSocket Client** - Real-time order book, trades, and account updates
- ✅ **Order Book Data** - Live market depth and price levels
- ✅ **Trade Data** - Recent trades and execution information
- ✅ **Account Updates** - Real-time position and balance updates

#### **API Coverage**
- ✅ **AccountApi** - Complete account management endpoints
- ✅ **OrderApi** - Order book, trades, and exchange statistics
- ✅ **TransactionApi** - Transaction history and nonce management
- ✅ **BlockApi** - Block information and current height
- ✅ **CandlestickApi** - Historical price data and funding rates

#### **Technical Features**
- ✅ **WASM Signer** - Go-compiled WebAssembly for cryptographic operations
- ✅ **Cross-Platform** - Windows, Linux, macOS support
- ✅ **TypeScript Support** - Complete type definitions and IntelliSense
- ✅ **Error Handling** - Comprehensive error handling and validation
- ✅ **Chain ID Support** - Correct mainnet chain ID (304) integration

### 🔧 **Technical Implementation**

#### **WASM Signer Capabilities**
- ✅ **Transaction Signing** - All transaction types properly signed
- ✅ **Signature Validation** - Server-side signature verification working
- ✅ **Order Expiry Handling** - Correct OrderExpiry and ExpiredAt management
- ✅ **Field Validation** - Proper field names and types (MarketIndex, USDCAmount, etc.)
- ✅ **Memo Support** - 32-byte memo field for transfers
- ✅ **Margin Mode Support** - Cross and isolated margin mode handling

#### **API Integration**
- ✅ **sendTxWithIndices** - Correct API endpoint for transaction submission
- ✅ **Authentication** - API key-based authentication working
- ✅ **Rate Limiting** - Proper request handling and retry logic
- ✅ **Error Codes** - Complete error code handling (21120, 21505, etc.)

### 📋 **What's Working in Production**

1. **Complete Trading Flow**
   - Generate API keys → Create orders → Monitor positions → Cancel orders
   - All order types (market, limit) with proper time in force
   - Real-time order book and trade data via WebSocket

2. **Account Operations**
   - USDC transfers between accounts
   - Leverage updates for risk management
   - API key rotation and management

3. **Cross-Platform Compatibility**
   - Node.js 16+ support across all platforms
   - Browser compatibility with WebAssembly
   - TypeScript 4.5+ support

### 🚀 **Next Release Features**

#### **Planned Enhancements**
- 🔄 **Stop Loss/Take Profit Orders** - Advanced order types with trigger prices
- 🔄 **Batch Operations** - Multiple order creation in single transaction
- 🔄 **Advanced Slippage Protection** - Enhanced slippage control mechanisms
- 🔄 **Position Management** - Enhanced position tracking and management
- 🔄 **Risk Management** - Additional risk controls and position limits

#### **API Extensions**
- 🔄 **Funding Rate API** - Historical and current funding rates
- 🔄 **Announcement API** - System announcements and updates
- 🔄 **Referral API** - Referral program integration
- 🔄 **Notification API** - Push notifications for important events

#### **Developer Experience**
- 🔄 **Enhanced Error Messages** - More descriptive error handling
- 🔄 **Rate Limit Headers** - Better rate limiting information
- 🔄 **Request/Response Logging** - Debug logging capabilities
- 🔄 **Mock Testing** - Testing utilities and mock data

### 🎯 **Current Version: 1.0.0 (Unofficial Release)**

**⚠️ Community-Built SDK**
- This is an **unofficial** TypeScript SDK built by the community
- Not officially maintained by Lighter Protocol team
- Built with full feature parity to the official Python SDK
- Ready for production use with comprehensive testing

**Ready for Production Use**
- All core trading functionality implemented and tested
- Complete API coverage matching Python SDK
- Cross-platform compatibility verified
- Comprehensive documentation and examples
- TypeScript support with full type definitions

**Installation**: `npm install lighter-protocol-sdk`

**Documentation**: Complete API reference and getting started guides included

**Support**: Full feature parity with Python SDK, ready for production trading