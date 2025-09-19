# AccountApi

The `AccountApi` class provides methods for retrieving account information, API keys, PnL data, and public pools.

## Constructor

```typescript
new AccountApi(client: ApiClient)
```

## Methods

### getAccount(params: AccountParams)

Gets account information by index or L1 address.

**Parameters:**
- `by: 'index' | 'l1_address'` - Search by account index or L1 address
- `value: string` - The account index or L1 address value

**Returns:** `Promise<Account>` - Account information

**Example:**
```typescript
const accountApi = new AccountApi(client);

// Get account by index
const account = await accountApi.getAccount({ by: 'index', value: '123' });

// Get account by L1 address
const account = await accountApi.getAccount({ 
  by: 'l1_address', 
  value: '0x1234567890123456789012345678901234567890' 
});
```

### getAccountsByL1Address(l1Address: string)

Gets all accounts associated with an L1 address.

**Parameters:**
- `l1Address: string` - Ethereum address

**Returns:** `Promise<Account[]>` - Array of accounts

**Example:**
```typescript
const accounts = await accountApi.getAccountsByL1Address(
  '0x1234567890123456789012345678901234567890'
);
console.log(`Found ${accounts.length} accounts`);
```

### getApiKeys(accountIndex: number, limit?: number)

Gets API keys for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `limit?: number` - Maximum number of API keys to return (default: 10)

**Returns:** `Promise<AccountApiKeys>` - API keys information

**Example:**
```typescript
const apiKeys = await accountApi.getApiKeys(123, 5);
console.log('API keys:', apiKeys.api_keys);
```

### getPnL(params: PnLParams)

Gets PnL (Profit and Loss) information for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `marketIndex?: number` - Optional market index filter
- `limit?: number` - Maximum number of entries to return

**Returns:** `Promise<AccountPnL>` - PnL information

**Example:**
```typescript
const pnl = await accountApi.getPnL({
  accountIndex: 123,
  marketIndex: 0, // ETH/USDC
  limit: 100
});
console.log('PnL entries:', pnl.entries);
```

### getPublicPools(filter?: string, limit?: number, index?: number)

Gets public pool information.

**Parameters:**
- `filter?: string` - Filter type ('all', 'active', etc.)
- `limit?: number` - Maximum number of pools to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<PublicPool[]>` - Array of public pools

**Example:**
```typescript
const pools = await accountApi.getPublicPools('all', 10, 0);
console.log(`Found ${pools.length} public pools`);
```

## Types

### AccountParams

```typescript
interface AccountParams {
  by: 'index' | 'l1_address';
  value: string;
}
```

### PnLParams

```typescript
interface PnLParams {
  accountIndex: number;
  marketIndex?: number;
  limit?: number;
}
```

### Account

```typescript
interface Account {
  index: string;
  l1_address: string;
  l2_address: string;
  // ... other account properties
}
```

### AccountApiKeys

```typescript
interface AccountApiKeys {
  api_keys: ApiKey[];
}
```

### AccountPnL

```typescript
interface AccountPnL {
  entries: PnLEntry[];
  // ... other PnL properties
}
```

### PublicPool

```typescript
interface PublicPool {
  pool_id: string;
  name: string;
  // ... other pool properties
}
```

## Error Handling

All methods throw errors for invalid parameters or network issues:

```typescript
try {
  const account = await accountApi.getAccount({ by: 'index', value: '123' });
  console.log('Account:', account);
} catch (error) {
  console.error('Failed to get account:', error.message);
}
```

## Complete Example

```typescript
import { ApiClient, AccountApi } from '@lighter/typescript-sdk';

async function main() {
  const client = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const accountApi = new AccountApi(client);

  try {
    // Get account by index
    const account = await accountApi.getAccount({ by: 'index', value: '123' });
    console.log('Account:', account);

    // Get all accounts for an L1 address
    const accounts = await accountApi.getAccountsByL1Address(
      '0x1234567890123456789012345678901234567890'
    );
    console.log(`Found ${accounts.length} accounts`);

    // Get API keys
    const apiKeys = await accountApi.getApiKeys(123);
    console.log('API keys:', apiKeys.api_keys);

    // Get PnL
    const pnl = await accountApi.getPnL({ accountIndex: 123 });
    console.log('PnL entries:', pnl.entries);

    // Get public pools
    const pools = await accountApi.getPublicPools('all', 10);
    console.log(`Found ${pools.length} public pools`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```
