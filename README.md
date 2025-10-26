# Lighter Protocol TypeScript SDK

TypeScript SDK for Lighter Protocol - Trade perpetuals with efficiency and fairness.

## Installation

```sh
npm install lighter-ts-sdk
```

## Quick Start

```typescript
import { SignerClient, ApiClient } from 'lighter-ts-sdk';

// Initialize client
const signerClient = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: 'your-private-key',
  accountIndex: 0,
  apiKeyIndex: 0
});

await signerClient.initialize();
```

## Examples

### Create Market Order

```typescript
import { SignerClient, getDefaultClients, OrderType } from 'lighter-ts-sdk';

async function createMarketOrder() {
  const { signerClient } = await getDefaultClients();
  
  const [orderInfo, txHash, error] = await signerClient.createMarketOrder({
    marketIndex: 0,
    clientOrderIndex: 12345,
    baseAmount: 1000, // 0.1 ETH
    avgExecutionPrice: 3000,
    isAsk: false // Buy order
  });
  
  if (error) {
    console.error('Order failed:', error);
    return;
  }
  
  console.log('Order created:', txHash);
}

createMarketOrder().catch(console.error);
```

### Create Limit Order with Stop-Loss

```typescript
import { SignerClient, getDefaultClients, OrderType } from 'lighter-ts-sdk';

async function createLimitOrderWithSL() {
  const { signerClient } = await getDefaultClients();
  
  const result = await signerClient.createUnifiedOrder({
    marketIndex: 0,
    clientOrderIndex: 12345,
    baseAmount: 1000,
    price: 3000,
    isAsk: false,
    orderType: OrderType.LIMIT,
    stopLoss: {
      triggerPrice: 2900,
      isLimit: true
    },
    takeProfit: {
      triggerPrice: 3100,
      isLimit: true
    }
  });
  
  console.log('Orders created:', result.hashes);
}

createLimitOrderWithSL().catch(console.error);
```

## API Reference

### Core Methods

```typescript
// Order Management
await signerClient.createOrder(params)           // Create limit/market order
await signerClient.createMarketOrder(params)     // Create market order
await signerClient.createUnifiedOrder(params)    // Create order with SL/TP
await signerClient.cancelOrder(params)           // Cancel specific order
await signerClient.cancelAllOrders(0, 0)         // Cancel all orders

// Account Management
await signerClient.createSubAccount()            // Create subaccount
await signerClient.getSubAccounts()              // Get subaccount list
await signerClient.isSubAccount(index)           // Check if subaccount
await signerClient.transfer(toAccount, amount)   // Transfer between accounts
await signerClient.withdraw(amount)              // Withdraw to L1

// Position Management
await signerClient.closePosition(marketIndex)    // Close specific position
await signerClient.closeAllPositions()           // Close all positions
await signerClient.updateLeverage(market, mode, fraction) // Update leverage
```

### Configuration

```typescript
interface SignerConfig {
  url: string;           // Lighter Protocol API URL
  privateKey: string;    // Private key for signing
  accountIndex: number;  // Account index (0 for master)
  apiKeyIndex: number;   // API key index
}
```

### Order Types

```typescript
// Order Types
orderType: OrderType.LIMIT    // 0
orderType: OrderType.MARKET   // 1
orderType: OrderType.TWAP     // 6

// Time in Force
timeInForce: TimeInForce.GOOD_TILL_TIME        // 1 (GTC)
timeInForce: TimeInForce.IMMEDIATE_OR_CANCEL   // 0 (IOC)
timeInForce: TimeInForce.POST_ONLY            // 2 (Post Only)
```

## Examples

Run the examples in the `examples/` directory:

```bash
# Set environment variables
export LIGHTER_URL="https://mainnet.zklighter.elliot.ai"
export PRIVATE_KEY="your-private-key"
export ACCOUNT_INDEX="0"
export API_KEY_INDEX="0"

# Run examples
npm run example:market-order
npm run example:limit-order
npm run example:unified-order
```

## Environment Variables

```bash
LIGHTER_URL=https://mainnet.zklighter.elliot.ai
PRIVATE_KEY=your-private-key
ACCOUNT_INDEX=0
API_KEY_INDEX=0
```

## Browser Support

The SDK supports both Node.js and browser environments. For browser usage:

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const signerClient = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: 'your-private-key',
  accountIndex: 0,
  apiKeyIndex: 0
});

await signerClient.initialize();
// Ready to use in browser
```

## License

MIT License - see LICENSE file for details.