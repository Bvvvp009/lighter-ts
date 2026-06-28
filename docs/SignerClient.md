# SignerClient

The `SignerClient` is the main class for interacting with the Lighter Protocol. It provides high-level methods for creating orders, managing accounts, and performing transactions using the WASM signer.

## Signer Integration

This SDK uses a WASM signer for cryptographic operations. The signer provides:

- ✅ All transaction types (orders, transfers, leverage updates, etc.)
- ✅ Automatic error recovery and nonce management
- ✅ Support for multiple API keys and accounts
- ✅ Production-ready cryptographic operations

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
| ~~`signerServerUrl`~~ | ~~`string`~~ | ~~No~~ | ~~URL of the signer server (deprecated - use WASM signer)~~ |
| `wasmConfig` | `WasmSignerConfig` | No | Configuration for WASM signer (optional - auto-resolves paths) |

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
- `integratorAccountIndex?: number` - Partner/integrator account index
- `integratorTakerFee?: number` - Partner fee for taker fills (in 1e6 scale)
- `integratorMakerFee?: number` - Partner fee for maker fills (in 1e6 scale)
- `orderExpiry: number` - Order expiry timestamp
- `skipNonce?: boolean` - Skip nonce checks/signing attribute when supported by signer

**Returns:** `Promise<[any, string, string | null]>` - `[transaction, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10, // Base amount
  price: 4500, // Price in cents
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
  orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY,
  integratorAccountIndex: 1234,
  integratorTakerFee: 100,
  integratorMakerFee: 100,
  skipNonce: false
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
  baseAmount: 10, // Base amount
  avgExecutionPrice: 4500, // Max price in cents
  isAsk: true
});
```

### cancelOrder(params: CancelOrderParams)

Cancels an existing order.

**Parameters:**
- `marketIndex: number` - Market index
- `orderIndex: number` - Order index to cancel
- `nonce?: number` - Optional nonce (auto-generated if not provided)
- `skipNonce?: boolean` - Skip nonce checks/signing attribute when supported by signer

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
const [tx, txHash, err] = await client.transfer(456, 1000000); // Transfer 100 USDC (in cents)
```

### modifyOrder(marketIndex, orderIndex, baseAmount, price, triggerPrice, nonce?, options?)

Modifies an existing order's parameters without canceling it.

**Parameters:**
- `marketIndex: number` - Market index
- `orderIndex: number` - Order index to modify
- `baseAmount: number` - New base amount
- `price: number` - New price
- `triggerPrice: number` - New trigger price (0 for non-conditional orders)
- `nonce?: number` - Optional nonce (auto-fetched if not provided)
- `options?.integratorAccountIndex?: number` - Partner/integrator account index
- `options?.integratorTakerFee?: number` - Partner taker fee (1e6 scale)
- `options?.integratorMakerFee?: number` - Partner maker fee (1e6 scale)
- `options?.skipNonce?: boolean` - Skip nonce checks/signing attribute when supported by signer

**Returns:** `Promise<[any, string, string | null]>` - `[orderInfo, txHash, error]`

**Example:**
```typescript
const [orderInfo, txHash, err] = await client.modifyOrder(
  0,        // marketIndex
  12345,    // orderIndex
  1000000,  // baseAmount
  300000,   // price
  0         // triggerPrice
);
```

### transferSameMasterAccount(params: TransferSameMasterAccountParams)

Transfers USDC between sub-accounts under the same master account. Unlike `transfer()`, this does not require an L1 (Ethereum) signature.

**Parameters:**
- `toAccountIndex: number` - Destination sub-account index (must share the same master account)
- `usdcAmount: number` - Amount in USDC
- `fee: number` - Transfer fee in USDC
- `memo: string` - 32-byte memo (64 hex chars, with or without `0x` prefix)
- `asset_id?: number` - Asset ID (default: 3 for USDC)
- `is_spot_account?: boolean` - Destination route: `true` for spot, `false`/omitted for perp
- `from_is_spot_account?: boolean` - Source route; defaults to `is_spot_account` (same-route transfer) — set explicitly opposite for a spot↔perp swap on the same account
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[transferInfo, txHash, error]`

**Example:**
```typescript
const [tx, txHash, err] = await client.transferSameMasterAccount({
  toAccountIndex: 281474976527303,
  usdcAmount: 10,
  fee: 0,
  memo: '00000000000000000000000000000000',
});
```

### approveIntegrator(integratorIndex, maxPerpsTakerFee, maxPerpsMakerFee, maxSpotTakerFee, maxSpotMakerFee, approvalExpiry, nonce?)

Approves another account index (an "integrator" — a frontend, bot platform, or affiliate) to receive a share of taker/maker fees on orders that attach its index. Orders are attached via `integratorAccountIndex`/`integratorTakerFee`/`integratorMakerFee` on `createOrder()`/`modifyOrder()`.

**Parameters:**
- `integratorIndex: number` - The account index being approved as integrator
- `maxPerpsTakerFee: number` / `maxPerpsMakerFee: number` - Max perps fee caps (1e6 scale, e.g. `1000` = 0.1%)
- `maxSpotTakerFee: number` / `maxSpotMakerFee: number` - Max spot fee caps (1e6 scale)
- `approvalExpiry: number` - **Millisecond** Unix timestamp; must be in the future
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[approveInfo, txHash, error]`

To **revoke** a prior approval, call this again with all four fee caps and `approvalExpiry` set to `0` (the protocol treats `approvalExpiry === 0 && allFeesZero` as the revocation signal — there is no separate revoke transaction type).

**Example:**
```typescript
const expiry = Date.now() + 86400 * 1000; // 1 day from now, in milliseconds
const [info, txHash, err] = await client.approveIntegrator(
  281474976527303, // integratorIndex
  1000, 500,        // maxPerpsTakerFee, maxPerpsMakerFee
  1000, 500,        // maxSpotTakerFee, maxSpotMakerFee
  expiry
);

// Revoke:
await client.approveIntegrator(281474976527303, 0, 0, 0, 0, 0);
```

### Self-Trade Prevention

`createOrder()`, `modifyOrder()`, and the grouped-order methods accept `selfTradeBehaviorMode`/`selfTradeEqualityMode` options to control what happens when an order would otherwise match against the same account's own resting order:

```typescript
const [tx, txHash, err] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 100,
  price: 200000,
  isAsk: true,
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  selfTradeBehaviorMode: SignerClient.SELF_TRADE_BEHAVIOR_EXPIRE_MAKER,
  selfTradeEqualityMode: SignerClient.SELF_TRADE_EQUALITY_ACCOUNT_INDEX,
});
```

Behavior modes: `SELF_TRADE_BEHAVIOR_EXPIRE_MAKER` (0), `SELF_TRADE_BEHAVIOR_EXPIRE_TAKER` (1), `SELF_TRADE_BEHAVIOR_EXPIRE_BOTH` (2), `SELF_TRADE_BEHAVIOR_REDUCE` (3). Equality modes: `SELF_TRADE_EQUALITY_ACCOUNT_INDEX` (0), `SELF_TRADE_EQUALITY_MASTER_ACCOUNT_INDEX` (1).

See `examples/self_trade_create_modify_order.ts` and `examples/self_trade_grouped_orders.ts` for full usage.

### updateAccountConfig(accountTradingMode, nonce?) / updateAccountAssetConfig(assetIndex, assetMarginMode, nonce?)

Configures Unified Trading Account (UTA) mode and per-asset margin eligibility:

```typescript
// Enable UTA (unifies USDC across spot and perp routes); 0 = disabled, 1 = enabled
const [tx, txHash, err] = await client.updateAccountConfig(1);

// Enable ETH (asset index 1) as usable margin collateral
const [tx2, txHash2, err2] = await client.updateAccountAssetConfig(
  1,
  SignerClient.ASSET_MARGIN_MODE_ENABLED
);
```

See `examples/enable_uta.ts`, `examples/disable_uta.ts`, `examples/enable_eth_as_margin.ts`, and `examples/disable_eth_as_margin.ts`.

### createSubAccount(nonce?)

Creates a sub account from the master account.

**Parameters:**
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[subAccountInfo, txHash, error]`

**Example:**
```typescript
const [subAccountInfo, txHash, err] = await client.createSubAccount();
```

### createPublicPool(operatorFee, initialTotalShares, minOperatorShareRate, nonce?)

Creates a public pool for liquidity provision.

**Parameters:**
- `operatorFee: number` - Operator fee in basis points (e.g., 100 = 1%)
- `initialTotalShares: number` - Initial total shares
- `minOperatorShareRate: number` - Minimum operator share rate in basis points
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[poolInfo, txHash, error]`

**Example:**
```typescript
const [poolInfo, txHash, err] = await client.createPublicPool(
  100,      // operatorFee: 1%
  1000000,  // initialTotalShares
  5000      // minOperatorShareRate: 50%
);
```

### updatePublicPool(publicPoolIndex, status, operatorFee, minOperatorShareRate, nonce?)

Updates an existing public pool's parameters.

**Parameters:**
- `publicPoolIndex: number` - Public pool index
- `status: number` - Pool status
- `operatorFee: number` - Operator fee in basis points
- `minOperatorShareRate: number` - Minimum operator share rate in basis points
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[poolInfo, txHash, error]`

**Example:**
```typescript
const [poolInfo, txHash, err] = await client.updatePublicPool(
  0,    // publicPoolIndex
  1,    // status: 1 = active
  150,  // operatorFee: 1.5%
  6000  // minOperatorShareRate: 60%
);
```

### mintShares(publicPoolIndex, shareAmount, nonce?)

Mints shares in a public pool.

**Parameters:**
- `publicPoolIndex: number` - Public pool index
- `shareAmount: number` - Amount of shares to mint
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[mintInfo, txHash, error]`

**Example:**
```typescript
const [mintInfo, txHash, err] = await client.mintShares(
  0,      // publicPoolIndex
  10000   // shareAmount
);
```

### burnShares(publicPoolIndex, shareAmount, nonce?)

Burns shares in a public pool.

**Parameters:**
- `publicPoolIndex: number` - Public pool index
- `shareAmount: number` - Amount of shares to burn
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[burnInfo, txHash, error]`

**Example:**
```typescript
const [burnInfo, txHash, err] = await client.burnShares(
  0,      // publicPoolIndex
  5000    // shareAmount
);
```

### updateMargin(marketIndex, usdcAmount, direction, nonce?)

Updates margin for a position (add or remove).

**Parameters:**
- `marketIndex: number` - Market index
- `usdcAmount: number` - USDC amount in USDC units (will be scaled internally)
- `direction: number` - 0 to add margin, 1 to remove margin
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[marginInfo, txHash, error]`

**Example:**
```typescript
// Add margin
const [marginInfo, txHash, err] = await client.updateMargin(
  0,    // marketIndex
  100,  // usdcAmount: 100 USDC
  0     // direction: 0 = add
);

// Remove margin
const [marginInfo2, txHash2, err2] = await client.updateMargin(
  0,   // marketIndex
  50,  // usdcAmount: 50 USDC
  1    // direction: 1 = remove
);
```

### createGroupedOrders(groupingType, orders, nonce?)

Creates grouped orders (OTO/OCO/OTOCO).

**Parameters:**
- `groupingType: number` - 1=OTO, 2=OCO, 3=OTOCO
- `orders: Array<OrderParams>` - Array of order parameters
- `nonce?: number` - Optional nonce (auto-fetched if not provided)

**Returns:** `Promise<[any, string, string | null]>` - `[groupedOrdersInfo, txHash, error]`

**Example:**
```typescript
// OTO (One Triggers Other)
const [ordersInfo, txHash, err] = await client.createGroupedOrders(
  1, // groupingType: OTO
  [
    {
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 1000000,
      price: 300000,
      isAsk: false,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GOOD_TILL_TIME,
      orderExpiry: Date.now() + (28 * 24 * 60 * 60 * 1000)
    },
    {
      marketIndex: 0,
      clientOrderIndex: Date.now() + 1,
      baseAmount: 1000000,
      price: 290000,
      isAsk: false,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.GOOD_TILL_TIME,
      orderExpiry: Date.now() + (28 * 24 * 60 * 60 * 1000)
    }
  ]
);
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

### createOtocoOrder(params)

Creates a grouped OTOCO order (One-Triggers-One-Cancels-Other) with entry order, stop-loss, and take-profit in a single transaction. This is the recommended method for creating orders with integrated risk management.

**Parameters:**
- `mainOrder` - Main order configuration
  - `marketIndex: number` - Market index (0 for ETH/USDC)
  - `baseAmount: number` - Base amount in units (1 ETH = 1,000,000)
  - `isAsk: boolean` - Direction: true = SELL, false = BUY
  - `orderType: OrderType.LIMIT | OrderType.MARKET` - Order type
  - `price?: number` - Limit price (required for LIMIT orders)
  - `avgExecutionPrice?: number` - Max execution price for market orders
  - `maxSlippage?: number` - Max slippage as decimal (e.g., 0.001 = 0.1%)
  - `idealPrice?: number` - Target price for slippage calculation
- `stopLoss` - Stop-loss configuration
  - `triggerPrice: number` - Trigger price
  - `price?: number` - Execution price (defaults to triggerPrice)
  - `isLimit?: boolean` - Use limit order for SL
- `takeProfit` - Take-profit configuration
  - `triggerPrice: number` - Trigger price
  - `price?: number` - Execution price (defaults to triggerPrice)
  - `isLimit?: boolean` - Use limit order for TP
- `nonce?: number` - Optional nonce

**Returns:** `Promise<{ tx, hash, error }>` 

**Example - Market Order with SL/TP:**
```typescript
const result = await signerClient.createOtocoOrder({
  mainOrder: {
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 10000,          // 0.01 ETH
    isAsk: false,               // BUY
    orderType: OrderType.MARKET,
    idealPrice: 400000,         // Target $4000
    maxSlippage: 0.001          // 0.1% max slippage
  },
  // Stop-loss at 5% loss
  stopLoss: {
    triggerPrice: 380000,       // $3800
    isLimit: false              // Market SL
  },
  // Take-profit at 5% gain
  takeProfit: {
    triggerPrice: 420000,       // $4200
    isLimit: false              // Market TP
  }
});

if (result.error || !result.hash) {
  console.error('❌ Failed:', result.error);
} else {
  console.log('✅ OTOCO order created!');
  console.log('Grouped tx hash:', result.hash);
}
```

**Example - Limit Order with SL/TP:**
```typescript
const result = await signerClient.createOtocoOrder({
  mainOrder: {
    marketIndex: 0,
    baseAmount: 10000,
    price: 400000,              // Limit price $4000
    isAsk: false,               // BUY
    orderType: OrderType.LIMIT,
    orderExpiry: Date.now() + (60 * 60 * 1000) // 1 hour
  },
  stopLoss: {
    triggerPrice: 380000,
    isLimit: false
  },
  takeProfit: {
    triggerPrice: 420000,
    isLimit: false
  }
});
```

**Note for TWAP Orders**: TWAP orders execute over time. Create SL/TP separately after the TWAP begins executing.

### checkClient(useWasmCheck?: boolean)

Checks if the client is properly configured. Optionally validates API key with server using WASM signer.

**Parameters:**
- `useWasmCheck?: boolean` - If true, calls WASM CheckClient to verify API key matches server (default: false)

**Returns:** `Promise<string | null>` - Error message if check fails, null if successful

**Example:**
```typescript
// Basic validation only
const error = await client.checkClient();
if (error) {
  console.error('Client check failed:', error);
}

// With WASM API key validation
const error = await client.checkClient(true);
if (error) {
  console.error('API key validation failed:', error);
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
- `TX_TYPE_CHANGE_PUB_KEY = 8` - Change public key transaction
- `TX_TYPE_CREATE_SUB_ACCOUNT = 9` - Create sub account transaction
- `TX_TYPE_CREATE_PUBLIC_POOL = 10` - Create public pool transaction
- `TX_TYPE_UPDATE_PUBLIC_POOL = 11` - Update public pool transaction
- `TX_TYPE_TRANSFER = 12` - Transfer transaction
- `TX_TYPE_WITHDRAW = 13` - Withdraw transaction
- `TX_TYPE_CREATE_ORDER = 14` - Create order transaction
- `TX_TYPE_CANCEL_ORDER = 15` - Cancel order transaction
- `TX_TYPE_CANCEL_ALL_ORDERS = 16` - Cancel all orders transaction
- `TX_TYPE_MODIFY_ORDER = 17` - Modify order transaction
- `TX_TYPE_MINT_SHARES = 18` - Mint shares transaction
- `TX_TYPE_BURN_SHARES = 19` - Burn shares transaction
- `TX_TYPE_UPDATE_LEVERAGE = 20` - Update leverage transaction
- `TX_TYPE_CREATE_GROUPED_ORDERS = 28` - Create grouped orders transaction
- `TX_TYPE_UPDATE_MARGIN = 29` - Update margin transaction

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
import { SignerClient } from 'lighter-ts-sdk';

async function main() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0
    // No wasmConfig needed - standalone signer auto-resolves paths
  });

  try {
    await client.initialize();
    await (client as any).ensureWasmClient();

    // Check client status
    const checkError = client.checkClient();
    if (checkError) {
      throw new Error(`Client check failed: ${checkError}`);
    }

    // Create a limit order
    const [tx, txHash, err] = await client.createOrder({
      marketIndex: 0,
      clientOrderIndex: Date.now(),
      baseAmount: 10,
      price: 4500,
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
