# Transaction Monitoring and Status Tracking

This guide explains how to monitor and track transactions on Lighter Protocol with network-aware status reporting and error handling.

## Table of Contents

- [Transaction Status States](#transaction-status-states)
- [Basic Monitoring](#basic-monitoring)
- [Advanced Monitoring Patterns](#advanced-monitoring-patterns)
- [Error Handling](#error-handling)
- [Production Patterns](#production-patterns)
- [Troubleshooting](#troubleshooting)

## Transaction Status States

Lighter Protocol transactions progress through multiple states:

| Status | Value | Meaning | Action Needed |
|--------|-------|---------|---------------|
| PENDING | 0 | Initial state, not yet in queue | Wait for QUEUED |
| QUEUED | 1 | Transaction queued for processing | Wait for COMMITTED |
| COMMITTED | 2 | Committed to block (usually safe) | Wait for EXECUTED |
| EXECUTED | 3 | Successfully executed on-chain | ✅ Complete |
| FAILED | 4 | Execution failed | ❌ Handle error (likely insufficient balance/margin) |
| REJECTED | 5 | Transaction rejected before execution | ❌ Handle error (invalid parameters or nonce issues) |

### Status Progression

Normal happy path:
```
PENDING → QUEUED → COMMITTED → EXECUTED (✅ Success)
```

Failure paths:
```
PENDING → QUEUED → COMMITTED → FAILED (❌ On-chain error)
PENDING → REJECTED (❌ Pre-flight check failed)
```

## Basic Monitoring

### Simple: Wait for Confirmation

The easiest way to monitor a transaction is `waitForTransaction()`. It:
- Automatically retries if temporary network errors occur
- Centralizes error handling
- Returns when transaction is EXECUTED (state 3)
- Throws error if transaction FAILED or REJECTED

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const client = new SignerClient({
  url: 'https://mainnet.zklighter.elliot.ai',
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
  apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
});

await client.initialize();
await client.ensureWasmClient();

try {
  // Create an order
  const result = await client.createOrder(orderParams);
  
  if (!result.hash) {
    console.error('Order failed:', result.error);
    return;
  }
  
  console.log('Order created:', result.hash);
  
  // Wait for confirmation (blocks until EXECUTED or throws on error)
  await client.waitForTransaction(result.hash, 30000, 2000);
  
  console.log('✅ Order confirmed on-chain!');
} catch (error) {
  console.error('❌ Transaction failed:', error.message);
} finally {
  await client.close();
}
```

### Parameters

```typescript
waitForTransaction(
  txHash: string,      // Transaction hash to monitor
  maxWaitTime: number, // Max time to wait (milliseconds)
  pollInterval?: number // How often to check (default: 2000ms)
): Promise<Transaction>
```

**Returns** when status is EXECUTED (3)
**Throws** if status is FAILED (4), REJECTED (5), or timeout reached

## Advanced Monitoring Patterns

### Pattern 1: Explicit Status Polling

```typescript
// Check status manually without waiting
const transaction = await client.getTransaction(txHash);

console.log(`TX Status: ${transaction.status}`);
```

Status constants from SignerClient:
```typescript
SignerClient.TX_STATUS_PENDING = 0
SignerClient.TX_STATUS_QUEUED = 1
SignerClient.TX_STATUS_COMMITTED = 2
SignerClient.TX_STATUS_EXECUTED = 3
SignerClient.TX_STATUS_FAILED = 4
SignerClient.TX_STATUS_REJECTED = 5
```

### Pattern 2: Custom Wait Function

```typescript
// Custom wait with specific timeout per status
async function customWait(client: SignerClient, txHash: string) {
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    const tx = await client.getTransaction(txHash);
    
    switch (tx.status) {
      case SignerClient.TX_STATUS_EXECUTED:
        console.log('✅ EXECUTED');
        return tx;
        
      case SignerClient.TX_STATUS_FAILED:
        throw new Error('Transaction execution failed');
        
      case SignerClient.TX_STATUS_REJECTED:
        throw new Error('Transaction rejected');
        
      case SignerClient.TX_STATUS_COMMITTED:
        console.log('✍️ COMMITTED - waiting for execution...');
        break;
        
      case SignerClient.TX_STATUS_QUEUED:
        console.log('📋 QUEUED');
        break;
        
      case SignerClient.TX_STATUS_PENDING:
        console.log('⏳ PENDING');
        break;
    }
    
    // Wait 1 second before next check
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error('Transaction timeout after 60 seconds');
}

// Usage
try {
  const result = await customWait(client, txHash);
  console.log('Transaction succeeded:', result);
} catch (error) {
  console.error('Transaction failed:', error.message);
}
```

### Pattern 3: Fire-and-Forget with Async Callback

```typescript
// Don't wait for confirmation in main flow
async function createOrderAsync(orderParams: any) {
  const result = await client.createOrder(orderParams);
  
  if (!result.hash) {
    console.error('Order creation failed:', result.error);
    return;
  }
  
  console.log('✅ Order submitted:', result.hash);
  
  // Monitor in background (don't await)
  monitorTransaction(result.hash);
}

async function monitorTransaction(txHash: string) {
  try {
    await client.waitForTransaction(txHash, 60000, 2000);
    console.log('✅ Order confirmed on-chain');
    // Handle success (store in DB, notify user, etc.)
  } catch (error) {
    console.error('❌ Order confirmation failed:', error.message);
    // Handle failure (notify user, retry, etc.)
  }
}
```

### Pattern 4: Multiple Transaction Monitoring

```typescript
// Monitor multiple transactions in parallel
async function monitorMultiple(txHashes: string[]) {
  const promises = txHashes.map(hash =>
    client
      .waitForTransaction(hash, 30000, 2000)
      .then(() => ({ hash, status: 'success' }))
      .catch(err => ({ hash, status: 'failed', error: err.message }))
  );
  
  const results = await Promise.all(promises);
  
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');
  
  console.log(`✅ ${successful.length} succeeded`);
  console.log(`❌ ${failed.length} failed`);
  
  return { successful, failed };
}
```

## Error Handling

### Understanding Error Messages

```typescript
try {
  await client.waitForTransaction(txHash, 30000);
} catch (error) {
  const msg = error.message;
  
  if (msg.includes('timeout')) {
    // Transaction didn't confirm within timeout
    console.error('Transaction timeout - try checking status later');
    
  } else if (msg.includes('FAILED')) {
    // Transaction failed on-chain
    console.error('Transaction failed on-chain - likely insufficient collateral');
    // Don't retry - check parameters instead
    
  } else if (msg.includes('REJECTED')) {
    // Transaction rejected before execution
    console.error('Transaction rejected - likely invalid parameters or nonce issue');
    // Safe to retry with new nonce
    
  } else {
    // Unexpected error
    console.error('Unexpected error:', msg);
  }
}
```

### Handling Insufficient Margin

```typescript
// When adding a position with insufficient margin
try {
  const result = await client.createOrder({
    marketIndex: 0,
    baseAmount: 1000000,  // 1 ETH
    price: 400000,        // $4000
    isAsk: false          // BUY
  });
  
  if (!result.hash) {
    // Order creation itself failed
    console.error('❌ Order creation failed:', result.error);
    return;
  }
  
  // Wait for on-chain execution
  await client.waitForTransaction(result.hash, 30000);
  console.log('✅ Order filled');
  
} catch (error) {
  if (error.message.includes('FAILED')) {
    console.error('❌ Insufficient margin - add collateral or reduce size');
    
    // Get current margin status
    const accountData = await client.getAccountMetadata();
    console.log('Available balance:', accountData.available_balance);
    console.log('Margin usage:', accountData.margin_usage);
  }
}
```

### Retry Logic for Network Issues

```typescript
async function waitWithRetry(
  client: SignerClient,
  txHash: string,
  maxRetries: number = 3
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.waitForTransaction(txHash, 30000, 2000);
    } catch (error) {
      if (attempt < maxRetries - 1 && error.message.includes('timeout')) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw error;
      }
    }
  }
}
```

## Production Patterns

### Pattern: Transaction Queue with Status Tracking

```typescript
interface PendingTransaction {
  hash: string;
  type: string;
  params: any;
  createdAt: number;
  status?: number;
}

class TransactionManager {
  private pending: Map<string, PendingTransaction> = new Map();
  private client: SignerClient;
  
  constructor(client: SignerClient) {
    this.client = client;
    // Poll pending transactions every 5 seconds
    setInterval(() => this.checkPending(), 5000);
  }
  
  async submitOrder(orderParams: any): Promise<string> {
    const result = await this.client.createOrder(orderParams);
    
    if (!result.hash) {
      throw new Error(`Order creation failed: ${result.error}`);
    }
    
    // Track transaction
    this.pending.set(result.hash, {
      hash: result.hash,
      type: 'order',
      params: orderParams,
      createdAt: Date.now()
    });
    
    return result.hash;
  }
  
  private async checkPending() {
    for (const [hash, tx] of this.pending.entries()) {
      try {
        const status = await this.client.getTransaction(hash);
        tx.status = status.status;
        
        // Remove if executed or failed
        if (status.status >= 3) {
          this.pending.delete(hash);
          
          if (status.status === 3) {
            console.log(`✅ ${tx.type} executed: ${hash}`);
          } else {
            console.log(`❌ ${tx.type} failed: ${hash}`);
          }
        }
        
        // Timeout after 5 minutes
        if (Date.now() - tx.createdAt > 5 * 60 * 1000) {
          console.warn(`⏱️ ${tx.type} timeout: ${hash}`);
          this.pending.delete(hash);
        }
      } catch (error) {
        console.error(`Error checking ${hash}:`, error.message);
      }
    }
  }
  
  getPending(): PendingTransaction[] {
    return Array.from(this.pending.values());
  }
}
```

### Pattern: Batch Order Submission

```typescript
async function submitOrderBatch(
  client: SignerClient,
  orders: any[]
): Promise<string[]> {
  const hashes: string[] = [];
  
  for (const order of orders) {
    try {
      const result = await client.createOrder(order);
      if (result.hash) {
        hashes.push(result.hash);
        console.log(`✅ Order ${hashes.length}/${orders.length}`);
        
        // Small delay between submissions
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Failed to submit order:`, error);
    }
  }
  
  // Monitor all in parallel
  console.log(`Monitoring ${hashes.length} orders...`);
  await Promise.allSettled(
    hashes.map(hash =>
      client
        .waitForTransaction(hash, 60000, 2000)
        .catch(err => console.error(`Order ${hash} failed:`, err.message))
    )
  );
  
  return hashes;
}
```

## Troubleshooting

### Transaction Status Always Returns 0 (PENDING)

**Cause**: Network latency - transaction not yet propagated to node
**Solution**: Wait longer or increase poll interval

```typescript
// Give it more time
await client.waitForTransaction(txHash, 60000, 5000);  // 60s timeout, 5s intervals
```

### Transaction Times Out

**Cause**: Network congestion or node issues
**Solution**: Check manually and retry if needed

```typescript
try {
  await client.waitForTransaction(txHash, 30000);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Check manually
    const tx = await client.getTransaction(txHash);
    console.log('Current status:', tx.status);
    
    if (tx.status < 3) {
      // Still processing, wait more
      await client.waitForTransaction(txHash, 60000);
    }
  }
}
```

### Transaction Shows FAILED but Parameters Were Correct

**Causes**: 
- Insufficient margin
- Market conditions changed
- Nonce already used

**Solution**: 
- Check account margin status
- Verify market state
- Use fresh nonce

```typescript
// Check account state
const account = await client.getAccountMetadata();
console.log('Margin usage:', account.margin_usage);
console.log('Available balance:', account.available_balance);

// For manual nonce handling
const nonce = await client.accountNonce;
const result = await client.createOrder({
  ...orderParams,
  nonce  // Use specific nonce
});
```

### No Error Thrown, but Status is FAILED

**Cause**: `waitForTransaction()` not called - must explicitly wait or check
**Solution**: Always check hash before waiting, then wait for confirmation

```typescript
const result = await client.createOrder(orderParams);

// ALWAYS CHECK FOR ERRORS FIRST
if (result.error || !result.hash) {
  console.error('Order failed:', result.error);
  return;
}

// THEN monitor status
try {
  await client.waitForTransaction(result.hash, 30000);
  console.log('✅ Confirmed');
} catch (error) {
  console.error('❌ Failed:', error.message);
}
```

## Summary

- **Fast path**: Use `waitForTransaction()` for blocking confirmation
- **Advanced**: Manual polling with `getTransaction()` for custom logic
- **Async**: Monitor in background for non-blocking UX
- **Production**: Implement transaction manager for queuing/tracking
- **Errors**: Check `result.error` first, then monitor status changes

For additional examples, see `examples/` directory:
- `examples/create_order.ts` - Simple order with wait
- `examples/multi_client_advanced.ts` - Multiple client tracking
- `examples/send_tx_batch.ts` - Batch submission and monitoring
