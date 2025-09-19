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

### sendTx(txType: number, txInfo: string)

Sends a transaction to the network.

**Parameters:**
- `txType: number` - Transaction type (use `SignerClient.TX_TYPE_*` constants)
- `txInfo: string` - Transaction information as JSON string

**Returns:** `Promise<TxHash>` - Transaction hash

**Example:**
```typescript
const txHash = await transactionApi.sendTx(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData)
);
console.log('Transaction sent:', txHash.hash);
```

### sendTxWithIndices(txType: number, txInfo: string, accountIndex: number, apiKeyIndex: number)

Sends a transaction with account and API key indices.

**Parameters:**
- `txType: number` - Transaction type
- `txInfo: string` - Transaction information as JSON string
- `accountIndex: number` - Account index
- `apiKeyIndex: number` - API key index

**Returns:** `Promise<TxHash>` - Transaction hash

**Example:**
```typescript
const txHash = await transactionApi.sendTxWithIndices(
  SignerClient.TX_TYPE_CREATE_ORDER,
  JSON.stringify(orderData),
  123,
  0
);
console.log('Transaction sent:', txHash.hash);
```

### sendTxBatch(txHashes: string[])

Sends multiple transactions in a batch.

**Parameters:**
- `txHashes: string[]` - Array of transaction hashes

**Returns:** `Promise<TxHashes>` - Batch transaction hashes

**Example:**
```typescript
const batchHashes = await transactionApi.sendTxBatch([
  '0xhash1...',
  '0xhash2...',
  '0xhash3...'
]);
console.log('Batch sent:', batchHashes.hashes);
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
import { ApiClient, TransactionApi, SignerClient } from '@lighter/typescript-sdk';

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
