# Lighter TypeScript SDK

TypeScript SDK for Lighter - A modern, type-safe client for the Lighter API with **Windows WASM signer support**.

## Features

- 🔒 **Type Safety**: Full TypeScript support with comprehensive type definitions
- 🚀 **Modern**: Built with modern JavaScript/TypeScript features
- 🔄 **Async/Await**: Promise-based API with async/await support
- 📡 **WebSocket Support**: Real-time data streaming capabilities
- 🛡️ **Error Handling**: Comprehensive error handling with custom exception classes
- 📦 **Modular**: Clean, modular architecture with separate API classes
- 🧪 **Tested**: Comprehensive test suite with Jest
- 🪟 **Windows Support**: WASM signer for Windows compatibility (where Python SDK fails)

## Platform Support

| Platform | Python SDK | TypeScript SDK | WASM Signer |
|----------|------------|----------------|-------------|
| Windows  | ❌ Not supported | ✅ Supported | ✅ **Full Support** |
| macOS    | ✅ Native | ✅ Supported | ✅ Supported |
| Linux    | ✅ Native | ✅ Supported | ✅ Supported |
| Browser  | ❌ Not supported | ✅ Supported | ✅ Supported |

**Windows users**: The TypeScript SDK with WASM signer provides equivalent functionality to the Python SDK on macOS/Linux.

## Requirements

- Node.js 16.0+
- TypeScript 5.0+

## Installation

```bash
npm install lighter-ts
```

## Quick Start

### Basic API Usage

```typescript
import { ApiClient, AccountApi, OrderApi } from 'lighter-ts';

async function main() {
  // Create API client
  const client = new ApiClient({
    host: 'https://testnet.zklighter.elliot.ai',
    apiKey: 'your-api-key',
    secretKey: 'your-secret-key',
  });

  // Initialize API instances
  const accountApi = new AccountApi(client);
  const orderApi = new OrderApi(client);

  try {
    // Get account information
    const account = await accountApi.getAccount({
      by: 'index',
      value: '1',
    });
    console.log('Account:', account);

    // Get order book
    const orderBook = await orderApi.getOrderBookDetails({
      market_id: 0,
      depth: 10,
    });
    console.log('Order Book:', orderBook);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

main();
```

## Transaction Signing

The TypeScript SDK supports multiple approaches for transaction signing:

### 1. WASM Signer (Recommended for Windows)

The WASM signer compiles the Go cryptographic libraries into WebAssembly, providing Windows compatibility without requiring Go installation:

```typescript
import { SignerClient } from 'lighter-ts';

const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: 'your-private-key',
  accountIndex: 65,
  apiKeyIndex: 1,
  wasmConfig: {
    wasmPath: './lighter-signer.wasm',
    wasmExecPath: './wasm_exec.js'
  }
});

// Initialize the WASM signer
await client.initialize();

// Create an order
const [tx, txHash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
  baseAmount: 100000,
  price: 270000,
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: 0,
  orderExpiry: Date.now() + 24 * 60 * 60 * 1000, // 1 day from now
});
```

#### Benefits of WASM Signer:
- ✅ **Windows Compatibility**: Works on Windows without Go installation
- ✅ **Cross-Platform**: Runs in browser and Node.js environments
- ✅ **Cryptographic Accuracy**: Uses the exact same Go crypto libraries
- ✅ **No External Dependencies**: No need for separate signer servers
- ✅ **Performance**: Native-speed cryptographic operations
- ✅ **Security**: Private keys never leave your application

#### Setup WASM Signer:

1. **Build WASM Module** (one-time setup):
   ```bash
   # Install Go (if not already installed)
   # Download from https://golang.org/dl/
   
   # Clone and build
   git clone https://github.com/elliottech/lighter-go.git
   cd lighter-go
   ./build-wasm.sh  # or build-wasm.bat on Windows
   ```

2. **Copy Files to Your Project**:
   ```bash
   cp lighter-signer.wasm /path/to/your/project/public/
   cp wasm_exec.js /path/to/your/project/public/
   ```

3. **Use in Your Application**:
   ```typescript
   // Initialize and use as shown above
   await client.initialize();
   ```

### 2. Go Signer Server (Alternative)

The Go Signer Server provides the same cryptographic accuracy as WASM but requires a separate server:

```typescript
import { SignerClient } from 'lighter-ts';

const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: 'your-private-key',
  accountIndex: 65,
  apiKeyIndex: 1,
  signerServerUrl: 'http://localhost:8080' // Go signer server URL
});

// Create an order
const [tx, txHash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
  baseAmount: 100000,
  price: 270000,
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: 0,
  orderExpiry: Date.now() + 24 * 60 * 60 * 1000, // 1 day from now
});
```

#### Benefits of Go Signer Server:
- ✅ **Cryptographic Accuracy**: Uses the exact same Go crypto libraries as the Python SDK
- ✅ **Proven Reliability**: Battle-tested in production environments
- ✅ **Full Feature Support**: Supports all transaction types and operations
- ✅ **Easy Deployment**: Simple Docker container deployment
- ✅ **Cross-Platform**: Works on any platform that supports Docker

#### Setup Go Signer Server:

1. **Using Docker (Recommended)**:
   ```bash
   cd lighter-signer-server
   docker-compose up -d
   ```

2. **Manual Build**:
   ```bash
   cd lighter-signer-server
   go mod download
   go run main.go
   ```

3. **Production Deployment**:
   ```bash
   # Build Docker image
   docker build -t lighter-signer .
   
   # Run with environment variables
   docker run -d -p 8080:8080 lighter-signer
   ```

### 3. Local Signer (Experimental)

For development and testing, you can use the local signer:

```typescript
import { SignerClient } from 'lighter-ts';

const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: 'your-private-key',
  accountIndex: 65,
  apiKeyIndex: 1,
  // No signerServerUrl or wasmConfig - uses local signer
});

// Note: Local signer may have compatibility issues
const [tx, txHash, error] = await client.createOrder({
  // ... order parameters
});
```

**⚠️ Warning**: The local signer is experimental and may not produce valid signatures due to cryptographic implementation differences. Use WASM signer or Go Signer Server for production applications.

## Signer Comparison

| Feature | WASM Signer | Go Signer Server | Local Signer |
|---------|-------------|------------------|--------------|
| Windows Support | ✅ | ✅ | ❌ |
| Browser Support | ✅ | ❌ | ❌ |
| No External Dependencies | ✅ | ❌ | ❌ |
| Cryptographic Accuracy | ✅ | ✅ | ⚠️ |
| Performance | ✅ | ⚠️ | ⚠️ |
| Setup Complexity | Medium | Low | High |
| Production Ready | ✅ | ✅ | ❌ |

**Benefits:**
- ✅ Exact cryptographic compatibility with Python SDK
- ✅ Production-ready with Docker/Kubernetes support
- ✅ Secure key management
- ✅ Health monitoring and logging

### 2. Local Signer (Experimental)

The SDK includes a local TypeScript implementation using Poseidon-Goldilocks and Schnorr signatures. However, this is **experimental** and may not be compatible with the exact cryptographic parameters used by Lighter.

**Usage:**
```typescript
const client = new SignerClient({
  url: 'https://testnet.zklighter.elliot.ai',
  privateKey: 'your_private_key',
  accountIndex: 65,
  apiKeyIndex: 1,
  // No signerServerUrl = uses local signer
});
```

**Limitations:**
- ⚠️ May not be cryptographically compatible
- ⚠️ Not recommended for production use
- ⚠️ Requires complex field arithmetic implementation

## API Examples

### Account Operations

```typescript
import { ApiClient, AccountApi } from 'lighter-ts';

const client = new ApiClient();
const accountApi = new AccountApi(client);

// Get account by index
const account = await accountApi.getAccount({
  by: 'index',
  value: '1',
});

// Get account by L1 address
const accountByAddress = await accountApi.getAccount({
  by: 'l1_address',
  value: '0x8D7f03FdE1A626223364E592740a233b72395235',
});

// Get all accounts
const accounts = await accountApi.getAccounts({
  limit: 10,
  index: 0,
  sort: 'asc',
});

// Get API keys
const apiKeys = await accountApi.getApiKeys(1, 0);

// Check if account is whitelisted
const isWhitelisted = await accountApi.isWhitelisted(1);
```

### Order Operations

```typescript
import { ApiClient, OrderApi } from 'lighter-ts';

const client = new ApiClient();
const orderApi = new OrderApi(client);

// Get exchange statistics
const stats = await orderApi.getExchangeStats();

// Get order book details
const orderBook = await orderApi.getOrderBookDetails({
  market_id: 0,
  depth: 10,
});

// Get recent trades
const trades = await orderApi.getRecentTrades({
  market_id: 0,
  limit: 10,
});

// Create a limit order
const order = await orderApi.createOrder({
  market_id: 0,
  side: 'buy',
  type: 'limit',
  size: '1.0',
  price: '50000',
  time_in_force: 'GTC',
});

// Cancel an order
await orderApi.cancelOrder({
  market_id: 0,
  order_id: 'order-id',
});
```

### Transaction Operations

```typescript
import { ApiClient, TransactionApi } from 'lighter-ts';

const client = new ApiClient();
const transactionApi = new TransactionApi(client);

// Get current block height
const height = await transactionApi.getCurrentHeight();

// Get block information
const block = await transactionApi.getBlock({
  by: 'height',
  value: '1',
});

// Get transaction
const tx = await transactionApi.getTransaction({
  by: 'hash',
  value: 'tx-hash',
});

// Get next nonce
const nonce = await transactionApi.getNextNonce(1, 0);

// Send transaction
const result = await transactionApi.sendTransaction({
  account_index: 1,
  api_key_index: 0,
  transaction: 'signed-transaction-data',
});
```

### WebSocket Operations

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

// Subscribe to order book updates
wsClient.subscribe({
  channel: 'orderbook',
  params: { market_id: 0 },
});

// Subscribe to trades
wsClient.subscribe({
  channel: 'trades',
  params: { market_id: 0 },
});

// Unsubscribe
wsClient.unsubscribe('orderbook');

// Disconnect
wsClient.disconnect();
```

## Configuration

The SDK can be configured with various options:

```typescript
import { ApiClient } from 'lighter-ts';

const client = new ApiClient({
  host: 'https://testnet.zklighter.elliot.ai', // API host
  apiKey: 'your-api-key',                      // API key for authentication
  secretKey: 'your-secret-key',                // Secret key for authentication
  timeout: 30000,                              // Request timeout in milliseconds
  userAgent: 'MyApp/1.0.0',                    // Custom user agent
});
```

## Error Handling

The SDK provides comprehensive error handling with custom exception classes:

```typescript
import {
  ApiException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ServiceException,
} from 'lighter-ts';

try {
  const result = await api.someMethod();
} catch (error) {
  if (error instanceof BadRequestException) {
    console.error('Bad request:', error.message);
  } else if (error instanceof UnauthorizedException) {
    console.error('Unauthorized:', error.message);
  } else if (error instanceof NotFoundException) {
    console.error('Not found:', error.message);
  } else if (error instanceof ServiceException) {
    console.error('Server error:', error.message);
  } else if (error instanceof ApiException) {
    console.error('API error:', error.message, error.status);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## TypeScript Support

The SDK is built with TypeScript and provides comprehensive type definitions:

```typescript
import { Account, Order, Transaction } from 'lighter-ts';

// All API responses are properly typed
const account: Account = await accountApi.getAccount({ by: 'index', value: '1' });
const orders: Order[] = await orderApi.getAccountActiveOrders(1);
const transactions: Transaction[] = await transactionApi.getAccountTransactions(1);
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
npm run test:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

### Formatting

```bash
npm run format
```

## API Reference

### Core Classes

- `ApiClient` - Main HTTP client for API requests
- `WsClient` - WebSocket client for real-time data
- `Config` - Configuration management

### API Classes

- `AccountApi` - Account-related operations
- `OrderApi` - Order and trading operations
- `TransactionApi` - Transaction and blockchain operations

### Exception Classes

- `LighterException` - Base exception class
- `ApiException` - General API exceptions
- `BadRequestException` - 400 errors
- `UnauthorizedException` - 401 errors
- `ForbiddenException` - 403 errors
- `NotFoundException` - 404 errors
- `TooManyRequestsException` - 429 errors
- `ServiceException` - 5xx errors

## Windows WASM Signer Status

✅ **FULLY FUNCTIONAL** - The Windows WASM signer has been thoroughly tested and verified to work correctly.

### Key Achievements:
- ✅ **Complete Implementation**: All signing methods implemented and functional
- ✅ **Windows Compatibility**: Provides Windows support where Python SDK fails  
- ✅ **Equivalent Functionality**: Same capabilities as macOS/Linux Python SDK signers
- ✅ **Security**: Uses same cryptographic libraries compiled to WASM
- ✅ **Performance**: Native-speed cryptographic operations

### Documentation:
- 📄 [Windows WASM Signer Final Report](./WINDOWS-WASM-SIGNER-FINAL.md) - Comprehensive implementation details
- 📄 [WASM Signer README](./signers/wasm-signer/README.md) - Build and usage instructions

**Windows users can now use the TypeScript SDK with full functionality equivalent to macOS and Linux users with the Python SDK.**

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## Support

For support and questions, please open an issue on GitHub or contact the development team.