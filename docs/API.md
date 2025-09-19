# API Reference

This section contains detailed documentation for all API classes, methods, and types in the Lighter TypeScript SDK.

## Core Classes

### [SignerClient](SignerClient.md)
The main class for trading operations, order management, and account operations.

**Key Methods:**
- `createOrder()` - Create limit orders
- `createMarketOrder()` - Create market orders
- `cancelOrder()` - Cancel existing orders
- `cancelAllOrders()` - Cancel all orders
- `transfer()` - Transfer USDC between accounts
- `updateLeverage()` - Update leverage settings
- `generateAPIKey()` - Generate new API keys

### [ApiClient](ApiClient.md)
Base HTTP client for API communication.

### [WsClient](WsClient.md)
WebSocket client for real-time data streaming.

## API Classes

### [AccountApi](AccountApi.md)
Account information and management.

**Methods:**
- `getAccount()` - Get account information
- `getAccountsByL1Address()` - Get accounts by L1 address
- `getApiKeys()` - Get API keys
- `getPnL()` - Get profit/loss information
- `getPublicPools()` - Get public pool information

### [OrderApi](OrderApi.md)
Order book and trading data.

**Methods:**
- `getExchangeStats()` - Get exchange statistics
- `getOrderBookDetails()` - Get order book details
- `getOrderBooks()` - Get all order books
- `getRecentTrades()` - Get recent trades

### [TransactionApi](TransactionApi.md)
Transaction management and history.

**Methods:**
- `getTransaction()` - Get specific transaction
- `getTransactions()` - Get transaction list
- `getBlockTransactions()` - Get block transactions
- `getAccountTransactions()` - Get account transactions
- `getNextNonce()` - Get next nonce
- `sendTx()` - Send transaction
- `sendTxBatch()` - Send batch transactions

### [BlockApi](BlockApi.md)
Block information and data.

**Methods:**
- `getBlock()` - Get block information
- `getBlocks()` - Get block list
- `getCurrentHeight()` - Get current block height

### [RootApi](RootApi.md)
System information and status.

**Methods:**
- `getInfo()` - Get system information
- `getStatus()` - Get system status

## Type Definitions

### Core Types

#### [SignerConfig](types/SignerConfig.md)
Configuration for SignerClient initialization.

#### [WasmSignerConfig](types/WasmSignerConfig.md)
Configuration for WASM signer setup.

#### [ApiKeyPair](types/ApiKeyPair.md)
Generated API key pair structure.

### Order Types

#### [CreateOrderParams](types/CreateOrderParams.md)
Parameters for creating limit orders.

#### [MarketOrderParams](types/MarketOrderParams.md)
Parameters for creating market orders.

#### [CancelOrderParams](types/CancelOrderParams.md)
Parameters for canceling orders.

#### [CancelAllOrdersParams](types/CancelAllOrdersParams.md)
Parameters for canceling all orders.

### Transaction Types

#### [TransferParams](types/TransferParams.md)
Parameters for USDC transfers.

#### [UpdateLeverageParams](types/UpdateLeverageParams.md)
Parameters for updating leverage.

### Data Types

#### [Account](types/Account.md)
Account information structure.

#### [Order](types/Order.md)
Order information structure.

#### [Transaction](types/Transaction.md)
Transaction information structure.

#### [OrderBook](types/OrderBook.md)
Order book data structure.

#### [Trade](types/Trade.md)
Trade information structure.

## Constants

### Order Types
- `ORDER_TYPE_LIMIT = 0` - Limit order
- `ORDER_TYPE_MARKET = 1` - Market order

### Time in Force
- `ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 0` - IOC
- `ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1` - GTT
- `ORDER_TIME_IN_FORCE_FILL_OR_KILL = 2` - FOK

### Margin Modes
- `CROSS_MARGIN_MODE = 0` - Cross margin
- `ISOLATED_MARGIN_MODE = 1` - Isolated margin

### Transaction Types
- `TX_TYPE_CREATE_ORDER = 1` - Create order
- `TX_TYPE_CANCEL_ORDER = 2` - Cancel order
- `TX_TYPE_CANCEL_ALL_ORDERS = 3` - Cancel all orders
- `TX_TYPE_TRANSFER = 4` - Transfer
- `TX_TYPE_UPDATE_LEVERAGE = 20` - Update leverage

## Error Handling

All SDK methods use consistent error handling patterns:

### SignerClient Methods
Return tuples with error information:
```typescript
const [result, txHash, error] = await client.createOrder(params);
if (error) {
  console.error('Operation failed:', error);
  return;
}
```

### API Methods
Throw exceptions for errors:
```typescript
try {
  const account = await accountApi.getAccount(params);
  console.log('Account:', account);
} catch (error) {
  console.error('API call failed:', error.message);
}
```

### WebSocket Methods
Use event handlers for errors:
```typescript
wsClient.on('error', (error) => {
  console.error('WebSocket error:', error);
});
```

## Examples

See the [examples directory](../examples/) for comprehensive usage examples:

- [Basic Trading](examples/create_market_order.ts)
- [Order Management](examples/create_cancel_order.ts)
- [Account Setup](examples/system_setup.ts)
- [Real-time Data](examples/ws.ts)
- [Advanced Operations](examples/transfer_update_leverage.ts)

## Getting Help

- [Getting Started Guide](GettingStarted.md)
- [Examples](../examples/)
- [Discord Community](https://discord.gg/lighter)
- [Documentation Site](https://docs.lighter.xyz)
