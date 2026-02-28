# Lighter Protocol TypeScript SDK

A complete TypeScript SDK for Lighter Protocol - trade perpetual futures with built-in stop-loss and take-profit orders, position management, and comprehensive error handling.

## 🔐 Signer Integration

This SDK uses a WASM signer for cryptographic operations. The signer is compiled during the build process.

**Key Features:**
- ✅ Uses a WASM signer for transaction signing
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
- **Trade perpetual futures and SPOT Markets** on Lighter Protocol
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

  // Create a market order with SL/TP using OTOCO
  const result = await signerClient.createOtocoOrder({
    mainOrder: {
      marketIndex: 0,              // ETH market
      clientOrderIndex: Date.now(), // Unique ID
      baseAmount: 10000,           // 0.01 ETH (scaled: 1 ETH = 1,000,000)
      isAsk: false,                // BUY (true = SELL)
      orderType: OrderType.MARKET,
      
      // Slippage protection
      idealPrice: 400000,           // Ideal price ($4000)
      maxSlippage: 0.001           // Max 0.1% slippage
    },
    // Automatic stop-loss
    stopLoss: {
      triggerPrice: 380000,       // Stop loss at $3800
      isLimit: false              // Market SL
    },
    // Automatic take-profit
    takeProfit: {
      triggerPrice: 420000,       // Take profit at $4200
      isLimit: false              // Market TP
    }
  });

  // Check if order succeeded
  if (result.error || !result.hash) {
    console.error('❌ Order failed:', result.error);
    return;
  }

  console.log('✅ OTOCO order created!');
  console.log('Grouped order hash:', result.hash);

  // Wait for transaction confirmation
  await signerClient.waitForTransaction(result.hash, 30000);
  
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

## 🌐 Network-Aware Transaction Status Monitoring

Lighter Protocol transactions go through multiple network states. Use `waitForTransaction()` to monitor status changes with automatic error handling and recovery:

```typescript
// Transaction status constants
enum TransactionStatus {
  PENDING = 0,        // Initial state, not yet queued
  QUEUED = 1,         // Queued for processing
  COMMITTED = 2,      // Committed to block
  EXECUTED = 3,       // Successfully executed
  FAILED = 4,         // Execution failed
  REJECTED = 5        // Transaction rejected
}

// Monitor transaction with built-in retry logic
try {
  const txResult = await signerClient.waitForTransaction(
    txHash,
    30000,  // maxWaitTime: wait up to 30 seconds
    2000    // pollInterval: check status every 2 seconds
  );
  
  console.log('Status:', txResult.status);  // Will be EXECUTED (3) if successful
  console.log('✅ Transaction confirmed on-chain');
} catch (error) {
  // Error handling is centralized here
  if (error.message.includes('timeout')) {
    console.error('❌ Transaction didn\'t confirm within timeout');
  } else if (error.message.includes('FAILED') || error.message.includes('REJECTED')) {
    console.error('❌ Transaction failed:', error.message);
  } else {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Advanced: Manual status polling for fine-grained control
const checkStatus = async (hash: string) => {
  const txResult = await signerClient.getTransaction(hash);
  
  switch (txResult.status) {
    case SignerClient.TX_STATUS_PENDING:
      console.log('⏳ Still pending...');
      break;
    case SignerClient.TX_STATUS_QUEUED:
      console.log('📋 Queued for processing');
      break;
    case SignerClient.TX_STATUS_COMMITTED:
      console.log('✍️ Committed to block');
      break;
    case SignerClient.TX_STATUS_EXECUTED:
      console.log('✅ Transaction executed successfully');
      break;
    case SignerClient.TX_STATUS_FAILED:
      console.error('❌ Transaction execution failed');
      break;
    case SignerClient.TX_STATUS_REJECTED:
      console.error('❌ Transaction was rejected');
      break;
  }
  
  return txResult;
};

// Pattern: Fire-and-forget with error handling
const result = await signerClient.createOrder(orderParams);
if (result.hash) {
  // Schedule async confirmation check (don't block)
  signerClient.waitForTransaction(result.hash, 60000).catch(err => {
    console.error('Transaction confirmation failed:', err);
    // Handle error (alert user, retry, etc.)
  });
}
```

**Key Points:**
- `waitForTransaction()` centralizes error handling and automatic retries
- No need to parse transaction status manually after wait
- Throw errors are detected and propagated with context
- Use timeout to prevent indefinite waits in production systems

## 💰 Margin Management with Direction Constants

Lighter Protocol supports both cross-margin and isolated-margin modes. Margin direction constants determine whether you're adding or removing collateral:

### Margin Mode Constants

```typescript
// Margin mode
SignerClient.CROSS_MARGIN_MODE = 0      // Shared collateral across markets
SignerClient.ISOLATED_MARGIN_MODE = 1   // Per-market collateral

// Margin direction (when updating isolated margin)
SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL = 0  // Remove collateral from position
SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL = 1     // Add collateral to position
```

### Adding Margin (Collateral) to Isolated Position

```typescript
// Add 100 USDC collateral to ETH position in isolated mode
const [marginInfo, txHash, error] = await signerClient.updateMargin(
  0,      // marketIndex: 0 = ETH/USDC
  100,    // usdcAmount: 100 USDC to add
  SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL  // direction: 1
);

if (error) {
  console.error('Failed to add margin:', error);
} else {
  console.log('✅ Margin added:', txHash);
  
  // Wait for confirmation
  await signerClient.waitForTransaction(txHash, 30000);
  console.log('✅ Margin update confirmed');
}
```

### Removing Margin (Collateral) from Isolated Position

```typescript
// Remove 50 USDC collateral from ETH position
const [marginInfo, txHash, error] = await signerClient.updateMargin(
  0,      // marketIndex: 0 = ETH/USDC
  50,     // usdcAmount: 50 USDC to remove
  SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL  // direction: 0
);

if (error) {
  console.error('Failed to remove margin:', error);
} else {
  console.log('✅ Margin removed:', txHash);
  
  // Wait for confirmation
  await signerClient.waitForTransaction(txHash, 30000);
  console.log('✅ Margin removal confirmed');
}
```

### Cross-Margin vs Isolated-Margin Workflows

```typescript
// === CROSS-MARGIN MODE ===
// Step 1: Update leverage to cross-margin
const [crossInfo1, crossHash1, crossErr1] = await signerClient.updateLeverage(
  0,  // marketIndex
  SignerClient.CROSS_MARGIN_MODE,  // mode: 0
  5   // leverage: 5x
);

// Step 2: Create order (no margin updates needed - uses account balance)
const result = await signerClient.createMarketOrder({
  marketIndex: 0,
  baseAmount: 10000,
  isAsk: false
});

// === ISOLATED-MARGIN MODE ===
// Step 1: Update leverage to isolated-margin
const [isolatedInfo1, isolatedHash1, isolatedErr1] = await signerClient.updateLeverage(
  0,  // marketIndex
  SignerClient.ISOLATED_MARGIN_MODE,  // mode: 1
  20  // leverage: 20x (IMF = 10000/20 = 500)
);

// Step 2: Create order
const result = await signerClient.createMarketOrder({
  marketIndex: 0,
  baseAmount: 10000,
  isAsk: false
});

// Step 3: Manage collateral dynamically
// Add more collateral if position grows risky
await signerClient.updateMargin(
  0,
  200,  // Add 200 USDC
  SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL
);

// Remove collateral if position has buffer
await signerClient.updateMargin(
  0,
  100,  // Remove 100 USDC
  SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL
);
```

**Important:** 
- Cross-margin pools collateral across all markets
- Isolated margin requires explicit collateral management per-market
- `direction` parameter is only used for isolated-margin positions
- Always verify sufficient collateral before removing it

## �🔧 Common Operations

### Create a Market Order

```typescript
const [tx, hash, error] = await signerClient.createMarketOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,        // Amount (0.01 ETH)
  avgExecutionPrice: 400000, // Max execution price ($4000)
  isAsk: false              // BUY
});

if (error || !hash) {
  console.error('Failed:', error);
  return;
}
```

### Create a Limit Order

```typescript
const [tx, hash, error] = await signerClient.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,        // Amount (0.01 ETH)
  price: 400000,            // Limit price ($4000)
  isAsk: false,             // BUY
  orderType: OrderType.LIMIT,
  orderExpiry: Date.now() + (60 * 60 * 1000) // Expires in 1 hour
});

if (error || !hash) {
  console.error('Failed:', error);
  return;
}

// Wait for it to fill
await signerClient.waitForTransaction(hash);
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
// Create an OTOCO order (entry + SL + TP)
createOtocoOrder(params) -> Promise<{ tx, hash, error }>

// Create an OCO order (one cancels other)
createOcoOrder(params) -> Promise<{ tx, hash, error }>

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
// For OTOCO orders (entry + SL/TP)
interface OtocoOrderParams {
  mainOrder: {
    marketIndex: number;         // Market ID (0 = ETH)
    baseAmount: number;          // Amount in units
    isAsk: boolean;              // true = SELL, false = BUY
    orderType: OrderType.LIMIT | OrderType.MARKET;
    price?: number;              // For LIMIT orders
    avgExecutionPrice?: number;  // For MARKET orders
    maxSlippage?: number;        // Max slippage (0.001 = 0.1%)
    idealPrice?: number;         // Target price
  };
  stopLoss: {
    triggerPrice: number;
    price?: number;
    isLimit?: boolean;
  };
  takeProfit: {
    triggerPrice: number;
    price?: number;
    isLimit?: boolean;
  };
  nonce?: number;
}

// For single orders
interface CreateOrderParams {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: number;
  price: number;
  isAsk: boolean;
  orderType?: OrderType;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
  orderExpiry?: number;
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
  const [tx, hash, error] = await signerClient.createOrder(params);
  
  if (error || !hash) {
    console.error('Order failed:', error);
    return; // Exit early
  }
  
  // Success path
  console.log('Order created:', hash);
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
npx tsx examples/create_market_order.ts   # Market order with SL/TP
npx tsx examples/create_limit_order.ts     # Limit order with SL/TP
npx tsx examples/cancel_order.ts           # Cancel orders
npx tsx examples/close_position.ts         # Close positions
npx tsx examples/deposit_to_subaccount.ts  # Fund transfers
```

## 🎓 Learning Path

1. **Start Here**: `examples/create_market_order.ts` - Simplest order creation
2. **Next**: `examples/create_limit_order.ts` - Learn about limit orders
3. **Then**: `examples/cancel_order.ts` - Learn about order management
4. **Advanced**: `examples/send_tx_batch.ts` - Batch transactions

## ✅ Live Executed Transactions (Testnet)

The SDK has been thoroughly tested with real transactions on Lighter Protocol testnet. Here are verified transaction hashes from live example execution:

### Real Transaction Examples

**1. Market Order with OTOCO (SL/TP)**
```
Transaction Hash: c622140d6d15760bbf5462e3f472a97b0eac8fb138becc00cb7ce24b223c19e352fe7e15098337c5
Example: examples/create_market_order.ts
Details: 60 ETH order with $2800 SL / $3100 TP
Status: ✅ Submitted to testnet
```

**2. Limit Order with Grouping**
```
Transaction Hash: 4349b469fa8d71161fc012a9d3224e1f4eda355527e91e83bb193ab9345bc19bfba22d7ab64721d1
Example: examples/create_limit_order.ts
Details: Limit entry with automatic SL/TP attachment
Status: ✅ Submitted to testnet
```

**3. Market Order with Max Slippage (1%)**
```
Transaction Hash: f1d2ab2ca65f77310502298961c6e738e21a2b9f2e8e4614a75d2bbf5a4168d225bec7708675cdca
Example: examples/create_market_order_max_slippage.ts
Details: Market order with 1% slippage protection
Status: ✅ Submitted to testnet
```

**4. IOC Order with Attached SL/TP**
```
Transaction Hash: 1d64b0bab34e2469a190558e53d13c8614ebd5075d4ed2eca079aab551a259b92343ad1c5d1fbed8
Example: examples/create_grouped_ioc_with_attached_sl_tp.ts
Details: Immediate-or-cancel with grouped exits
Status: ✅ Submitted to testnet
```

### Running Your Own Transactions

To execute transactions yourself:

```typescript
// All credentials loaded from .env
const signerClient = new SignerClient({
  url: process.env.BASE_URL!,
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
  apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
});

await signerClient.initialize();
await signerClient.ensureWasmClient();

// Create your order (any example will generate a real hash)
const result = await signerClient.createMarketOrder({...});
console.log('Your transaction hash:', result.hash);
```

All example files in `examples/` directory will generate valid transaction hashes when run with proper credentials.

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

# Build WASM signer assets
npm run build:wasm

# Build TypeScript
npm run build
```

**Note**: The build script automatically prepares and compiles WASM signer assets. No extra local signer repository is required.

## 🔄 Migration from Previous Versions

If you're upgrading from an older version that used `temp-lighter-go`:

### What Changed

- ✅ **Signer**: Uses the current WASM signer workflow instead of local `temp-lighter-go`
- ✅ **Build Process**: WASM is compiled directly from GitHub repo
- ✅ **Functions**: All transaction types are supported by the WASM signer flow
- ✅ **Error Handling**: Improved error recovery and nonce management

### Breaking Changes

**None!** The API remains the same. The change is internal to signer implementation.

### Removed Functions

These functions are no longer supported and have been removed:
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
