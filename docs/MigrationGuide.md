# Migration Guide

Simple and realistic migration guide for upgrading between versions of the Lighter TypeScript SDK.

## Table of Contents

- [Upgrading from v0.x to v1.0+](#upgrading-from-v0x-to-v10)
- [Breaking Changes](#breaking-changes)
- [New Features](#new-features)
- [Common Migration Scenarios](#common-migration-scenarios)

## Upgrading from v0.x to v1.0+

### Overview

Version 1.0+ uses the **official lighter-go WASM signer** from GitHub instead of local signer implementations. The API remains largely the same, but there are some important changes to be aware of.

### Step 1: Update Package

```bash
npm install lighter-ts-sdk@latest
# or
yarn add lighter-ts-sdk@latest
```

### Step 2: Check Your Imports

Most imports remain the same. If you were using deprecated methods, update them:

```typescript
// ✅ Still works - no changes needed
import { SignerClient, OrderType } from 'lighter-ts-sdk';
```

### Step 3: Update Initialization (if needed)

The initialization process is the same:

```typescript
// ✅ This still works exactly the same
const client = new SignerClient({
  url: process.env.BASE_URL!,
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
  apiKeyIndex: parseInt(process.env.API_KEY_INDEX!)
});

await client.initialize();
await client.ensureWasmClient();
```

### Step 4: Review Removed Methods

If you were using these methods, they've been removed:

#### ❌ Removed: `getPublicKey()`

**Old code:**
```typescript
const publicKey = await client.getPublicKey(privateKey);
```

**New code:**
```typescript
// Use generateAPIKey() instead - returns both keys
const { privateKey, publicKey } = await client.generateAPIKey();
```

#### ❌ Removed: `switchAPIKey()`

**Old code:**
```typescript
await client.switchAPIKey(newApiKeyIndex);
```

**New code:**
```typescript
// Create a new client instance with different apiKeyIndex
const newClient = new SignerClient({
  ...config,
  apiKeyIndex: newApiKeyIndex
});
await newClient.initialize();
await newClient.ensureWasmClient();
```

### Step 5: Test Your Code

Run your existing code - it should work without changes (unless you used removed methods):

```bash
# Test your integration
npm test
# or run your examples
npx ts-node your-script.ts
```

## Breaking Changes

### 1. Signer Implementation

**What changed:**
- SDK now uses official `lighter-go` WASM signer from GitHub
- WASM is compiled automatically during build
- No local `temp-lighter-go` folder needed

**Impact:**
- ✅ **No code changes needed** - API is the same
- ✅ Better compatibility with official protocol
- ✅ Automatic updates when lighter-go updates

**Migration:**
- No migration needed - works automatically

### 2. Removed Methods

**Removed methods:**
- `getPublicKey()` - Use `generateAPIKey()` instead
- `switchAPIKey()` - Create new client instance instead

**Migration:**
See [Step 4](#step-4-review-removed-methods) above.

### 3. Type Exports

**What changed:**
- More types are now exported for better TypeScript support
- Some type names have been aliased to avoid conflicts

**Impact:**
- ✅ Better type safety
- ✅ More flexibility

**Migration:**
```typescript
// Old (still works)
import { CreateOrderParams } from 'lighter-ts-sdk';

// New (more specific)
import { SignerCreateOrderParams, CreateMarketOrderParams } from 'lighter-ts-sdk';
```

## New Features

### 1. WebSocket Order Client

**New feature:**
- `WebSocketOrderClient` for real-time order placement
- Faster order execution via WebSocket

**Usage:**
```typescript
import { WebSocketOrderClient } from 'lighter-ts-sdk';

const wsClient = new WebSocketOrderClient({
  url: 'https://mainnet.zklighter.elliot.ai'
});

await wsClient.connect();
// Use for real-time order placement
```

**Migration:**
- Optional feature - existing code works without it
- Enable via `enableWebSocket: true` in SignerClient config

### 2. Additional Type Exports

**New exports:**
- `CreateMarketOrderParams`
- `ChangeApiKeyParams`
- `WebSocketOrderClient` and related types

**Usage:**
```typescript
import type { 
  CreateMarketOrderParams,
  ChangeApiKeyParams,
  WebSocketOrderClient 
} from 'lighter-ts-sdk';
```

### 3. Enhanced Error Handling

**What's new:**
- Better error messages
- Automatic nonce retry logic
- Improved transaction status tracking

**Migration:**
- No changes needed - works automatically
- Your error handling code will benefit from better messages

## Common Migration Scenarios

### Scenario 1: Basic Order Creation

**Before (v0.x):**
```typescript
const [tx, hash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 400000,
  isAsk: false,
  orderType: 0
});
```

**After (v1.0+):**
```typescript
// ✅ Works exactly the same - no changes needed
const [tx, hash, error] = await client.createOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  price: 400000,
  isAsk: false,
  orderType: 0
});
```

### Scenario 2: Using Multiple API Keys

**Before (v0.x):**
```typescript
await client.switchAPIKey(1);
const [tx, hash, error] = await client.createOrder(params);
```

**After (v1.0+):**
```typescript
// Create a new client for different API key
const client2 = new SignerClient({
  ...config,
  apiKeyIndex: 1
});
await client2.initialize();
await client2.ensureWasmClient();

const [tx, hash, error] = await client2.createOrder(params);
```

### Scenario 3: Getting Public Key

**Before (v0.x):**
```typescript
const publicKey = await client.getPublicKey(privateKey);
```

**After (v1.0+):**
```typescript
// Generate new API key pair
const { privateKey, publicKey } = await client.generateAPIKey();

// Or if you need public key from existing private key:
// Use WASM signer directly (advanced)
const wasmClient = await client.getWasmClient();
// ... use WASM methods
```

### Scenario 4: Using WebSocket (New Feature)

**Before (v0.x):**
```typescript
// WebSocket not available
```

**After (v1.0+):**
```typescript
// Enable WebSocket in SignerClient
const client = new SignerClient({
  ...config,
  enableWebSocket: true
});

// Or use WebSocketOrderClient directly
import { WebSocketOrderClient } from 'lighter-ts-sdk';
const wsClient = new WebSocketOrderClient({
  url: 'https://mainnet.zklighter.elliot.ai'
});
await wsClient.connect();
```

## Testing Your Migration

### 1. Run Existing Tests

```bash
npm test
```

### 2. Test Core Functionality

```typescript
// Test order creation
const result = await client.createUnifiedOrder({
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 10000,
  isAsk: false,
  orderType: OrderType.MARKET
});

if (!result.success) {
  console.error('Migration issue:', result.mainOrder.error);
}
```

### 3. Test Error Handling

```typescript
try {
  await client.createOrder(invalidParams);
} catch (error) {
  // Verify error messages are clear
  console.log('Error:', error.message);
}
```

## Troubleshooting

### Issue: "Method not found"

**Problem:** Using removed method like `getPublicKey()` or `switchAPIKey()`

**Solution:** See [Step 4](#step-4-review-removed-methods) for replacements

### Issue: "WASM not found"

**Problem:** WASM files missing after upgrade

**Solution:**
```bash
# Rebuild WASM
npm run build:wasm

# Or reinstall
npm install lighter-ts-sdk@latest
```

### Issue: "Type errors"

**Problem:** TypeScript errors after upgrade

**Solution:**
```bash
# Update TypeScript types
npm install --save-dev @types/node@latest

# Rebuild
npm run build
```

### Issue: "Nonce errors"

**Problem:** Getting invalid nonce errors

**Solution:**
- SDK now has automatic nonce retry logic
- If errors persist, restart your application
- Check that you're not using multiple clients with same API key simultaneously

## Version Compatibility

| SDK Version | lighter-go Version | Node.js | TypeScript |
|------------|-------------------|---------|------------|
| v1.0.0+     | Latest from GitHub | 16+     | 4.5+       |
| v0.x        | Local/temp        | 16+     | 4.5+       |

## Need Help?

If you encounter issues during migration:

1. **Check the examples** - `examples/` directory has working code
2. **Review error messages** - They're more informative now
3. **Test incrementally** - Migrate one feature at a time
4. **Use testnet** - Test on testnet before mainnet

## Summary

**Quick Migration Checklist:**

- [ ] Update package: `npm install lighter-ts-sdk@latest`
- [ ] Remove calls to `getPublicKey()` → use `generateAPIKey()`
- [ ] Remove calls to `switchAPIKey()` → create new client instances
- [ ] Test your existing code - should work without changes
- [ ] (Optional) Enable WebSocket for faster orders
- [ ] (Optional) Use new type exports for better TypeScript support

**Most code requires zero changes** - the migration is primarily about:
1. Removing deprecated method calls
2. Taking advantage of new features (optional)
3. Better error handling (automatic)

The SDK is designed to be backward-compatible where possible, so your existing code should continue to work.





