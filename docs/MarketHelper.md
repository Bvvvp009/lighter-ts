# MarketHelper

The `MarketHelper` utility class simplifies working with market prices and amounts by automatically handling unit conversions. Initialize once and use throughout your application.

## Constructor

```typescript
new MarketHelper(marketIndex: number, orderApi: OrderApi)
```

**Parameters:**
- `marketIndex: number` - Market index (0 for ETH/USDC)
- `orderApi: OrderApi` - OrderApi instance for market data

## Methods

### initialize()

Fetches and caches market configuration. Must be called once before using other methods.

```typescript
await market.initialize();
```

**Example:**
```typescript
const orderApi = new OrderApi(apiClient);
const market = new MarketHelper(0, orderApi);
await market.initialize();
```

### priceToUnits(price: number)

Converts human-readable price to exchange units.

**Parameters:**
- `price: number` - Price in human-readable format (e.g., 4000 for $4000)

**Returns:** `number` - Price in exchange units

**Example:**
```typescript
const units = market.priceToUnits(4000); // 400000
```

### unitsToPrice(units: number)

Converts exchange units to human-readable price.

**Parameters:**
- `units: number` - Price in exchange units

**Returns:** `number` - Price in human-readable format

**Example:**
```typescript
const price = market.unitsToPrice(400000); // 4000
```

### amountToUnits(amount: number)

Converts human-readable amount to exchange units.

**Parameters:**
- `amount: number` - Amount in human-readable format (e.g., 0.01 for 0.01 ETH)

**Returns:** `number` - Amount in exchange units

**Example:**
```typescript
const units = market.amountToUnits(0.01); // 10000
```

### unitsToAmount(units: number)

Converts exchange units to human-readable amount.

**Parameters:**
- `units: number` - Amount in exchange units

**Returns:** `number` - Amount in human-readable format

**Example:**
```typescript
const amount = market.unitsToAmount(10000); // 0.01
```

### formatPrice(units: number, decimals?: number)

Formats price units for display.

**Parameters:**
- `units: number` - Price in exchange units
- `decimals?: number` - Number of decimal places (default: 2)

**Returns:** `string` - Formatted price string

**Example:**
```typescript
const formatted = market.formatPrice(400000, 2); // "4000.00"
```

### formatAmount(units: number, decimals?: number)

Formats amount units for display.

**Parameters:**
- `units: number` - Amount in exchange units
- `decimals?: number` - Number of decimal places (default: 4)

**Returns:** `string` - Formatted amount string

**Example:**
```typescript
const formatted = market.formatAmount(10000, 4); // "0.0100"
```

### get marketName()

Returns the market name (e.g., "ETH/USD").

```typescript
const name = market.marketName; // "ETH/USD"
```

### get lastPrice()

Returns the last trade price in exchange units.

```typescript
const price = market.lastPrice; // Latest price
```

### get baseAsset()

Returns the base asset symbol.

```typescript
const asset = market.baseAsset; // "ETH"
```

### get quoteAsset()

Returns the quote asset symbol.

```typescript
const asset = market.quoteAsset; // "USD"
```

## Complete Example

```typescript
import { ApiClient, OrderApi, MarketHelper } from 'lighter-ts-sdk';

async function example() {
  const apiClient = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const orderApi = new OrderApi(apiClient);
  
  // Initialize market helper once
  const market = new MarketHelper(0, orderApi);
  await market.initialize();
  
  // Get current price
  const currentPrice = market.unitsToPrice(market.lastPrice);
  console.log(`Current ${market.baseAsset} price: $${currentPrice}`);
  
  // Convert human-readable values to units
  const amount = market.amountToUnits(0.01);    // 0.01 ETH
  const price = market.priceToUnits(4000);      // $4000
  
  console.log(`Buying ${market.formatAmount(amount)} at $${market.formatPrice(price)}`);
  
  // Create order using market helper
  const result = await signerClient.createUnifiedOrder({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: amount,     // Already in units
    price: price,            // Already in units
    isAsk: false,            // BUY
    orderType: OrderType.LIMIT
  });
}
```

## Why Use MarketHelper?

**Without MarketHelper:**
```typescript
// Hard to remember conversions
const baseAmount = 0.01 * 1000000;  // Is this right?
const price = 4000 * 100;           // Or is it this?
```

**With MarketHelper:**
```typescript
// Simple and clear
const baseAmount = market.amountToUnits(0.01);  // Clear
const price = market.priceToUnits(4000);        // Clear
```

MarketHelper automatically handles:
- Correct scaling factors for each market
- Price decimal places
- Amount decimal places
- Display formatting
- Unit conversions

## Best Practices

1. **Initialize once** - Create one MarketHelper instance and reuse it
2. **Use for all conversions** - Never manually calculate units
3. **Format for display** - Use `formatPrice()` and `formatAmount()` for user display
4. **Check current price** - Use `lastPrice` to get the latest market price

