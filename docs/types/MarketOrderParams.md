# MarketOrderParams

Parameters for creating a market order using the `SignerClient.createMarketOrder()` method.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `marketIndex` | `number` | Yes | Market index (0 for ETH/USDC) |
| `clientOrderIndex` | `number` | Yes | Unique client order index |
| `baseAmount` | `number` | Yes | Base amount in smallest unit |
| `avgExecutionPrice` | `number` | Yes | Maximum average execution price |
| `isAsk` | `boolean` | Yes | True for sell orders, false for buy orders |

## Example

```typescript
import { SignerClient } from '@lighter/typescript-sdk';

const marketOrderParams: MarketOrderParams = {
  marketIndex: 0, // ETH/USDC
  clientOrderIndex: Date.now(),
  baseAmount: 1000000, // 1 ETH in smallest unit
  avgExecutionPrice: 300000000, // Max $3000 average price
  isAsk: true // Sell order
};

const [tx, txHash, err] = await client.createMarketOrder(marketOrderParams);
```

## Notes

- `baseAmount` is in the smallest units (e.g., wei for ETH)
- `avgExecutionPrice` acts as a price limit to prevent excessive slippage
- Market orders are executed immediately at the best available price
- Use `avgExecutionPrice` to set a maximum price you're willing to pay/receive
