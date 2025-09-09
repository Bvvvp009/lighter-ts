# Lighter TypeScript SDK - Developer Guide

A comprehensive guide for developers on how to build, compile, and use the Lighter TypeScript SDK with full Windows WASM signer support.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Setup](#development-setup)
3. [Building & Compilation](#building--compilation)
4. [WASM Signer Setup](#wasm-signer-setup)
5. [API Usage](#api-usage)
6. [Examples & Patterns](#examples--patterns)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites
- Node.js 16.0+
- TypeScript 5.0+
- Go 1.23+ (for WASM signer build)

### Installation
```bash
# Clone the repository
git clone https://github.com/elliottech/lighter-ts.git
cd lighter-ts

# Install dependencies
npm install

# Build the SDK
npm run build
```

### Basic Usage
```typescript
import { ApiClient, AccountApi } from 'lighter-ts';

const client = new ApiClient({
  host: 'https://testnet.zklighter.elliot.ai',
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
});

const accountApi = new AccountApi(client);
const account = await accountApi.getAccount({ by: 'index', value: '1' });
```

## Development Setup

### Project Structure
```
lighter-ts-standalone/
├── src/                    # TypeScript source code
│   ├── api/               # API client classes
│   ├── signer/            # Signing functionality
│   ├── types/             # Type definitions
│   └── utils/             # Utility functions
├── examples/              # Usage examples
├── tests/                 # Test files
├── dist/                  # Compiled output
├── signers/wasm-signer/   # WASM signer build files
└── package.json           # Project configuration
```

### Environment Configuration
```bash
# Copy environment template
cp env.example .env

# Edit .env with your values
PRIVATE_KEY=your_private_key_here
BASE_URL=https://testnet.zklighter.elliot.ai
```

### Development Scripts
```bash
# Build the project
npm run build

# Watch mode for development
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean
```

## Building & Compilation

### TypeScript Compilation
The SDK uses TypeScript with strict configuration:

```bash
# Compile TypeScript to JavaScript
npm run build

# Watch mode for development
npm run dev
```

### Build Configuration
The `tsconfig.json` includes:
- Strict type checking
- ES2020 target
- CommonJS modules
- Source maps for debugging

### Output Structure
```
dist/
├── index.js              # Main entry point
├── index.d.ts            # Type definitions
├── api/                  # API client classes
├── signer/               # Signing functionality
├── types/                # Type definitions
└── utils/                # Utility functions
```

### Publishing
```bash
# Clean and build before publishing
npm run prepublishOnly

# Publish to npm
npm publish
```

## WASM Signer Setup

### Overview
The WASM signer enables Windows compatibility by compiling Go cryptographic libraries to WebAssembly.

### Building WASM Signer

#### Prerequisites
- Go 1.23+ installed
- Access to lighter-go repository

#### Build Process
```bash
# Clone the lighter-go repository
git clone https://github.com/elliottech/lighter-go.git
cd lighter-go

# Build WASM binary (Windows)
./build-wasm.bat

# Build WASM binary (Unix/Linux/macOS)
./build-wasm.sh
```

#### Output Files
- `lighter-signer.wasm` - WASM binary (3.02 MB)
- `wasm_exec.js` - Go WASM runtime

### Integration Steps

1. **Copy WASM Files**
```bash
cp lighter-signer.wasm /path/to/your/project/
cp wasm_exec.js /path/to/your/project/
```

2. **Configure SignerClient**
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

// Initialize WASM signer
await client.initialize();
```

### Browser Integration
For browser usage, serve WASM files from your web server:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Lighter WASM Signer</title>
</head>
<body>
    <script src="./wasm_exec.js"></script>
    <script type="module">
        import { SignerClient } from './dist/signer/wasm-signer-client.js';
        
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
        
        await client.initialize();
        // Use client...
    </script>
</body>
</html>
```

## API Usage

### Core Classes

#### ApiClient
Main HTTP client for API requests:
```typescript
import { ApiClient } from 'lighter-ts';

const client = new ApiClient({
  host: 'https://testnet.zklighter.elliot.ai',
  apiKey: 'your-api-key',
  secretKey: 'your-secret-key',
  timeout: 30000,
  userAgent: 'MyApp/1.0.0',
});
```

#### SignerClient
Transaction signing and order management:
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

await client.initialize();
```

#### WsClient
WebSocket client for real-time data:
```typescript
import { WsClient } from 'lighter-ts';

const wsClient = new WsClient({
  url: 'wss://testnet.zklighter.elliot.ai/ws',
  onMessage: (data) => console.log('Received:', data),
  onError: (error) => console.error('Error:', error),
  onClose: () => console.log('Closed'),
});

await wsClient.connect();
```

### API Classes

#### AccountApi
```typescript
import { AccountApi } from 'lighter-ts';

const accountApi = new AccountApi(client);

// Get account by index
const account = await accountApi.getAccount({
  by: 'index',
  value: '1',
});

// Get all accounts
const accounts = await accountApi.getAccounts({
  limit: 10,
  index: 0,
  sort: 'asc',
});

// Get API keys
const apiKeys = await accountApi.getApiKeys(1, 0);
```

#### OrderApi
```typescript
import { OrderApi } from 'lighter-ts';

const orderApi = new OrderApi(client);

// Get order book
const orderBook = await orderApi.getOrderBookDetails({
  market_id: 0,
  depth: 10,
});

// Get recent trades
const trades = await orderApi.getRecentTrades({
  market_id: 0,
  limit: 10,
});

// Get exchange stats
const stats = await orderApi.getExchangeStats();
```

#### TransactionApi
```typescript
import { TransactionApi } from 'lighter-ts';

const transactionApi = new TransactionApi(client);

// Get current height
const height = await transactionApi.getCurrentHeight();

// Get block
const block = await transactionApi.getBlock({
  by: 'height',
  value: '1',
});

// Get transaction
const tx = await transactionApi.getTransaction({
  by: 'hash',
  value: 'tx-hash',
});
```

### Error Handling
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

## Examples & Patterns

### Order Management Pattern
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

await client.initialize();

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
  console.log('Order created:', txHash);
}

// Cancel the order
const [cancelTx, cancelHash, cancelError] = await client.cancelOrder({
  marketIndex: 0,
  clientOrderIndex: 123,
});

if (cancelError) {
  console.error('Order cancellation failed:', cancelError);
} else {
  console.log('Order cancelled:', cancelHash);
}
```

### Market Order Pattern
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

### API Key Generation Pattern
```typescript
// Generate new API key pair
const keyPair = await client.generateAPIKey();
if (keyPair) {
  console.log('Private Key:', keyPair.privateKey);
  console.log('Public Key:', keyPair.publicKey);
  
  // Save the private key securely
  // Use it for future API calls
}
```

### WebSocket Pattern
```typescript
import { WsClient } from 'lighter-ts';

const wsClient = new WsClient({
  url: 'wss://testnet.zklighter.elliot.ai/ws',
  onMessage: (data) => {
    console.log('Received:', data);
    // Handle different message types
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
    }
  },
  onError: (error) => {
    console.error('WebSocket error:', error);
  },
  onClose: () => {
    console.log('WebSocket closed');
  },
});

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

// Unsubscribe when done
wsClient.unsubscribe('orderbook');
wsClient.disconnect();
```

### Batch Transaction Pattern
```typescript
// Create multiple orders in a batch
const orders = [
  {
    marketIndex: 0,
    clientOrderIndex: 125,
    baseAmount: 100000,
    price: 270000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 0,
  },
  {
    marketIndex: 0,
    clientOrderIndex: 126,
    baseAmount: 200000,
    price: 275000,
    isAsk: true,
    orderType: SignerClient.ORDER_TYPE_LIMIT,
    timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: false,
    triggerPrice: 0,
  },
];

// Send batch transaction
const [batchTx, batchHash, batchError] = await client.sendTransactionBatch(orders);

if (batchError) {
  console.error('Batch transaction failed:', batchError);
} else {
  console.log('Batch transaction sent:', batchHash);
}
```

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPattern=api-client.test.ts
```

### Test Structure
```
tests/
├── api-client.test.ts    # API client tests
├── setup.ts             # Test setup
└── __mocks__/           # Mock files
```

### Writing Tests
```typescript
import { ApiClient } from '../src/api/api-client';
import { AccountApi } from '../src/api/account-api';

describe('AccountApi', () => {
  let client: ApiClient;
  let accountApi: AccountApi;

  beforeEach(() => {
    client = new ApiClient({
      host: 'https://testnet.zklighter.elliot.ai',
    });
    accountApi = new AccountApi(client);
  });

  it('should get account by index', async () => {
    const account = await accountApi.getAccount({
      by: 'index',
      value: '1',
    });
    
    expect(account).toBeDefined();
    expect(account.index).toBe('1');
  });
});
```

### Example Tests
```bash
# Run example tests
npm run example:test-wasm-signer
npm run example:api-only
npm run example:get-info
```

## Deployment

### Node.js Application
```bash
# Build the project
npm run build

# Install production dependencies
npm install --production

# Start your application
node dist/index.js
```

### Browser Application
```bash
# Build the project
npm run build

# Serve the dist folder with a web server
# Include lighter-signer.wasm and wasm_exec.js
```

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY dist/ ./dist/
COPY lighter-signer.wasm ./
COPY wasm_exec.js ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Environment Variables
```bash
# Production environment
NODE_ENV=production
PRIVATE_KEY=your_production_private_key
BASE_URL=https://mainnet.zklighter.elliot.ai
```

## Troubleshooting

### Common Issues

#### WASM Signer Issues
```bash
# Error: "Failed to initialize WASM signer"
# Solution: Check file paths and WebAssembly support
```

#### Build Issues
```bash
# Error: TypeScript compilation errors
# Solution: Check tsconfig.json and fix type errors
npm run lint
npm run build
```

#### Runtime Issues
```bash
# Error: "Cannot find module"
# Solution: Ensure proper imports and build
npm run clean
npm run build
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=lighter-wasm

# Run with debug output
npm run example:test-wasm-signer
```

### Performance Optimization
1. **Preload WASM**: Initialize signer early in application lifecycle
2. **Reuse Client**: Create one client instance and reuse it
3. **Error Handling**: Always wrap signer calls in try-catch blocks
4. **Connection Pooling**: Reuse HTTP connections for API calls

### Platform-Specific Issues

#### Windows
- Ensure WASM files are accessible
- Check file paths use forward slashes
- Verify WebAssembly support in Node.js version

#### macOS/Linux
- Check file permissions for WASM files
- Ensure Go is installed for WASM building
- Verify Node.js version compatibility

#### Browser
- Serve WASM files from same origin
- Check CORS configuration
- Verify WebAssembly support in browser

### Getting Help
- Check the [examples](./examples/) directory for working code
- Review the [WASM Signer README](./WASM-SIGNER-README.md)
- Open an issue on GitHub with detailed error information

---

## Next Steps

1. **Explore Examples**: Check the `examples/` directory for complete working examples
2. **Build WASM Signer**: Follow the WASM setup guide for Windows compatibility
3. **Run Tests**: Execute the test suite to verify functionality
4. **Deploy**: Use the deployment guide for production setup

For more detailed information, see:
- [WASM Signer README](./WASM-SIGNER-README.md)
- [Windows WASM Signer Final Report](./WINDOWS-WASM-SIGNER-FINAL.md)
- [Examples README](./examples/README.md)
