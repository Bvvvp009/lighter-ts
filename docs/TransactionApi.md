# TransactionApi

The `TransactionApi` class provides methods for retrieving transaction data, managing nonces, and sending transactions.

## Constructor

```typescript
new TransactionApi(client: ApiClient)
```

## Methods

### getTransaction(params: TransactionParams)

Gets a specific transaction by hash or other identifier.

**Parameters:**
- `by: 'hash' | 'l1_tx_hash'` - Search by transaction hash or L1 transaction hash
- `value: string` - The transaction hash value

**Returns:** `Promise<Transaction>` - Transaction information

**Example:**
```typescript
const transactionApi = new TransactionApi(client);

// Get transaction by hash
const tx = await transactionApi.getTransaction({ 
  by: 'hash', 
  value: '0x1234567890abcdef...' 
});

// Get transaction by L1 hash
const tx = await transactionApi.getTransaction({ 
  by: 'l1_tx_hash', 
  value: '0xabcdef1234567890...' 
});
```

### getTransactionFromL1TxHash(l1TxHash: string)

Gets a transaction from an L1 transaction hash.

**Parameters:**
- `l1TxHash: string` - L1 transaction hash

**Returns:** `Promise<Transaction>` - Transaction information

**Example:**
```typescript
const tx = await transactionApi.getTransactionFromL1TxHash('0xabcdef1234567890...');
```

### getTransactions(params?: PaginationParams)

Gets a list of transactions with pagination.

**Parameters:**
- `limit?: number` - Maximum number of transactions to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Transaction[]>` - Array of transactions

**Example:**
```typescript
const transactions = await transactionApi.getTransactions({ 
  limit: 50, 
  index: 0 
});
console.log(`Found ${transactions.length} transactions`);
```

### getBlock(params: BlockParams)

Gets block information.

**Parameters:**
- `by: 'height' | 'hash'` - Search by block height or hash
- `value: string` - The block height or hash value

**Returns:** `Promise<Block>` - Block information

**Example:**
```typescript
const block = await transactionApi.getBlock({
  by: 'height',
  value: '100'
});
```

### getBlocks(params?: PaginationParams)

Gets a list of blocks.

**Parameters:**
- `limit?: number` - Maximum number of blocks to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Block[]>` - Array of blocks

**Example:**
```typescript
const blocks = await transactionApi.getBlocks({ limit: 20 });
```

### getCurrentHeight()

Gets the current block height.

**Returns:** `Promise<{ height: number }>` - Current block height

**Example:**
```typescript
const { height } = await transactionApi.getCurrentHeight();
console.log('Current height:', height);
```

### getBlockTransactions(params: BlockParams & PaginationParams)

Gets transactions for a specific block.

**Parameters:**
- `by: 'height' | 'hash'` - Search by block height or hash
- `value: string` - The block height or hash value
- `limit?: number` - Maximum number of transactions to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Transaction[]>` - Array of block transactions

**Example:**
```typescript
const blockTxs = await transactionApi.getBlockTransactions({
  by: 'height',
  value: '100',
  limit: 20
});
console.log(`Found ${blockTxs.length} transactions in block 100`);
```

### getAccountTransactions(accountIndex: number, params?: PaginationParams)

Gets transactions for a specific account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of transactions to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Transaction[]>` - Array of account transactions

**Example:**
```typescript
const accountTxs = await transactionApi.getAccountTransactions(123, {
  limit: 100
});
console.log(`Found ${accountTxs.length} transactions for account 123`);
```

### getAccountPendingTransactions(accountIndex: number, params?: PaginationParams)

Gets pending transactions for a specific account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of transactions to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Transaction[]>` - Array of pending transactions

**Example:**
```typescript
const pendingTxs = await transactionApi.getAccountPendingTransactions(123);
console.log(`Found ${pendingTxs.length} pending transactions`);
```

### getPendingTransactions(params?: PaginationParams)

Gets all pending transactions.

**Parameters:**
- `limit?: number` - Maximum number of transactions to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Transaction[]>` - Array of pending transactions

**Example:**
```typescript
const pendingTxs = await transactionApi.getPendingTransactions({ limit: 50 });
```

### getDepositHistory(accountIndex: number, params?: PaginationParams)

Gets deposit history for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of entries to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<any>` - Deposit history

**Example:**
```typescript
const deposits = await transactionApi.getDepositHistory(123);
```

### getWithdrawHistory(accountIndex: number, params?: PaginationParams)

Gets withdraw history for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of entries to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<any>` - Withdraw history

**Example:**
```typescript
const withdraws = await transactionApi.getWithdrawHistory(123);
```

### getNextNonce(accountIndex: number, apiKeyIndex: number)

Gets the next nonce for an account and API key combination.

**Parameters:**
- `accountIndex: number` - Account index
- `apiKeyIndex: number` - API key index

**Returns:** `Promise<NextNonce>` - Next nonce information

**Example:**
```typescript
const nextNonce = await transactionApi.getNextNonce(123, 0);
console.log('Next nonce:', nextNonce.nonce);
```

### sendTx(txType: number, txInfo: string, priceProtection?: boolean)

Sends a transaction to the network.

**Parameters:**
- `txType: number` - Transaction type (use `SignerClient.TX_TYPE_*` constants)
- `txInfo: string` - Transaction information as JSON string
- `priceProtection?: boolean` - Enable price protection (default: true)

**Returns:** `Promise<TxHash>` - Transaction hash

**Example:**
```typescript
const txHash = await transactionApi.sendTx(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData),
  true
);
console.log('Transaction sent:', txHash.hash || txHash.tx_hash);
```

### sendTxWithIndices(txType: number, txInfo: string, accountIndex: number, apiKeyIndex: number, priceProtection?: boolean)

Sends a transaction with account and API key indices.

**Parameters:**
- `txType: number` - Transaction type
- `txInfo: string` - Transaction information as JSON string
- `accountIndex: number` - Account index
- `apiKeyIndex: number` - API key index
- `priceProtection?: boolean` - Enable price protection (default: true)

**Returns:** `Promise<TxHash>` - Transaction hash

**Example:**
```typescript
const txHash = await transactionApi.sendTxWithIndices(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData),
  123,
  0,
  true
);
console.log('Transaction sent:', txHash.hash || txHash.tx_hash);
```

### sendTxJson(txType: number, txInfo: string, accountIndex: number, apiKeyIndex: number, priceProtection?: boolean)

Sends a transaction using JSON format (alternative to form-encoded).

**Parameters:**
- `txType: number` - Transaction type
- `txInfo: string` - Transaction information as JSON string
- `accountIndex: number` - Account index
- `apiKeyIndex: number` - API key index
- `priceProtection?: boolean` - Enable price protection (default: true)

**Returns:** `Promise<TxHash>` - Transaction hash

**Example:**
```typescript
const txHash = await transactionApi.sendTxJson(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData),
  123,
  0
);
```

### sendTxBatch(params: SendTransactionBatchParams)

Sends multiple transactions in a batch.

**Parameters:**
- `params: SendTransactionBatchParams` - Batch transaction parameters
  - Either `tx_types: string` and `tx_infos: string` (comma-separated)
  - Or `account_index: number`, `api_key_index: number`, and `transactions: Array<{tx_type: number, tx_info: string}>`

**Returns:** `Promise<TxHashes>` - Batch transaction hashes

**Example:**
```typescript
// Using tx_types and tx_infos (comma-separated strings)
const batchHashes = await transactionApi.sendTxBatch({
  tx_types: '14,15',
  tx_infos: 'txInfo1,txInfo2'
});

// Using transactions array
const batchHashes = await transactionApi.sendTxBatch({
  account_index: 123,
  api_key_index: 0,
  transactions: [
    { tx_type: 14, tx_info: 'txInfo1' },
    { tx_type: 15, tx_info: 'txInfo2' }
  ]
});
console.log('Batch sent:', batchHashes.hashes || batchHashes.tx_hash);
```

## Types

### TransactionParams

```typescript
interface TransactionParams {
  by: 'hash' | 'l1_tx_hash';
  value: string;
}
```

### BlockParams

```typescript
interface BlockParams {
  by: 'height' | 'hash';
  value: string;
}
```

### PaginationParams

```typescript
interface PaginationParams {
  limit?: number;
  index?: number;
}
```

### Transaction

```typescript
interface Transaction {
  hash: string;
  type: number;
  info: string;
  status: number;
  block_height: number;
  account_index: number;
  nonce: number;
  // ... other transaction properties
}
```

### NextNonce

```typescript
interface NextNonce {
  nonce: number;
}
```

### TxHash

```typescript
interface TxHash {
  hash: string;
}
```

### TxHashes

```typescript
interface TxHashes {
  hashes: string[];
}
```

## Error Handling

All methods throw errors for invalid parameters or network issues:

```typescript
try {
  const tx = await transactionApi.getTransaction({ 
    by: 'hash', 
    value: '0x123...' 
  });
  console.log('Transaction:', tx);
} catch (error) {
  console.error('Failed to get transaction:', error.message);
}
```

## Complete Example

```typescript
import { ApiClient, TransactionApi, SignerClient } from 'lighter-ts-sdk';

async function main() {
  const client = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const transactionApi = new TransactionApi(client);

  try {
    // Get recent transactions
    const transactions = await transactionApi.getTransactions({ 
      limit: 20 
    });
    console.log(`Found ${transactions.length} recent transactions`);

    // Get transactions for a specific block
    const blockTxs = await transactionApi.getBlockTransactions({
      by: 'height',
      value: '100',
      limit: 10
    });
    console.log(`Found ${blockTxs.length} transactions in block 100`);

    // Get account transactions
    const accountTxs = await transactionApi.getAccountTransactions(123, {
      limit: 50
    });
    console.log(`Found ${accountTxs.length} transactions for account 123`);

    // Get next nonce
    const nextNonce = await transactionApi.getNextNonce(123, 0);
    console.log('Next nonce:', nextNonce.nonce);

    // Get specific transaction
    if (transactions.length > 0) {
      const tx = await transactionApi.getTransaction({
        by: 'hash',
        value: transactions[0].hash
      });
      console.log('Transaction details:', tx);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```
