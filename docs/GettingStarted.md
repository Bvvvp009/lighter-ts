# Getting Started with Lighter TypeScript SDK

Complete guide for beginners to start trading on Lighter Protocol using TypeScript.

## What is the Lighter TypeScript SDK?

The SDK gives you everything you need to trade perpetual futures on Lighter Protocol from your TypeScript/JavaScript applications. It uses the **official lighter-go WASM signer** from [elliottech/lighter-go](https://github.com/elliottech/lighter-go) for all cryptographic operations.

**Key Features:**
- ✅ Uses official lighter-go signer (reference implementation)
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

You need three things from your Lighter account:
- `ACCOUNT_INDEX` - Your account number
- `API_KEY_INDEX` - Which API key to use (usually 0)
- `API_PRIVATE_KEY` - Your API private key (get from Lighter app)

### Step 2: Create Environment File

Create a `.env` file in your project:

```bash
# Base URL for API
BASE_URL=https://mainnet.zklighter.elliot.ai

# Your credentials from Lighter app
API_PRIVATE_KEY=0xabcdef123456789...
ACCOUNT_INDEX=1000
API_KEY_INDEX=0
```

### Step 3: Write Your First Trade

Create `my-first-trade.ts`:

```typescript
import { SignerClient, OrderType } from 'lighter-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

async function myFirstTrade() {
  // Initialize client
  const signerClient = new SignerClient({
    url: process.env.BASE_URL!,
    privateKey: process.env.API_PRIVATE_KEY!,
    accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
    apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // Place a market order
    const result = await signerClient.createUnifiedOrder({
      marketIndex: 0,              // ETH market
      clientOrderIndex: Date.now(),
      baseAmount: 10000,          // 0.01 ETH (10000 / 1,000,000)
      isAsk: false,               // BUY
      orderType: OrderType.MARKET,
      
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
    if (!result.success) {
      console.error('❌ Order failed:', result.mainOrder.error);
      return;
    }

    console.log('✅ Main order created!');
    console.log('✅ Stop-loss created!');
    console.log('✅ Take-profit created!');
    
    // Wait for confirmation
    await signerClient.waitForTransaction(result.mainOrder.hash, 30000);
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
npx ts-node my-first-trade.ts
```

You'll see output like:
```
✅ Main order created!
✅ Stop-loss created!
✅ Take-profit created!
⏳ Waiting for confirmation...
✅ Order confirmed on-chain!
```

## Understanding the Code

### What Happens When You Run This?

1. **Initialization**: Creates a connection to Lighter Protocol
2. **Order Creation**: Creates your market order
3. **SL/TP Setup**: Automatically creates stop-loss and take-profit orders
4. **Batch Submission**: Sends all three orders together as one transaction
5. **Confirmation**: Waits for the transaction to be confirmed on-chain

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

**Note**: For TWAP orders, which execute gradually over time, SL/TP cannot be created in the same batch. Create SL/TP separately after the TWAP begins executing.

## Common Operations

### Create a Limit Order

Instead of executing immediately, wait for the right price:

```typescript
const result = await signerClient.createUnifiedOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 390000,           // LIMIT: Wait for $3900
  isAsk: false,
  orderType: OrderType.LIMIT,
  orderExpiry: Date.now() + (60 * 60 * 1000) // Expires in 1 hour
});
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
const apiClient = new ApiClient({ host: process.env.BASE_URL });
const orderApi = new OrderApi(apiClient);

// Get your active orders
const orders = await orderApi.getAccountActiveOrders(
  parseInt(process.env.ACCOUNT_INDEX!),
  0  // Market 0
);

console.log(`You have ${orders.length} active orders:`);
orders.forEach(order => {
  console.log(`- Order ${order.id}: ${order.side} ${order.size} @ ${order.price}`);
});
```

## Error Handling Best Practices

### Always Check for Errors

```typescript
// Method 1: Check result object
const result = await signerClient.createUnifiedOrder(params);
if (!result.success) {
  console.error('Failed:', result.mainOrder.error);
  return;
}

// Method 2: Check error field
const [tx, hash, error] = await signerClient.createOrder(params);
if (error) {
  console.error('Failed:', error);
  return;
}

// Method 3: Try-catch for unexpected errors
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
npx ts-node examples/create_market_order.ts
npx ts-node examples/create_limit_order.ts

# Then try these
npx ts-node examples/cancel_order.ts
npx ts-node examples/close_position.ts
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

## Happy Trading! 🚀

You now have everything you need to start trading on Lighter Protocol. Start with the examples, experiment with the parameters, and build your own trading strategies!
