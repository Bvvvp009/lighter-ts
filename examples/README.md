# Lighter TypeScript SDK Examples

This directory contains examples demonstrating how to use the Lighter TypeScript SDK with **full Python SDK functionality** and **Windows WASM signer support**.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the SDK:
```bash
npm run build
```

3. Set up environment variables (for examples that need authentication):
```bash
npm run setup
```
This will create a `.env` file from the template. Edit it to add your actual values.

4. Run examples:
```bash
npm run example:api-only
```

## Examples

### `api-only-example.ts`
Demonstrates basic API usage without signing functionality. This example works on all platforms including Windows.

**Features:**
- Get root info
- Get orderbook data
- Get recent trades

**Usage:**
```bash
npm run example:api-only
```

### `get-info.ts`
Comprehensive example showing all available API endpoints.

**Features:**
- Account APIs
- Order APIs  
- Transaction APIs
- Block APIs
- Candlestick APIs

**Usage:**
```bash
npm run example:get-info
```

### `create-cancel-order.ts`
Demonstrates order creation and cancellation using the SignerClient.

**Features:**
- Create limit orders
- Cancel orders
- Authentication token generation

**Usage:**
```bash
npm run example:create-cancel-order
```

**Note:** This example requires a valid API private key. If you get "api key not found" error, you need to:
1. Run the system-setup example first to generate a valid API key
2. Update your `.env` file with the generated private key

### `create-cancel-order-demo.ts`
Demonstrates the transaction structure without requiring actual signing.

**Features:**
- Shows the correct transaction structure
- Demonstrates API call format
- No authentication required

**Usage:**
```bash
npm run example:create-cancel-order-demo
```

### `create-market-order.ts`
Demonstrates market order creation using the SignerClient.

**Features:**
- Create market orders
- Automatic price execution

**Usage:**
```bash
npm run example:create-market-order
```

### `system-setup.ts`
Demonstrates account setup and API key management using the SignerClient.

**Features:**
- Account verification
- API key generation
- API key management

**Usage:**
```bash
npm run example:system-setup
```

### `send-tx-batch.ts`
Demonstrates batch transaction functionality using the SignerClient.

**Features:**
- Create multiple orders
- Send batch transactions
- Cancel and replace orders

**Usage:**
```bash
npm run example:send-tx-batch
```

### `websocket.ts`
Demonstrates WebSocket client usage for real-time data.

**Features:**
- Connect to WebSocket
- Subscribe to order book updates
- Subscribe to account updates
- Handle connection events

**Usage:**
```bash
npm run example:websocket
```

### `websocket-sync.ts`
Demonstrates synchronous WebSocket usage with multiple subscriptions.

**Features:**
- Subscribe to multiple order books
- Subscribe to multiple accounts
- Handle connection lifecycle

**Usage:**
```bash
npm run example:websocket-sync
```

## 🪟 Windows WASM Signer Examples

The following examples demonstrate Windows WASM signer functionality, providing equivalent features to the Python SDK on Windows:

### `comprehensive-wasm-example.ts` ⭐ **NEW**
Comprehensive example demonstrating all Windows WASM signer functionality.

**Features:**
- Complete WASM signer initialization
- All order types (limit, market)
- Order management (create, cancel)
- API key generation
- Auth token creation
- Account and market data
- Error handling and validation

**Usage:**
```bash
npm run example:comprehensive-wasm
```

### `create-cancel-order-wasm-comprehensive.ts` ⭐ **NEW**
Matches Python SDK's `create_cancel_order.py` functionality using WASM signer.

**Features:**
- Create limit orders
- Cancel orders
- Auth token generation
- Complete error handling
- Windows compatibility

**Usage:**
```bash
npm run example:create-cancel-order-wasm-comprehensive
```

### `send-tx-batch-wasm.ts` ⭐ **NEW**
Matches Python SDK's `send_tx_batch.py` functionality using WASM signer.

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

### `system-setup-wasm.ts` ⭐ **NEW**
Matches Python SDK's `system_setup.py` functionality using WASM signer.

**Features:**
- Account verification
- API key generation
- Configuration output
- Windows compatibility

**Usage:**
```bash
npm run example:system-setup-wasm
```

### `test-wasm-signer.ts`
Basic WASM signer test and validation.

**Features:**
- WASM initialization test
- Client validation
- Error handling demonstration
- Structure verification

**Usage:**
```bash
npm run example:test-wasm-signer
```

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