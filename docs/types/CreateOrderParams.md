# CreateOrderParams

Parameters for creating a limit order using the `SignerClient.createOrder()` method.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `marketIndex` | `number` | Yes | Market index (0 for ETH/USDC) |
| `clientOrderIndex` | `number` | Yes | Unique client order index |
| `baseAmount` | `number` | Yes | Base amount in smallest unit |
| `price` | `number` | Yes | Order price in smallest unit |
| `isAsk` | `boolean` | Yes | True for sell orders, false for buy orders |
| `orderType` | `number` | Yes | Order type (use `SignerClient.ORDER_TYPE_LIMIT`) |
| `timeInForce` | `number` | Yes | Time in force (use `SignerClient.ORDER_TIME_IN_FORCE_*`) |
| `reduceOnly` | `boolean` | Yes | Whether this is a reduce-only order |
| `triggerPrice` | `number` | Yes | Trigger price for conditional orders |
| `orderExpiry` | `number` | Yes | Order expiry timestamp |

## Example

```typescript
import { SignerClient } from 'lighter-ts-sdk';

const orderParams: CreateOrderParams = {
  marketIndex: 0, // ETH/USDC
  clientOrderIndex: Date.now(),
  baseAmount: 1000000, // 1 ETH in smallest unit
  price: 300000000, // $3000 in smallest unit
  isAsk: true, // Sell order
  orderType: SignerClient.ORDER_TYPE_LIMIT,
  timeInForce: SignerClient.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  reduceOnly: false,
  triggerPrice: SignerClient.NIL_TRIGGER_PRICE,
  orderExpiry: SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY
};

const [tx, txHash, err] = await client.createOrder(orderParams);
```

## Notes

- `baseAmount` and `price` are in the smallest units (e.g., wei for ETH, micro-USDC for USDC)
- `clientOrderIndex` should be unique per client to avoid conflicts
- `triggerPrice` is used for conditional orders (stop loss, take profit)
- `orderExpiry` can be set to `SignerClient.DEFAULT_28_DAY_ORDER_EXPIRY` for 28-day expiry
- Use `SignerClient.NIL_TRIGGER_PRICE` for regular limit orders
