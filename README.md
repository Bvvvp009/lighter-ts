# Lighter Protocol TypeScript SDK (Unofficial)

> **⚠️ Disclaimer**: This is an **unofficial** TypeScript SDK for Lighter Protocol, built by the community. It is not officially maintained by the Lighter Protocol team.

A complete TypeScript SDK for Lighter Protocol - trade perpetual futures with built-in stop-loss and take-profit orders, position management, and comprehensive error handling.

## 🔐 Signer Integration

This SDK uses the **official lighter-go WASM signer** from [elliottech/lighter-go](https://github.com/elliottech/lighter-go) for all cryptographic operations. The WASM signer is automatically compiled from the GitHub repository during the build process.

**Key Features:**
- ✅ Uses official lighter-go signer (reference implementation)
- ✅ Automatic error recovery and nonce management
- ✅ Support for all transaction types
- ✅ Multiple API key support
- ✅ Production-ready and battle-tested

## 📦 Installation

```bash
npm install lighter-ts-sdk
# or
yarn add lighter-ts-sdk
```

## 🚀 What Does This SDK Do?

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

  // Create a market order with SL/TP
  const result = await signerClient.createUnifiedOrder({
    marketIndex: 0,              // ETH market
    clientOrderIndex: Date.now(), // Unique ID
    baseAmount: 10000,           // 0.01 ETH (scaled: 1 ETH = 1,000,000)
    isAsk: false,                // BUY (true = SELL)
    orderType: OrderType.MARKET,
    
    // Slip page protection
    idealPrice: 400000,           // Ideal price ($4000)
    maxSlippage: 0.001,           // Max 0.1% slippage
    
    // Automatic stop-loss and take-profit
    stopLoss: {
      triggerPrice: 380000,       // Stop loss at $3800
      isLimit: false              // Market SL
    },
    takeProfit: {
      triggerPrice: 420000,       // Take profit at $4200
      isLimit: false              // Market TP
    }
  });

  // Check if order succeeded
  if (!result.success) {
    console.error('❌ Order failed:', result.mainOrder.error);
    return;
  }

  console.log('✅ Order created!');
  console.log('Main order hash:', result.mainOrder.hash);
  console.log('SL order hash:', result.stopLoss?.hash);
  console.log('TP order hash:', result.takeProfit?.hash);

  // Wait for transaction confirmation
  await signerClient.waitForTransaction(result.mainOrder.hash, 30000);
  
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

## 🔧 Common Operations

### Create a Market Order

```typescript
const result = await signerClient.createUnifiedOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,        // Amount (0.01 ETH)
  idealPrice: 400000,       // Your target price ($4000)
  maxSlippage: 0.001,       // 0.1% max slippage
  isAsk: false,             // BUY
  orderType: OrderType.MARKET
});

if (!result.success) {
  console.error('Failed:', result.mainOrder.error);
  return;
}
```

### Create a Limit Order

```typescript
const result = await signerClient.createUnifiedOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,        // Amount (0.01 ETH)
  price: 400000,            // Limit price ($4000)
  isAsk: false,             // BUY
  orderType: OrderType.LIMIT,
  orderExpiry: Date.now() + (60 * 60 * 1000) // Expires in 1 hour
});

// Wait for it to fill
if (result.success) {
  await signerClient.waitForTransaction(result.mainOrder.hash);
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
console.log('✅ Order cancelled');
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
console.log('✅ Position closed');
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
// Create a unified order (main order + SL/TP)
createUnifiedOrder(params) -> Promise<UnifiedOrderResult>

// Create a single order
createOrder(params) -> Promise<[txInfo, txHash, error]>

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

## 💡 Tips for Beginners

### 1. Always Use Environment Variables

```typescript
// ❌ DON'T hardcode credentials
const privateKey = '0xabc123...';

// ✅ DO use environment variables
const privateKey = process.env.API_PRIVATE_KEY;
```

### 2. Handle Errors Properly

```typescript
try {
  const result = await signerClient.createUnifiedOrder(params);
  
  if (!result.success) {
    console.error('Order failed:', result.mainOrder.error);
    return; // Exit early
  }
  
  // Success path
  console.log('Order created:', result.mainOrder.hash);
} catch (error) {
  console.error('Unexpected error:', error);
}
```

### 3. Check Transaction Status

```typescript
// Wait for transaction to be confirmed
try {
  await signerClient.waitForTransaction(txHash, 30000, 2000);
  console.log('✅ Transaction confirmed');
} catch (error) {
  console.error('❌ Transaction failed:', error.message);
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

## 📖 Examples

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

## 🔒 Security

- ✅ Never commit `.env` files
- ✅ Use environment variables for all credentials
- ✅ Test with small amounts first
- ✅ Monitor all transactions
- ✅ Use proper error handling

## 🔧 Building from Source

If you want to build the SDK from source or rebuild the WASM signer:

```bash
# Clone the repository
git clone https://github.com/bvvvp009/lighter-ts.git
cd lighter-ts

# Install dependencies
npm install

# Build WASM signer from lighter-go GitHub repo
npm run build:wasm

# Build TypeScript
npm run build
```

**Note**: The build script automatically clones/updates the lighter-go repository from GitHub and compiles the WASM signer. No local lighter-go folder is required.

## 🔄 Migration from Previous Versions

If you're upgrading from an older version that used `temp-lighter-go`:

### What Changed

- ✅ **Signer**: Now uses official `lighter-go` from GitHub instead of local `temp-lighter-go`
- ✅ **Build Process**: WASM is compiled directly from GitHub repo
- ✅ **Functions**: All transaction types now supported via lighter-go
- ✅ **Error Handling**: Improved error recovery and nonce management

### Breaking Changes

**None!** The API remains the same. The only change is internal - the SDK now uses the official lighter-go signer.

### Removed Functions

These functions were never officially supported and have been removed:
- `getPublicKey()` - Use `generateAPIKey()` instead (returns both keys)
- `switchAPIKey()` - Use `createClient()` with different `apiKeyIndex` values instead

### Migration Steps

1. **Update your code** (if using removed functions):
   ```typescript
   // Old (removed)
   const publicKey = await client.getPublicKey(privateKey);
   
   // New (use generateAPIKey)
   const { privateKey, publicKey } = await client.generateAPIKey();
   ```

2. **Rebuild WASM** (if building from source):
   ```bash
   npm run build:wasm
   ```

3. **Test your integration** - All existing code should work without changes.

## 📞 Getting Help

- Check the examples in `examples/` directory
- Read error messages carefully - they're informative
- Ensure environment variables are set correctly
- Start with `examples/create_market_order.ts`

## License

MIT License - see LICENSE file for details.
