# Explorer API - Transaction Tracking & Status Monitoring

The Explorer API provides real-time access to transaction tracking, account history, and blockchain information for the Lighter Protocol. Use these APIs to monitor order execution, track transaction status, and retrieve detailed transaction information.

📚 **Documentation**: [https://apidocs.lighter.xyz/reference/](https://apidocs.lighter.xyz/reference/)

---

## Quick Start

### Initialize Explorer API Client

```typescript
import { ExplorerApiClient, SearchApi, LogsApi } from 'lighter-ts-sdk';

// Create explorer client
const explorerClient = new ExplorerApiClient();

// Create specific API instances
const searchApi = new SearchApi(explorerClient);
const logsApi = new LogsApi(explorerClient);
```

---

## SearchApi - Universal Search

The `SearchApi` provides a universal search interface to find transactions, blocks, batches, and accounts across the Lighter Protocol.

### Methods

#### `search(params: SearchParams): Promise<SearchResult[]>`

Search for blocks, batches, transactions, or accounts using a universal query.

```typescript
// Search by transaction hash
const results = await searchApi.search({ 
  q: '0x123abc...' 
});

results.forEach(result => {
  if (result.type === 'log') {
    console.log('Transaction:', result.log.status);
  }
});
```

**Parameters:**
- `q` (string, required): Search query - can be transaction hash, block number, batch number, L1 address, or account index

**Returns:** Array of `SearchResult` objects with mixed types

---

#### `searchTransaction(txHash: string): Promise<TransactionLogResult | undefined>`

Quickly search for a specific transaction by hash.

```typescript
const txResult = await searchApi.searchTransaction('0x123abc...');
if (txResult?.log.status === 'executed') {
  console.log('Transaction executed!');
}
```

---

#### `getTransactionStatus(txHash: string): Promise<'pending' | 'executed' | 'failed' | 'rejected' | undefined>`

Get the status of a transaction in one call.

```typescript
const status = await searchApi.getTransactionStatus('0x123abc...');

switch(status) {
  case 'executed':
    console.log('✅ Transaction confirmed');
    break;
  case 'pending':
    console.log('⏳ Still processing...');
    break;
  case 'failed':
  case 'rejected':
    console.log('❌ Transaction failed');
    break;
}
```

**Returns:** Transaction status or `undefined` if not found

---

#### `searchBatch(batchNumber: number | string): Promise<BatchResult | undefined>`

Search for batch information.

```typescript
const batchResult = await searchApi.searchBatch(135388);
if (batchResult) {
  console.log('Batch:', batchResult.batch.batch_number);
  console.log('Block:', batchResult.batch.block_number);
}
```

---

#### `searchBlock(blockIdentifier: number | string): Promise<BlockResult | undefined>`

Search for block information.

```typescript
const blockResult = await searchApi.searchBlock(175751355);
if (blockResult) {
  console.log('Block:', blockResult.block.number);
  console.log('Hash:', blockResult.block.hash);
}
```

---

#### `searchAccount(accountIdentifier: string | number): Promise<AccountResult | undefined>`

Search for account information.

```typescript
const accountResult = await searchApi.searchAccount('0xL1Address');
if (accountResult) {
  console.log('Account Index:', accountResult.account.account_index);
}
```

---

## LogsApi - Transaction & Activity Logs

The `LogsApi` provides detailed access to transaction logs and account activity history.

### Methods

#### `getByHash(hash: string): Promise<TransactionLog>`

Get detailed transaction log by hash - the primary method for transaction status tracking.

```typescript
const txLog = await logsApi.getByHash('0x123abc...');

console.log('Status:', txLog.status);
console.log('Block:', txLog.block_number);
console.log('Time:', txLog.time);

// If it's a trade
if (txLog.pubdata_type === 'Trade') {
  const trade = txLog.pubdata?.trade_pubdata;
  console.log('Price:', trade?.price);
  console.log('Size:', trade?.size);
}
```

**Returns:** `TransactionLog` object with execution details

**Throws:** `NotFoundException` if hash not found

---

#### `getByAccount(accountIdentifier: string, params: LogQueryParams): Promise<AccountLogsResponse>`

Get transaction logs for an account with pagination.

```typescript
const logs = await logsApi.getByAccount('0xAccountAddress', {
  limit: 100,
  offset: 0,
  pub_data_type: ['Trade'] // Optional filter
});

console.log(`Found ${logs.logs.length} transactions`);
logs.logs.forEach(log => {
  console.log(`[${log.time}] ${log.tx_type}: ${log.status}`);
});
```

**Parameters:**
- `accountIdentifier` (string): L1 address or account index
- `params.limit` (number): Maximum results (default: 50)
- `params.offset` (number): Pagination offset (default: 0)
- `params.pub_data_type` (string[], optional): Filter by data types (e.g., 'Trade', 'Order')

**Returns:** `AccountLogsResponse` with logs array and pagination info

---

#### `getAccountActivity(accountIdentifier: string, limit?, offset?, dataTypes?): Promise<AccountLogsResponse>`

Convenience method for account activity retrieval.

```typescript
// Get last 100 trades
const trades = await logsApi.getAccountActivity(
  '0xAccountAddress',
  100,
  0,
  ['Trade']
);
```

---

#### `getAccountLogsByType(accountIdentifier: string, dataType: string, limit?, offset?): Promise<AccountLogsResponse>`

Get account logs filtered by specific type.

```typescript
const tradeLogs = await logsApi.getAccountLogsByType(
  '0xAccountAddress',
  'Trade',
  50,
  0
);
```

---

#### `getAccountTrades(accountIdentifier: string, limit?, offset?): Promise<AccountLogsResponse>`

Get recent trades for an account.

```typescript
const recentTrades = await logsApi.getAccountTrades('0xAccountAddress', 20, 0);

recentTrades.logs.forEach(log => {
  const trade = log.pubdata?.trade_pubdata;
  console.log(`Price: ${trade?.price}, Size: ${trade?.size}`);
});
```

---

#### `isTransactionExecuted(hash: string): Promise<boolean>`

Quick check if transaction was executed.

```typescript
if (await logsApi.isTransactionExecuted(txHash)) {
  console.log('Order has been executed!');
}
```

---

#### `isTransactionPending(hash: string): Promise<boolean>`

Check if transaction is still pending.

```typescript
if (await logsApi.isTransactionPending(txHash)) {
  console.log('Order is still being processed...');
}
```

---

#### `getTradeData(hash: string): Promise<TradePubdata | undefined>`

Extract trade-specific data from a transaction.

```typescript
const trade = await logsApi.getTradeData(txHash);
if (trade) {
  console.log('Market:', trade.market_index);
  console.log('Price:', trade.price);
  console.log('Size:', trade.size);
  console.log('Fees:', trade.taker_fee);
}
```

---

#### `waitForExecution(hash: string, maxAttempts?, intervalMs?): Promise<TransactionLog | undefined>`

Poll for transaction confirmation with configurable retry behavior.

```typescript
const result = await logsApi.waitForExecution(
  txHash,
  60,    // Check up to 60 times
  1000   // 1 second between attempts
);

if (result?.status === 'executed') {
  console.log('✅ Transaction confirmed!');
} else {
  console.log('⏳ Timeout waiting for confirmation');
}
```

**Parameters:**
- `hash` (string): Transaction hash
- `maxAttempts` (number, default: 60): Maximum polling attempts
- `intervalMs` (number, default: 1000): Milliseconds between attempts

**Returns:** `TransactionLog` once confirmed, or `undefined` on timeout

---

## Type Definitions

### TransactionLog

```typescript
interface TransactionLog {
  tx_type: string;              // Transaction type (e.g., 'InternalClaimOrder')
  hash: string;                 // Transaction hash
  time: string;                 // Execution timestamp (ISO 8601)
  pubdata?: PublicData;         // Public data associated with transaction
  pubdata_type: string;         // Type of public data (e.g., 'Trade')
  block_number: number;         // Block where transaction was executed
  batch_number: number;         // Batch number
  status: 'pending' | 'executed' | 'failed' | 'rejected';
  [key: string]: any;           // Additional fields
}
```

### TradePubdata

```typescript
interface TradePubdata {
  trade_type: number;           // Type of trade (0 = normal, etc.)
  market_index: number;         // Market identifier
  is_taker_ask: number;         // 1 if taker side is ask, 0 if bid
  maker_fee: number;            // Fee paid by maker
  taker_fee: number;            // Fee paid by taker
  taker_account_index: string;  // Taker's account index
  maker_account_index: string;  // Maker's account index
  fee_account_index: string;    // Fee collector account index
  price: string;                // Execution price
  size: string;                 // Trade size
  [key: string]: any;           // Additional fields
}
```

### SearchResult

Union type of possible search results:

```typescript
type SearchResult = 
  | TransactionLogResult    // { type: 'log', log: TransactionLog }
  | BatchResult             // { type: 'batch', batch: BatchInfo }
  | BlockResult             // { type: 'block', block: BlockInfo }
  | AccountResult;          // { type: 'account', account: AccountInfo }
```

---

## Common Use Cases

### 1. Monitor Order Execution

```typescript
async function monitorOrder(orderTxHash: string) {
  // Quick status check
  const status = await searchApi.getTransactionStatus(orderTxHash);
  console.log('Order status:', status);

  // Get full details
  const log = await logsApi.getByHash(orderTxHash);
  const trade = log.pubdata?.trade_pubdata;
  
  if (trade) {
    console.log(`Executed at: ${trade.price}`);
    console.log(`Size: ${trade.size}`);
  }
}
```

### 2. Track Account Activity

```typescript
async function trackAccountActivity(accountAddress: string) {
  const activity = await logsApi.getAccountActivity(accountAddress, 50);
  
  activity.logs.forEach(log => {
    console.log(`${log.time}: ${log.tx_type} (${log.status})`);
  });
}
```

### 3. Retrieve Trading History

```typescript
async function getTradingHistory(accountAddress: string) {
  const trades = await logsApi.getAccountTrades(accountAddress, 100);
  
  const summary = trades.logs.reduce((acc, log) => {
    const trade = log.pubdata?.trade_pubdata;
    if (!trade) return acc;
    
    acc.totalVolume += parseFloat(trade.size);
    acc.totalFees += trade.taker_fee;
    return acc;
  }, { totalVolume: 0, totalFees: 0 });
  
  console.log('Trading Summary:', summary);
}
```

### 4. Wait for Order Confirmation

```typescript
async function waitForOrderConfirmation(orderTxHash: string) {
  console.log('Submitting order...');
  
  const confirmed = await logsApi.waitForExecution(
    orderTxHash,
    120,  // Wait up to 2 minutes
    500   // Check every 500ms
  );
  
  if (confirmed?.status === 'executed') {
    console.log('✅ Order confirmed!');
    return confirmed;
  } else {
    console.log('❌ Order confirmation timeout');
    return null;
  }
}
```

### 5. Search and Analyze

```typescript
async function analyzeTransaction(query: string) {
  const results = await searchApi.search({ q: query });
  
  results.forEach(result => {
    switch (result.type) {
      case 'log':
        console.log(`Transaction: ${result.log.hash}`);
        console.log(`Status: ${result.log.status}`);
        break;
      case 'batch':
        console.log(`Batch: ${result.batch.batch_number}`);
        break;
      case 'block':
        console.log(`Block: ${result.block.number}`);
        break;
      case 'account':
        console.log(`Account: ${result.account.account_index}`);
        break;
    }
  });
}
```

---

## Error Handling

```typescript
import { 
  NotFoundException, 
  BadRequestException, 
  ServiceException 
} from 'lighter-ts-sdk';

try {
  const txLog = await logsApi.getByHash(txHash);
  console.log('Transaction found:', txLog);
} catch (error) {
  if (error instanceof NotFoundException) {
    console.log('Transaction not found');
  } else if (error instanceof BadRequestException) {
    console.log('Invalid request parameters');
  } else if (error instanceof ServiceException) {
    console.log('Explorer service error - try again later');
  } else {
    console.log('Unknown error:', error);
  }
}
```

---

## Configuration

### Custom Explorer Host

```typescript
const explorerClient = new ExplorerApiClient({
  explorerHost: 'https://custom-explorer.example.com/api'
});
```

### Default Configuration

- **Base URL**: `https://explorer.elliot.ai/api`
- **Timeout**: 10 seconds
- **No authentication required** (read-only public data)

---

## Best Practices

1. **Polling Intervals**: Use `waitForExecution()` with appropriate timeout for order confirmation
2. **Rate Limiting**: Implement backoff when polling frequently
3. **Error Handling**: Always catch and handle API exceptions
4. **Caching**: Cache frequently accessed data when possible
5. **Batching**: Retrieve multiple transactions at once using account logs

---

## Examples

See the `examples/` directory for related working examples:

- [`live_smoke.ts`](../examples/live_smoke.ts) - End-to-end live probe and transaction status classification
- [`market_data.ts`](../examples/market_data.ts) - Market/exchange data retrieval patterns
- [`multi_client_advanced.ts`](../examples/multi_client_advanced.ts) - Multi-client orchestration patterns

---

## API Reference

- **Explorer API**: https://apidocs.lighter.xyz/reference/
- **Explorer Base URL**: https://explorer.elliot.ai/api/
- **Status Endpoint**: https://apidocs.lighter.xyz/reference/status

---

## Support

For issues or questions:
- 📖 [SDK Documentation](https://github.com/lighter-xyz/lighter-ts)
- 🐛 [GitHub Issues](https://github.com/lighter-xyz/lighter-ts/issues)
- 💬 [Discord Community](https://discord.gg/lighter)
