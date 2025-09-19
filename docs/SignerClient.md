# SignerClient

The `SignerClient` is the main class for interacting with the Lighter Protocol. It provides high-level methods for creating orders, managing accounts, and performing transactions using a WASM-based signer.

## Constructor

```typescript
new SignerClient(config: SignerConfig)
```

### SignerConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | `string` | Yes | The Lighter API URL (e.g., `https://mainnet.zklighter.elliot.ai`) |
| `privateKey` | `string` | Yes | Your API key private key |
| `accountIndex` | `number` | Yes | Your account index |
| `apiKeyIndex` | `number` | Yes | Your API key index |
| `signerServerUrl` | `string` | No | URL of the signer server (alternative to WASM) |
| `wasmConfig` | `WasmSignerConfig` | No | Configuration for WASM signer |

## Methods

### initialize()

Initializes the signer client. Must be called before using other methods.

```typescript
await client.initialize();
```

### ensureWasmClient()

Ensures the WASM client is properly initialized and ready for use.

```typescript
await client.ensureWasmClient();
```

### createOrder(params: CreateOrderParams)

Creates a limit order.

**Parameters:**
- `marketIndex: number` - Market index (0 for ETH/USDC)
- `clientOrderIndex: number` - Unique client order index
- `baseAmount: number` - Base amount in smallest unit
- `price: number` - Order price in smallest unit
- `isAsk: boolean` - True for sell orders, false for buy orders
- `orderType: number` - Order type (use `SignerClient.ORDER_TYPE_LIMIT`)
- `timeInForce: number` - Time in force (use `SignerClient.ORDER_TIME_IN_FORCE_*`)
- `reduceOnly: boolean` - Whether this is a reduce-only order
- `triggerPrice: number` - Trigger price for conditional orders
- `orderExpiry: number` - Order expiry timestamp

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 1000000, // 1 ETH in smallest unit
  price: 300000000, // $3000 in smallest unit
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
  orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY
});
```

### createMarketOrder(params: MarketOrderParams)

Creates a market order.

**Parameters:**
- `marketIndex: number` - Market index (0 for ETH/USDC)
- `clientOrderIndex: number` - Unique client order index
- `baseAmount: number` - Base amount in smallest unit
- `avgExecutionPrice: number` - Maximum average execution price
- `isAsk: boolean` - True for sell orders, false for buy orders

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.createMarketOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 1000000, // 1 ETH in smallest unit
  avgExecutionPrice: 300000000, // Max $3000 average price
  isAsk: true
});
```

### cancelOrder(params: CancelOrderParams)

Cancels an existing order.

**Parameters:**
- `marketIndex: number` - Market index
- `orderIndex: number` - Order index to cancel
- `nonce?: number` - Optional nonce (auto-generated if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.cancelOrder({
  marketIndex: 0,
  orderIndex: 12345
});
```

### cancelAllOrders(timeInForce: number, time: number)

Cancels all orders for the account.

**Parameters:**
- `timeInForce: number` - Time in force (use `SignerClient.CANCEL_ALL_TIF_*`)
- `time: number` - Time parameter
- `nonce?: number` - Optional nonce (auto-generated if not provided)

**Returns:** `Promise<[any, string | null]>` - `[txHash, error]`

**Example:**
```typescript
const [txHash, err] = await client.cancelAllOrders(
  SignerClient.CANCEL_ALL_TIF_IMMEDIATE,
  0
);
```

### transfer(toAccountIndex: number, usdcAmount: number)

Transfers USDC between accounts.

**Parameters:**
- `toAccountIndex: number` - Destination account index
- `usdcAmount: number` - Amount in USDC (will be scaled internally)
- `nonce?: number` - Optional nonce (auto-generated if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.transfer(456, 100); // Transfer 100 USDC
```

### updateLeverage(marketIndex: number, marginMode: number, initialMarginFraction: number)

Updates leverage settings for a market.

**Parameters:**
- `marketIndex: number` - Market index
- `marginMode: number` - Margin mode (use `SignerClient.CROSS_MARGIN_MODE` or `SignerClient.ISOLATED_MARGIN_MODE`)
- `initialMarginFraction: number` - Initial margin fraction
- `nonce?: number` - Optional nonce (auto-generated if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.updateLeverage(
  0, // ETH/USDC market
  SignerClient.CROSS_MARGIN_MODE,
  3 // 3x leverage
);
```

### generateAPIKey(seed?: string)

Generates a new API key pair.

**Parameters:**
- `seed?: string` - Optional seed for key generation

**Returns:** `Promise<{ privateKey: string; publicKey: string } | null>`

**Example:**
```typescript
const apiKey = await client.generateAPIKey();
if (apiKey) {
  console.log('New API key:', apiKey.privateKey);
  console.log('Public key:', apiKey.publicKey);
}
```

### createAuthTokenWithExpiry(expirySeconds?: number)

Creates an authentication token.

**Parameters:**
- `expirySeconds?: number` - Token expiry in seconds (default: 10 minutes)

**Returns:** `Promise<string>` - Authentication token

**Example:**
```typescript
const token = await client.createAuthTokenWithExpiry(3600); // 1 hour expiry
```

### checkClient()

Checks if the client is properly configured and connected.

**Returns:** `string | null` - Error message if check fails, null if successful

**Example:**
```typescript
const error = client.checkClient();
if (error) {
  console.error('Client check failed:', error);
}
```

### close()

Closes the client and cleans up resources.

```typescript
await client.close();
```

## Constants

### Order Types
- `ORDER_TYPE_LIMIT = 0` - Limit order
- `ORDER_TYPE_MARKET = 1` - Market order

### Time in Force
- `ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0` - Immediate or Cancel
- `ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1` - Good Till Time
- `ORDER_TIME_IN_FORCE_FILL_OR_KILL = 2` - Fill or Kill

### Cancel All Orders Time in Force
- `CANCEL_ALL_TIF_IMMEDIATE = 0` - Immediate cancellation
- `CANCEL_ALL_TIF_SCHEDULED = 1` - Scheduled cancellation
- `CANCEL_ALL_TIF_ABORT = 2` - Abort cancellation

### Margin Modes
- `CROSS_MARGIN_MODE = 0` - Cross margin mode
- `ISOLATED_MARGIN_MODE = 1` - Isolated margin mode

### Transaction Types
- `TX_TYPE_CREATE_ORDER = 1` - Create order transaction
- `TX_TYPE_CANCEL_ORDER = 2` - Cancel order transaction
- `TX_TYPE_CANCEL_ALL_ORDERS = 3` - Cancel all orders transaction
- `TX_TYPE_TRANSFER = 4` - Transfer transaction
- `TX_TYPE_UPDATE_LEVERAGE = 20` - Update leverage transaction

### Other Constants
- `NIL_TRIGGER_PRICE = 0` - No trigger price
- `DEFAULT_28_DAY_ORDER_EXPIRY = -1` - Default 28-day expiry
- `DEFAULT_IOC_EXPIRY = 0` - Default IOC expiry
- `DEFAULT_10_MIN_AUTH_EXPIRY = -1` - Default auth expiry
- `MINUTE = 60` - Seconds in a minute
- `USDC_TICKER_SCALE = 1e6` - USDC scaling factor

## Error Handling

All methods return a tuple where the last element is an error string if something goes wrong:

```typescript
const [tx, txHash, err] = await client.createOrder(params);
if (err) {
  console.error('Order creation failed:', err);
  return;
}
console.log('Order created successfully:', txHash);
```

## Complete Example

```typescript
import { SignerClient } from '@lighter/typescript-sdk';

async function main() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    // Check client status
    const checkError = client.checkClient();
    if (checkError) {
      throw new Error(`Client check failed: ${checkError}`);
    }

    // Create a limit order
    const [tx, txHash, err] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 1000000,
      price: 300000000,
      isAsk: true,
      orderType: SignerClient.ORDER_TYPE_LIMIT,
      timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
      reduceOnly: false,
      triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
      orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY
    });

    if (err) {
      console.error('Order creation failed:', err);
      return;
    }

    console.log('Order created successfully:', txHash);

  } finally {
    await client.close();
  }
}

main().catch(console.error);
```
