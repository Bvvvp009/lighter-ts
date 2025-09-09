# Lighter TypeScript SDK Examples

This directory contains comprehensive examples demonstrating how to use the Lighter TypeScript SDK with **full Python SDK functionality** and **Windows WASM signer support**.

## Quick Start

### Prerequisites
- Node.js 16.0+
- TypeScript 5.0+
- Go 1.23+ (for WASM signer examples)

### Setup
```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Set up environment variables
npm run setup
# Edit .env file with your values

# Run a basic example
npm run example:api-only
```

## Example Categories

### 📡 API-Only Examples
Examples that demonstrate API functionality without requiring transaction signing.

#### `api-only-example.ts` - Basic API Usage
**Purpose**: Demonstrates basic API usage without signing functionality. Works on all platforms.

**Features:**
- Get root system information
- Fetch order book data
- Retrieve recent trades
- No authentication required

**Usage:**
```bash
npm run example:api-only
```

**Best for**: Learning API structure, testing connectivity, understanding data formats

#### `get-info.ts` - Comprehensive API Coverage
**Purpose**: Shows all available API endpoints and their usage patterns.

**Features:**
- Account API operations
- Order API operations  
- Transaction API operations
- Block API operations
- Candlestick API operations
- Complete API coverage demonstration

**Usage:**
```bash
npm run example:get-info
```

**Best for**: Understanding full API capabilities, API reference implementation

### 🔐 Authentication & Setup Examples
Examples for account setup, API key management, and authentication.

#### `system-setup.ts` - Account Setup
**Purpose**: Demonstrates account setup and API key management using SignerClient.

**Features:**
- Account verification
- API key generation
- API key management
- Configuration output

**Usage:**
```bash
npm run example:system-setup
```

**Best for**: Initial account setup, API key generation, configuration management

#### `system-setup-wasm.ts` - Windows Account Setup
**Purpose**: Windows-compatible account setup using WASM signer.

**Features:**
- Account verification with WASM
- API key generation
- Windows compatibility
- Same functionality as Python SDK

**Usage:**
```bash
npm run example:system-setup-wasm
```

**Best for**: Windows users, WASM signer validation, cross-platform compatibility

### 📈 Trading Examples
Examples demonstrating order creation, management, and trading operations.

#### `create-cancel-order.ts` - Basic Order Management
**Purpose**: Demonstrates order creation and cancellation using SignerClient.

**Features:**
- Create limit orders
- Cancel existing orders
- Authentication token generation
- Order lifecycle management

**Usage:**
```bash
npm run example:create-cancel-order
```

**Best for**: Learning order management, understanding order parameters

#### `create-cancel-order-demo.ts` - Order Structure Demo
**Purpose**: Shows transaction structure without requiring actual signing.

**Features:**
- Transaction structure demonstration
- API call format examples
- No authentication required
- Educational purpose

**Usage:**
```bash
npm run example:create-cancel-order-demo
```

**Best for**: Understanding transaction structure, learning without API keys

#### `create-cancel-order-wasm-comprehensive.ts` - Windows Order Management
**Purpose**: Complete order management using WASM signer, matching Python SDK functionality.

**Features:**
- Create limit orders with WASM
- Cancel orders
- Auth token generation
- Complete error handling
- Windows compatibility

**Usage:**
```bash
npm run example:create-cancel-order-wasm-comprehensive
```

**Best for**: Windows users, production order management, WASM signer validation

#### `create-market-order.ts` - Market Orders
**Purpose**: Demonstrates market order creation using SignerClient.

**Features:**
- Create market orders
- Automatic price execution
- Market order parameters
- Execution handling

**Usage:**
```bash
npm run example:create-market-order
```

**Best for**: Market order implementation, immediate execution strategies

### 🔄 Batch & Advanced Examples
Examples for advanced trading patterns and batch operations.

#### `send-tx-batch.ts` - Batch Transactions
**Purpose**: Demonstrates batch transaction functionality using SignerClient.

**Features:**
- Create multiple orders
- Send batch transactions
- Cancel and replace orders
- Batch operation management

**Usage:**
```bash
npm run example:send-tx-batch
```

**Best for**: High-frequency trading, batch operations, order management systems

#### `send-tx-batch-wasm.ts` - Windows Batch Transactions
**Purpose**: Batch transaction functionality using WASM signer for Windows compatibility.

**Features:**
- Batch transaction creation
- Multiple order management
- Order cancellation and replacement
- Nonce management
- Windows compatibility

**Usage:**
```bash
npm run example:send-tx-batch-wasm
```

**Best for**: Windows batch operations, high-frequency trading on Windows

### 🌐 WebSocket Examples
Examples for real-time data streaming and WebSocket connections.

#### `websocket.ts` - Basic WebSocket Usage
**Purpose**: Demonstrates WebSocket client usage for real-time data.

**Features:**
- Connect to WebSocket
- Subscribe to order book updates
- Subscribe to account updates
- Handle connection events
- Real-time data streaming

**Usage:**
```bash
npm run example:websocket
```

**Best for**: Real-time applications, live data monitoring, WebSocket integration

#### `websocket-sync.ts` - Advanced WebSocket Usage
**Purpose**: Demonstrates synchronous WebSocket usage with multiple subscriptions.

**Features:**
- Subscribe to multiple order books
- Subscribe to multiple accounts
- Handle connection lifecycle
- Multiple subscription management

**Usage:**
```bash
npm run example:websocket-sync
```

**Best for**: Multi-market monitoring, complex WebSocket applications

### 🪟 Windows WASM Signer Examples
Specialized examples for Windows compatibility using WASM signer.

#### `comprehensive-wasm-example.ts` - Complete WASM Functionality
**Purpose**: Comprehensive example demonstrating all Windows WASM signer functionality.

**Features:**
- Complete WASM signer initialization
- All order types (limit, market)
- Order management (create, cancel)
- API key generation
- Auth token creation
- Account and market data
- Error handling and validation
- Windows compatibility

**Usage:**
```bash
npm run example:comprehensive-wasm
```

**Best for**: Windows users, complete functionality demonstration, WASM signer validation

#### `test-wasm-signer.ts` - WASM Signer Testing
**Purpose**: Basic WASM signer test and validation.

**Features:**
- WASM initialization test
- Client validation
- Error handling demonstration
- Structure verification
- Basic functionality test

**Usage:**
```bash
npm run example:test-wasm-signer
```

**Best for**: WASM signer validation, debugging, initial testing

### 🔧 Server Integration Examples
Examples for integrating with external signer servers.

#### `create-cancel-order-with-server.ts` - Server Signer Integration
**Purpose**: Demonstrates order management using external signer server.

**Features:**
- External signer server integration
- Order creation and cancellation
- Server-based signing
- Alternative to WASM signer

**Usage:**
```bash
npm run example:create-cancel-order-with-server
```

**Best for**: Server-based architectures, external signing services

## Learning Path

### For Beginners
1. **Start with**: `api-only-example.ts` - Learn basic API usage
2. **Then try**: `get-info.ts` - Understand full API capabilities
3. **Next**: `create-cancel-order-demo.ts` - Learn transaction structure
4. **Finally**: `system-setup.ts` - Set up authentication

### For Windows Users
1. **Start with**: `test-wasm-signer.ts` - Validate WASM signer
2. **Then try**: `comprehensive-wasm-example.ts` - Complete functionality
3. **Next**: `system-setup-wasm.ts` - Set up account with WASM
4. **Finally**: `create-cancel-order-wasm-comprehensive.ts` - Full trading

### For Advanced Users
1. **Start with**: `send-tx-batch.ts` - Batch operations
2. **Then try**: `websocket-sync.ts` - Real-time data
3. **Next**: `comprehensive-wasm-example.ts` - Complete functionality
4. **Finally**: Build your own trading bot using patterns

## Configuration

Most examples use the testnet URL by default:
```
https://testnet.zklighter.elliot.ai
```

For mainnet, change the URL to:
```
https://mainnet.zklighter.elliot.ai
```

## Environment Variables

Some examples require environment variables. Create a `.env` file in the `lighter-ts` root directory:

1. Copy the example file:
```bash
cp env.example .env
```

2. Edit the `.env` file and add your values:
```bash
# Your API private key (required for examples that need authentication)
PRIVATE_KEY=your_actual_private_key_here

# Optional: Override the base URL for different environments
# BASE_URL=https://testnet.zklighter.elliot.ai
# BASE_URL=https://mainnet.zklighter.elliot.ai
```

**Note**: The `.env` file is automatically loaded by the examples using dotenv. Make sure to never commit your actual private key to version control.

## Features

The TypeScript SDK now provides **complete feature parity** with the Python SDK:

1. **Complete API Coverage**: All API endpoints from the Python SDK are available
2. **SignerClient**: Full order creation and transaction signing functionality
3. **WebSocket Support**: Real-time data streaming
4. **Cross-Platform**: Works on all platforms including **Windows with WASM signer**
5. **Type Safety**: Full TypeScript support with comprehensive type definitions
6. **Windows Compatibility**: WASM signer provides equivalent functionality to Python SDK

## 🪟 Windows Support

**Windows users** can now use the TypeScript SDK with full functionality:

- ✅ **WASM Signer**: Provides equivalent functionality to Python SDK on macOS/Linux
- ✅ **All Examples**: All examples work on Windows with WASM signer
- ✅ **Production Ready**: Fully functional for trading and API operations
- ✅ **Same Security**: Uses same cryptographic libraries as native signers

### Platform Comparison

| Platform | Python SDK | TypeScript SDK | WASM Signer |
|----------|------------|----------------|-------------|
| Windows  | ❌ Not supported | ✅ Supported | ✅ **Full Support** |
| macOS    | ✅ Native | ✅ Supported | ✅ Supported |
| Linux    | ✅ Native | ✅ Supported | ✅ Supported |
| Browser  | ❌ Not supported | ✅ Supported | ✅ Supported |

## API Coverage

The TypeScript SDK includes:

1. **AccountApi**: Account management and information
2. **OrderApi**: Order book and trading data
3. **TransactionApi**: Transaction management and history
4. **BlockApi**: Block information and current height
5. **CandlestickApi**: Price data and funding rates
6. **RootApi**: System information
7. **SignerClient**: Order creation and transaction signing
8. **WsClient**: Real-time WebSocket connections

## Contributing

When adding new examples:

1. Follow the existing naming convention
2. Include proper error handling
3. Add documentation in this README
4. Test on multiple platforms
5. Include TypeScript types where possible 