# Lighter Protocol TypeScript SDK

A complete TypeScript SDK for Lighter Protocol - trade perpetual futures with built-in stop-loss and take-profit orders, position management, and comprehensive error handling.

## Status Overview

| Component | Status | Notes |
|-----------|--------|-------|
| **Node.js** | Supported | Ready for production use |
| **Browser (Chrome/Firefox/Safari)** | Supported | Uses Rust WASM in browser |
| **WASM Cryptography** | Verified | Optimized Rust WASM signer |
| **Documentation** | Complete | Setup guides included |

---

## Quick Navigation

- **[Get Started Quickly](#quick-start)** - 5 minutes (both Node.js & Browser)
- **[Node.js Setup](#nodejs-setup)** - Install, configure, and verify
- **[Browser Setup](#browser-setup)** - Vite, HTTP server, or Webpack
- **Testing** - Not included in release build
- **[Core Concepts](#-core-concepts)** - API reference and examples

---

## Signer Integration

This SDK uses **Rust WASM** for cryptographic signing operations, providing:

**Key Features:**
- **99% smaller binary size** (136 KB vs 13.5 MB)
- **7x faster initialization** (1.4 ms vs 10+ ms)
- **Optimized signatures** (0.67 ms per signature)
- **Production-ready** with verified mainnet transactions
- Support for all transaction types
- Multiple API key support
- Automatic error recovery and nonce management

### Rust WASM Performance

| Metric | Value |
|--------|-------|
| **Binary Size** | 136 KB |
| **Initialization** | ~1.4 ms |
| **Per Signature** | ~0.67 ms |
| **API Coverage** | 100% |

**Architecture**: The SDK uses a single **Rust WASM** signer for all cryptographic operations in both Node.js and Browser environments.

For detailed information, see [lighter-wasm/README.md](./lighter-wasm/README.md)

## Installation

```bash
npm install lighter-ts-sdk
# or
yarn add lighter-ts-sdk
```

## Quick Start

### Node.js (5 minutes)

```bash
# 1. Install
npm install lighter-ts-sdk

# 2. Create .env
echo "API_PRIVATE_KEY=your_key_here" > .env

# 3. Use
```

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const client = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: 0,
  apiKeyIndex: 0
});

await client.initialize();

// Create an order
const [tx, hash, error] = await client.createOrder({
  marketIndex: 0,
  baseAmount: 10000,
  isAsk: false
});

console.log(error ? 'Failed' : 'Order created:', hash);
```

### Browser (5 minutes)

```bash
# 1. Start WASM server
npm run serve:wasm

# 2. Create HTML
```

```html
<!DOCTYPE html>
<html>
<head><title>Trading</title></head>
<body>
  <h1>Trading with WASM</h1>
  <button onclick="signOrder()">Sign Order</button>

  <script type="module">
    import init, { SignerInstance } from 'http://localhost:8080/signer_wasm.js';
    
    await init('http://localhost:8080/signer_wasm_bg.wasm');
    
    window.signer = new SignerInstance('YOUR_PRIVATE_KEY');
    window.signOrder = () => {
      const sig = window.signer.signCreateOrder('{"action":"create_order"}');
      console.log('Signed:', sig);
    };
  </script>
</body>
</html>
```

---

## 🌐 Environment Setup Guide

### Node.js Setup

**1. Install the SDK**

```bash
npm install lighter-ts-sdk
```

**2. Create `.env` file**

```bash
cp .env.example .env
```

Then edit `.env` with your values:

```bash
API_PRIVATE_KEY=your_80_character_hex_private_key
ACCOUNT_INDEX=0
API_KEY_INDEX=0
BASE_URL=https://mainnet.zklighter.elliot.ai
```

**3. Initialize the client**

```typescript
import { SignerClient } from 'lighter-ts-sdk';
import dotenv from 'dotenv';

dotenv.config();

const signerClient = new SignerClient({
  url: process.env.BASE_URL!,
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
  apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
});

// Initialize WASM signer (required for cryptographic operations)
await signerClient.initialize();
await signerClient.ensureWasmClient();

console.log('Client initialized with WASM signer');
```

**4. Use the client**

```typescript
// Create an order
const [tx, hash, error] = await signerClient.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  isAsk: false
});

if (!error) {
  console.log('Order created:', hash);
  await signerClient.waitForTransaction(hash);
}
```

**WASM in Node.js:**
- Location: `wasm/rust-nodejs/`
- Automatically initialized when using `SignerClient`
- Direct access: `require('./wasm/rust-nodejs/signer_wasm.js')`

---

### Browser Setup

**Option 1: Using Vite/React/Vue**

```bash
# 1. Create your frontend app
npm create vite@latest my-app -- --template react
cd my-app
npm install

# 2. Copy WASM files
cp -r node_modules/lighter-ts-sdk/wasm/rust-web public/wasm

# 3. Create your trading component
```

```typescript
// src/pages/Trade.tsx
import { useEffect, useState } from 'react';

export function Trade() {
  const [signer, setSigner] = useState<any>(null);
  const [publicKey, setPublicKey] = useState<string>('');

  useEffect(() => {
    async function initWasm() {
      // Load WASM module
      const wasmModule = await import('/wasm/signer_wasm.js');
      
      // Initialize WASM
      await wasmModule.default('/wasm/signer_wasm_bg.wasm');
      
      // Create signer instance
      const signerInstance = new wasmModule.SignerInstance(
        process.env.REACT_APP_PRIVATE_KEY!
      );
      
      setSigner(signerInstance);
      setPublicKey(signerInstance.getPublicKey());
    }

    initWasm().catch(console.error);
  }, []);

  const signOrder = () => {
    if (!signer) return;
    
    const orderData = {
      action: 'create_order',
      symbol: 'BTC-USD',
      side: 'BUY',
      quantity: 1,
      timestamp: Date.now()
    };
    
    const signature = signer.signCreateOrder(JSON.stringify(orderData));
    console.log('Order signed:', signature);
  };

  return (
    <div>
      <h1>Trading App</h1>
      <p>Account: {publicKey?.substring(0, 20)}...</p>
      <button onClick={signOrder}>Sign Order</button>
    </div>
  );
}
```

**4. Serve with `vite` (has correct MIME types)**

```bash
npm run dev
```

---

**Option 2: Manual HTTP Server**

```bash
# Start the included HTTP server
npm run serve:wasm

# Output:
# WASM HTTP Server
#    Server: http://localhost:8080
#    WASM Directory: .../wasm/rust-web
```

Then load in your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Trading App</title>
</head>
<body>
  <h1>Trading with WASM</h1>
  <div id="status">Loading WASM...</div>
  <div id="account">Account: -</div>
  <button onclick="signOrder()">Sign Order</button>

  <script type="module">
    import init, { SignerInstance } from 'http://localhost:8080/signer_wasm.js';

    // Initialize WASM
    await init('http://localhost:8080/signer_wasm_bg.wasm');

    // Create signer
    window.signer = new SignerInstance('YOUR_80_HEX_PRIVATE_KEY');
    const publicKey = window.signer.getPublicKey();

    document.getElementById('status').textContent = 'WASM Ready';
    document.getElementById('account').textContent = `Account: ${publicKey.substring(0, 20)}...`;

    window.signOrder = function() {
      const orderData = {
        action: 'create_order',
        symbol: 'BTC-USD',
        side: 'BUY',
        quantity: 1,
        timestamp: Date.now()
      };
      
      const signature = window.signer.signCreateOrder(JSON.stringify(orderData));
      console.log('Signed:', signature);
      alert('Order signed! Check console.');
    };
  </script>
</body>
</html>
```

**Option 3: Using Webpack/Rollup**

1. Copy `wasm/rust-web/` to your public assets
2. Configure your bundler to handle `.wasm` files:

```javascript
// webpack.config.js
module.exports = {
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'webassembly/async',
      },
    ],
  },
};
```

**WASM in Browser:**
- Location: `wasm/rust-web/`
- Must be served over HTTP (not file://)
- Server must send `Content-Type: application/wasm`
- Direct WASM file: `signer_wasm_bg.wasm`
- JS bindings: `signer_wasm.js`
- TypeScript definitions: `signer_wasm.d.ts`

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| **"Cannot load WASM from file://"** | Use HTTP server: `npm run serve:wasm` |
| **"WASM not found 404"** | Verify `wasm/rust-web/` exists; run `npm run build:wasm` |
| **"Wrong MIME type"** | Ensure server sends `Content-Type: application/wasm` for `.wasm` files |
| **Import errors in browser** | Use correct import paths; check module exports |
| **Signature mismatch** | Ensure same private key used in both environments |
## What Does This SDK Do?

The Lighter TypeScript SDK provides everything you need to:
- **Trade perpetual futures** on Lighter Protocol
- **Create orders** (Market, Limit, TWAP) with automatic SL/TP
- **Manage positions** (open, close, update leverage)
- **Transfer funds** between accounts
- **Monitor transactions** with built-in status tracking
- **Handle errors** automatically with retry logic

## 🎯 Getting Started

### Step 1: Set Up Your Environment

Create a `.env` file in your project root:

```bash
# Required credentials
API_PRIVATE_KEY=your_private_key_here
ACCOUNT_INDEX=0
API_KEY_INDEX=0
BASE_URL=https://mainnet.zklighter.elliot.ai

# Optional: for specific examples
MARKET_ID=0
SUB_ACCOUNT_INDEX=1
DEPOSIT_AMOUNT=1
```

### Step 2: Install the SDK

```bash
npm install lighter-ts-sdk
```

### Step 3: Your First Trade

```typescript
import { SignerClient, OrderType } from 'lighter-ts-sdk';
import dotenv from 'dotenv';

dotenv.config();

async function placeOrder() {
  // Initialize the client
  const signerClient = new SignerClient({
    url: process.env.BASE_URL!,
    privateKey: process.env.API_PRIVATE_KEY!,
    accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
    apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
  });

  // Initialize WASM signer (required)
  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  // Create an order
  const result = await signerClient.createOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 10000,
    isAsk: false,
    orderType: OrderType.MARKET
  });

  // Check if order succeeded
  if (result[2]) {
    console.error('Order failed:', result[2]);
    return;
  }

  console.log('Order created');
  console.log('Order hash:', result[1]);

  // Wait for transaction confirmation
  await signerClient.waitForTransaction(result[1], 30000);
  
  await signerClient.close();
}

placeOrder().catch(console.error);
```

## 📚 Core Concepts

### Understanding Price Units

Lighter uses fixed decimal scaling:
- **ETH amounts**: 1 ETH = 1,000,000 units
- **Prices**: $1 = 100 units

```typescript
// To buy 0.01 ETH at $4000:
baseAmount: 10000        // 0.01 ETH (10,000 / 1,000,000)
price: 400000           // $4000 (400,000 / 100)
```

### Order Types

```typescript
OrderType.MARKET    // Executes immediately at market price
OrderType.LIMIT     // Executes at your specified price
OrderType.TWAP      // Executes gradually over time
```

### Direction (isAsk)

```typescript
isAsk: false  // BUY - You're buying ETH
isAsk: true   // SELL - You're selling ETH
```

### Stop-Loss and Take-Profit

SL/TP orders are **automatically reduce-only** - they only close positions:

```typescript
stopLoss: {
  triggerPrice: 380000,  // When price hits this, close position
  isLimit: false         // false = market SL, true = limit SL
},
takeProfit: {
  triggerPrice: 420000,  // When price hits this, take profit
  isLimit: false         // false = market TP, true = limit TP
}
```

**Important**: SL/TP orders require an existing position. For Market orders, this works immediately. For Limit orders, SL/TP are created in the same batch.

**Note for TWAP orders**: TWAP orders execute over time, creating positions gradually. SL/TP cannot be created in the same batch as TWAP orders. You should create SL/TP orders separately after the TWAP has started creating positions.

## Common Operations

### Create a Market Order

```typescript
const [tx, hash, error] = await signerClient.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  isAsk: false,
  orderType: OrderType.MARKET
});

if (error) {
  console.error('Failed:', error);
  return;
}
```

### Create a Limit Order

```typescript
const [tx, hash, error] = await signerClient.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 400000,
  isAsk: false,
  orderType: OrderType.LIMIT,
  orderExpiry: Date.now() + (60 * 60 * 1000)
});

if (!error) {
  await signerClient.waitForTransaction(hash);
}
```

### Cancel an Order

```typescript
const [tx, hash, error] = await signerClient.cancelOrder({
  marketIndex: 0,
  orderIndex: 12345  // Your order's index
});

if (error) {
  console.error('Cancel failed:', error);
  return;
}

await signerClient.waitForTransaction(hash);
console.log('Order cancelled');
```

### Close a Position

```typescript
const [tx, hash, error] = await signerClient.createMarketOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,        // Position size to close
  avgExecutionPrice: 400000,
  isAsk: false,              // Opposite of position
  reduceOnly: true          // IMPORTANT: Only closes, doesn't open new
});

if (error) {
  console.error('Close failed:', error);
  return;
}

await signerClient.waitForTransaction(hash);
console.log('Position closed');
```

### Check Order Status

```typescript
const status = await signerClient.getTransaction(txHash);
console.log('Status:', status.status); // 0=pending, 1=queued, 2=committed, 3=executed
```

## 🛠️ API Reference

### SignerClient Methods

#### Order Management
```typescript
// Create a single order
createOrder(params) -> Promise<[txInfo, txHash, error]>

// Create multiple orders (OTOCO, OTOMA, or OTOTCO grouping)
createGroupedOrders(groupingType, orders) -> Promise<[txInfo, txHash, error]>

// Cancel a specific order
cancelOrder(params) -> Promise<[txInfo, txHash, error]>

// Cancel all orders
cancelAllOrders(timeInForce, time) -> Promise<[txInfo, txHash, error]>
```

#### Position Management
```typescript
// Close specific position
createMarketOrder({ reduceOnly: true }) -> Promise<[txInfo, txHash, error]>

// Close all positions
closeAllPositions() -> Promise<[txs[], responses[], errors[]]>
```

#### Transaction Monitoring
```typescript
// Get transaction details
getTransaction(txHash) -> Promise<Transaction>

// Wait for transaction (with timeout)
waitForTransaction(txHash, maxWaitTime, pollInterval) -> Promise<Transaction>
```

### Order Parameters

```typescript
interface UnifiedOrderParams {
  marketIndex: number;           // Market ID (0 = ETH)
  clientOrderIndex: number;       // Unique ID (use Date.now())
  baseAmount: number;             // Amount in units (1 ETH = 1,000,000)
  isAsk: boolean;                 // true = SELL, false = BUY
  orderType: OrderType;           // MARKET, LIMIT, or TWAP
  
  // For market orders
  idealPrice?: number;            // Target price
  maxSlippage?: number;           // Max slippage (e.g., 0.001 = 0.1%)
  
  // For limit orders
  price?: number;                 // Limit price
  
  // Optional SL/TP (automatically reduce-only)
  stopLoss?: {
    triggerPrice: number;
    isLimit?: boolean;
  };
  takeProfit?: {
    triggerPrice: number;
    isLimit?: boolean;
  };
  
  // Optional
  orderExpiry?: number;           // Expiry timestamp (milliseconds)
}
```

## Tips for Beginners

### 1. Always Use Environment Variables

```typescript
// Do not hardcode credentials
const privateKey = '0xabc123...';

// Use environment variables
const privateKey = process.env.API_PRIVATE_KEY;
```

### 2. Handle Errors Properly

```typescript
try {
  const [tx, hash, error] = await signerClient.createOrder(params);
  
  if (error) {
    console.error('Order failed:', error);
    return; // Exit early
  }
  
  // Success path
  console.log('Order created:', 
```

### 3. Check Transaction Status

```typescript
// Wait for transaction to be confirmed
try {
  await signerClient.waitForTransaction(txHash, 30000, 2000);
  console.log('Transaction confirmed');
} catch (error) {
  console.error('Transaction failed:', error.message);
}
```

### 4. Close Resources

```typescript
try {
  // ... use signerClient
} finally {
  await signerClient.close(); // Always close when done
}
```

## Examples

The `examples/` directory contains working examples for every feature:

```bash
# Run examples
npx ts-node examples/create_market_order.ts   # Market order with SL/TP
npx ts-node examples/create_limit_order.ts     # Limit order with SL/TP
npx ts-node examples/cancel_order.ts           # Cancel orders
npx ts-node examples/close_position.ts         # Close positions
npx ts-node examples/deposit_to_subaccount.ts  # Fund transfers
```

## 🎓 Learning Path

1. **Start Here**: `examples/create_market_order.ts` - Simplest order creation
2. **Next**: `examples/create_limit_order.ts` - Learn about limit orders
3. **Then**: `examples/cancel_order.ts` - Learn about order management
4. **Advanced**: `examples/send_tx_batch.ts` - Batch transactions

## Security

- Never commit `.env` files
- Use environment variables for all credentials
- Test with small amounts first
- Monitor all transactions
- Use proper error handling

## Building from Source

If you want to build the SDK from source or rebuild the WASM signer:

```bash
# Clone the repository
git clone https://github.com/bvvvp009/lighter-ts.git
cd lighter-ts

# Install dependencies
npm install

# Build WASM signer
npm run build:wasm

# Build TypeScript
npm run build
```

**Note**: The build script compiles the Rust WASM signer from local source if present.

## Migration from Previous Versions

If you are upgrading from an older release, review the change log and update any removed or renamed methods. Most integrations should not require code changes.

## WASM Build System

The SDK uses **Rust WebAssembly** for cryptographic operations. Pre-compiled binaries are included in the npm package, so you don’t need to build anything unless you want to modify the signer.

### Quick Build Commands
```bash
# Show all WASM commands
npm run wasm:info

# Build from Rust source
npm run build:wasm

# Verify WASM functionality
npm run verify:wasm
```

### Notes
- Prebuilt WASM binaries are included in `wasm/` for normal usage.
- To build from source, you must provide the Rust signer source at `lighter-rust/signer-wasm/` (e.g., as a submodule or vendor copy).

## Getting Help

- Check the examples in `examples/` directory
- Read error messages carefully - they're informative
- Ensure environment variables are set correctly
- Start with `examples/create_market_order.ts`
 

## License

MIT License - see LICENSE file for details.
