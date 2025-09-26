# Account

Account information returned by the `AccountApi.getAccount()` method.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `index` | `string` | Account index |
| `l1_address` | `string` | Ethereum L1 address |
| `l2_address` | `string` | Lighter L2 address |
| `sub_accounts` | `SubAccount[]` | Sub-accounts associated with this account |
| `positions` | `AccountPosition[]` | Current positions |
| `trades` | `Trade[]` | Recent trades |

## Example

```typescript
import { AccountApi } from 'lighter-ts-sdk';

const accountApi = new AccountApi(client);
const account = await accountApi.getAccount({ by: 'index', value: '123' });

console.log('Account Index:', account.index);
console.log('L1 Address:', account.l1_address);
console.log('L2 Address:', account.l2_address);
console.log('Positions:', account.positions.length);
console.log('Recent Trades:', account.trades.length);
```

## Related Types

### SubAccount

```typescript
interface SubAccount {
  index: string;
  l1_address: string;
  l2_address: string;
}
```

### AccountPosition

```typescript
interface AccountPosition {
  market_id: number;
  side: 'long' | 'short';
  size: string;
  entry_price: string;
  mark_price: string;
  pnl: string;
}
```

### Trade

```typescript
interface Trade {
  trade_id: string;
  market_index: number;
  price: string;
  size: string;
  timestamp: string;
  side: 'buy' | 'sell';
}
```
