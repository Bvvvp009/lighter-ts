# Getting Started with Lighter TypeScript SDK

Complete guide for beginners to start trading on Lighter Protocol using TypeScript.

## What is the Lighter TypeScript SDK?

The SDK gives you everything you need to trade perpetual futures on Lighter Protocol from your TypeScript/JavaScript applications. It uses a WASM signer for cryptographic operations.

**Key Features:**
- ✅ Uses a WASM signer for transaction signing
- ✅ Order creation (Market, Limit, TWAP)
- ✅ Stop-loss and take-profit orders
- ✅ Position management
- ✅ Transaction monitoring
- ✅ Error handling with automatic retries
- ✅ Account management

## Prerequisites

Before you start, you'll need:
1. **Node.js 16+** installed
2. **TypeScript 4.5+** (or JavaScript)
3. **A Lighter account** with USDC deposited
4. **Your API credentials** (generated in Lighter app)

## Installation

```bash
npm install lighter-ts-sdk
# or
yarn add lighter-ts-sdk
```

## Your First Trade in 5 Minutes

### Step 1: Get Your Credentials

You need three things:
- `ACCOUNT_INDEX` - Your Lighter account number
- `API_KEY_INDEX` - Which API key slot to use on that account
- `API_PRIVATE_KEY` - Your API private key

If this is your very first API key on a brand-new account, register it via the Lighter web app first — that gives you one working `API_PRIVATE_KEY`/`API_KEY_INDEX` pair to authenticate with.

Once you have at least one working key, you can generate and register **additional** key slots entirely from the SDK (no web app needed) via `examples/onboarding.ts` or `examples/system_setup.ts`, both of which use your existing `API_PRIVATE_KEY` plus your Ethereum wallet's `ETH_PRIVATE_KEY` (for the one-time L1 signature) to register a new key on-chain. Both scripts refuse to overwrite the key index you're currently authenticating with, so they're safe to run without risking your active credentials.

### Step 2: Create Environment File

Create a `.env` file in your project:

```bash
# Network: mainnet (default) | testnet | robinhood | robinhood-testnet
# Drives both the API/WS host and the signing chain_id.
LIGHTER_NETWORK=mainnet

# Your credentials from Lighter app
API_PRIVATE_KEY=0xabcdef123456789...
ACCOUNT_INDEX=1000
API_KEY_INDEX=0
```

The SDK runs on four chains that share the same Lighter core. Pick one with a single `LIGHTER_NETWORK` line in `.env` — the API host, WebSocket host, and signing chain_id all switch together. See the [Networks table](../README.md#step-1-set-up-your-environment) in the root README for the full host/chain_id breakdown and the L1-vs-L2 chain_id distinction.

### Step 3: Write Your First Trade

The SDK ships a ready-to-run version of this exact walkthrough — `npx tsx examples/quickstart.ts` creates a small limit order, waits for confirmation, and cancels it. Read on to build it yourself, or skip straight to running that file.

Create `my-first-trade.ts`:

```typescript
import { SignerClient, OrderType, resolveNetworkFromEnv } from 'lighter-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

async function myFirstTrade() {
  // Initialize client — `network` reads LIGHTER_NETWORK from .env (mainnet | testnet | robinhood)
  const signerClient = new SignerClient({
    network: resolveNetworkFromEnv(),
    privateKey: process.env.API_PRIVATE_KEY!,
    accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
    apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // Place a market order with SL/TP using OTOCO
    const result = await signerClient.createOtocoOrder({
      mainOrder: {
        marketIndex: 0,              // ETH market
        clientOrderIndex: Date.now(),
        baseAmount: 10000,          // 0.01 ETH (10000 / 1,000,000)
        isAsk: false,               // BUY
        orderType: OrderType.MARKET
      },
      // Automatic stop-loss at 5% loss
      stopLoss: {
        triggerPrice: 380000,     // $3800 (5% below $4000)
        isLimit: false
      },
      // Automatic take-profit at 5% gain
      takeProfit: {
        triggerPrice: 420000,     // $4200 (5% above $4000)
        isLimit: false
      }
    });

    // Check if order succeeded
    if (result.error || !result.hash) {
      console.error('❌ Order failed:', result.error);
      return;
    }

    console.log('✅ OTOCO order created!');
    console.log('✅ Entry, stop-loss, and take-profit orders grouped!');
    
    // Wait for confirmation
    await signerClient.waitForTransaction(result.hash, 30000);
    console.log('✅ Order confirmed on-chain!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await signerClient.close();
  }
}

myFirstTrade();
```

### Step 4: Run It

```bash
npx tsx my-first-trade.ts
```

You'll see output like:
```
✅ OTOCO order created!
✅ Entry, stop-loss, and take-profit orders grouped!
⏳ Waiting for confirmation...
✅ Order confirmed on-chain!
```

## Understanding the Code

### What Happens When You Run This?

1. **Initialization**: Creates a connection to Lighter Protocol
2. **Order Creation**: Creates your OTOCO grouped order (entry + SL + TP)
3. **Grouped Submission**: Sends all three orders together as one transaction
4. **Confirmation**: Waits for the transaction to be confirmed on-chain

### Breaking Down the Parameters

```typescript
marketIndex: 0              // Which market? 0 = ETH/USD
baseAmount: 10000           // How much? 0.01 ETH
isAsk: false               // Buy or sell? false = BUY, true = SELL
orderType: OrderType.MARKET // What type? MARKET = execute immediately
```

### Understanding Units

Lighter uses fixed decimal scaling:
- **Amounts**: 1 ETH = 1,000,000 units
  - 10,000 = 0.01 ETH
  - 100,000 = 0.1 ETH
  - 1,000,000 = 1 ETH
  
- **Prices**: $1 = 100 units
  - 400,000 = $4,000
  - 390,000 = $3,900
  - 410,000 = $4,100

### Understanding Stop-Loss and Take-Profit

When you set:
```typescript
stopLoss: { triggerPrice: 380000 }
takeProfit: { triggerPrice: 420000 }
```

Here's what happens:
- Your market order executes at ~$4000
- If price drops to $3800 → Stop-loss triggers (closes position)
- If price rises to $4200 → Take-profit triggers (closes position)

**Both SL and TP are automatically set to "reduce-only"** - they only close positions, never open new ones.

**Note**: TWAP orders execute gradually over time. For TWAP orders, create SL/TP separately after the TWAP begins executing.

## Common Operations

### Create a Limit Order

Instead of executing immediately, wait for the right price:

```typescript
const [tx, hash, error] = await signerClient.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 390000,           // LIMIT: Wait for $3900
  isAsk: false,
  orderType: OrderType.LIMIT,
  orderExpiry: Date.now() + (60 * 60 * 1000) // Expires in 1 hour
});

if (error || !hash) {
  console.error('Failed:', error);
  return;
}

await signerClient.waitForTransaction(hash);
```

**Difference from market order**:
- Market: Executes immediately at market price
- Limit: Executes only if price reaches your limit price

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
// Create a market order in opposite direction with reduceOnly
const [tx, hash, error] = await signerClient.createMarketOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,      // Position size to close
  avgExecutionPrice: 400000,
  isAsk: false,           // Opposite of your position
  reduceOnly: true        // IMPORTANT: Only closes, doesn't open
});

await signerClient.waitForTransaction(hash);
console.log('✅ Position closed');
```

### Check Your Orders

```typescript
import { ApiClient, OrderApi, resolveNetworkFromEnv } from 'lighter-ts-sdk';

const apiClient = new ApiClient({ host: resolveNetworkFromEnv().apiUrl });
const orderApi = new OrderApi(apiClient);

// Get your active orders (requires a signed auth token)
const auth = await signerClient.createAuthToken();
const orders = await orderApi.getAccountActiveOrders(
  parseInt(process.env.ACCOUNT_INDEX!),
  0, // Market 0
  auth
);

console.log(`You have ${orders.length} active orders:`);
orders.forEach(order => {
  console.log(`- Order ${order.order_index}: ${order.is_ask ? 'SELL' : 'BUY'} ${order.remaining_base_amount} @ ${order.price}`);
});
```

## Error Handling Best Practices

### Always Check for Errors

```typescript
// Check error field (tuple return)
const [tx, hash, error] = await signerClient.createOrder(params);
if (error || !hash) {
  console.error('Failed:', error);
  return;
}

// Check result object (OTOCO)
const result = await signerClient.createOtocoOrder(params);
if (result.error || !result.hash) {
  console.error('Failed:', result.error);
  return;
}

// Try-catch for unexpected errors
try {
  await signerClient.waitForTransaction(hash);
} catch (error) {
  console.error('Transaction failed:', error.message);
}
```

### Common Errors and How to Fix Them

**"Invalid nonce"**
- **Meaning**: Nonce cache is out of sync
- **Fix**: SDK auto-retries once, if it persists, restart your app

**"Transaction not found"**
- **Meaning**: Transaction is still pending
- **Fix**: Keep waiting (SDK polls automatically)

**"Invalid reduce only direction"**
- **Meaning**: Trying to create reduce-only order without position
- **Fix**: For limit orders, don't create SL/TP until order fills

**"Order expired"**
- **Meaning**: Order didn't execute before expiry
- **Fix**: Use longer expiry times or market orders

## Next Steps

### Try the Examples

All examples are in the `examples/` directory:

```bash
# Start with these
npx tsx examples/create_market_order.ts
npx tsx examples/create_limit_order.ts

# Then try these
npx tsx examples/cancel_order.ts
npx tsx examples/close_position.ts
```

### Read the Full Documentation

- **README.md** - Overview and quick start
- **examples/README.md** - Detailed examples guide
- **docs/SignerClient.md** - Complete API reference
- **docs/OrderApi.md** - Market data methods

### Build Your Trading Bot

Once you understand the basics:
1. Read market data
2. Analyze conditions
3. Create orders
4. Monitor positions
5. Manage risk with SL/TP

## Security Checklist

Before going live:

- [ ] Never commit `.env` files
- [ ] Test with small amounts first
- [ ] Use environment variables for all credentials
- [ ] Handle all errors properly
- [ ] Monitor all transactions
- [ ] Close resources when done
- [ ] Test thoroughly on testnet first

## Getting Help

- Check the examples in `examples/` directory
- Read error messages carefully - they're informative
- Review the API documentation in `docs/`
- Test with the system setup example first

## 📚 Further Reading

After mastering the basics, explore these comprehensive guides:

### [Transaction Monitoring Guide](./TransactionMonitoring.md)
Learn how to monitor transaction status across network states with:
- Understanding transaction status states (PENDING, QUEUED, COMMITTED, EXECUTED, FAILED, REJECTED)
- Using `waitForTransaction()` for blocking confirmation
- Advanced monitoring patterns (polling, fire-and-forget, batch tracking)
- Error handling and recovery strategies
- Production patterns for transaction queues

### [Margin Management Guide](./MarginManagement.md)
Master collateral management with:
- Cross-margin vs Isolated-margin modes
- Direction constants (ADD_COLLATERAL, REMOVE_COLLATERAL)
- Per-market collateral management
- Switching between margin modes
- Best practices and troubleshooting

### [API Reference](./API.md)
Complete API documentation with all methods and parameters.

### [SignerClient Documentation](./SignerClient.md)
Detailed reference for every SignerClient method and constant.

