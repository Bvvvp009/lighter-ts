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

### getApiKeys(accountIndex: number, apiKeyIndex: number)

Gets API keys for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `apiKeyIndex: number` - API key index

**Returns:** `Promise<AccountApiKeys>` - API keys information

**Example:**
```typescript
const apiKeys = await accountApi.getApiKeys(123, 0);
console.log('API keys:', apiKeys.api_keys);
```

### getPnL(accountIndex: number, params?: { start_time?: number; end_time?: number })

Gets PnL (Profit and Loss) information for an account.

**Parameters:**
- `accountIndex: number` - Account index
- `params?: { start_time?: number; end_time?: number }` - Optional time range filter

**Returns:** `Promise<any>` - PnL information

**Example:**
```typescript
const pnl = await accountApi.getPnL(123, {
  start_time: Date.now() - (7 * 24 * 60 * 60 * 1000), // Last 7 days
  end_time: Date.now()
});
console.log('PnL:', pnl);
```

### getAccounts(params?: PaginationParams)

Gets a list of accounts with pagination.

**Parameters:**
- `limit?: number` - Maximum number of accounts to return
- `index?: number` - Starting index for pagination

**Returns:** `Promise<Account[]>` - Array of accounts

**Example:**
```typescript
const accounts = await accountApi.getAccounts({ limit: 50, index: 0 });
console.log(`Found ${accounts.length} accounts`);
```

### getFeeBucket(accountIndex: number)

Gets fee bucket information for an account.

**Parameters:**
- `accountIndex: number` - Account index

**Returns:** `Promise<FeeBucket>` - Fee bucket information

**Example:**
```typescript
const feeBucket = await accountApi.getFeeBucket(123);
console.log('Fee bucket:', feeBucket);
```

### isWhitelisted(accountIndex: number)

Checks if an account is whitelisted.

**Parameters:**
- `accountIndex: number` - Account index

**Returns:** `Promise<{ is_whitelisted: boolean }>` - Whitelist status

**Example:**
```typescript
const { is_whitelisted } = await accountApi.isWhitelisted(123);
console.log('Is whitelisted:', is_whitelisted);
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

### changeAccountTier(accountIndex: number, newTier: string, auth: string)

Changes the account tier (e.g., upgrade to premium tier).

**Parameters:**
- `accountIndex: number` - Account index
- `newTier: string` - New tier name (e.g., 'premium', 'standard')
- `auth: string` - Authentication token (use `SignerClient.createAuthToken()`)

**Returns:** `Promise<any>` - Change tier response

**Example:**
```typescript
// First, create an auth token
const signerClient = new SignerClient({ /* config */ });
await signerClient.initialize();
const authToken = await signerClient.createAuthToken();

// Then change tier
const result = await accountApi.changeAccountTier(123, 'premium', authToken);
console.log('Tier changed:', result);
```

## Types

### AccountParams

```typescript
interface AccountParams {
  by: 'index' | 'l1_address';
  value: string;
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
import { ApiClient, AccountApi } from 'lighter-ts-sdk';

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
    const apiKeys = await accountApi.getApiKeys(123, 0);
    console.log('API keys:', apiKeys.api_keys);

    // Get PnL
    const pnl = await accountApi.getPnL(123);
    console.log('PnL:', pnl);

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
