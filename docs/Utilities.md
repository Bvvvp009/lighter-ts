# Utility Functions and Helpers

Utility functions for checking order status, formatting results, and understanding cancel reasons.

## Order Status Checker

### checkOrderStatus()

Checks the status of an order by querying active and inactive orders.

**Function Signature:**
```typescript
async function checkOrderStatus(
  orderApi: OrderApi,
  accountIndex: number,
  marketId: number,
  clientOrderIndex: number | string,
  auth?: string,
  waitSeconds: number = 3
): Promise<OrderStatusResult>
```

**Parameters:**
- `orderApi: OrderApi` - OrderApi instance
- `accountIndex: number` - Account index
- `marketId: number` - Market ID
- `clientOrderIndex: number | string` - Client order index to search for
- `auth?: string` - Optional authentication token
- `waitSeconds: number` - How long to wait before checking (default: 3 seconds)

**Returns:** `Promise<OrderStatusResult>` - Order status information

**OrderStatusResult:**
```typescript
interface OrderStatusResult {
  found: boolean;              // Whether order was found
  status?: string;              // Order status (filled, active, cancelled, etc.)
  reason?: string;              // Human-readable status reason
  filledAmount?: string;        // Amount filled
  remainingAmount?: string;      // Amount remaining
  order?: any;                  // Full order object
}
```

**Example:**
```typescript
import { checkOrderStatus, OrderApi, ApiClient } from 'lighter-ts-sdk';

async function checkMyOrder() {
  const apiClient = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const orderApi = new OrderApi(apiClient);
  
  const result = await checkOrderStatus(
    orderApi,
    accountIndex,
    marketId,
    clientOrderIndex,
    auth,
    5 // Wait 5 seconds
  );
  
  if (result.found) {
    console.log(`Status: ${result.status}`);
    console.log(`Reason: ${result.reason}`);
    console.log(`Filled: ${result.filledAmount}`);
    console.log(`Remaining: ${result.remainingAmount}`);
  } else {
    console.log('Order not found');
  }
}
```

### getCancelReason()

Returns a human-readable description of the cancel reason.

**Function Signature:**
```typescript
function getCancelReason(status: string): string
```

**Supported Status Values:**
- `'filled'` → ✅ Order successfully filled
- `'active'` → ⏳ Order is active and pending
- `'canceled'` → ❌ Order was canceled
- `'canceled-post-only'` → ❌ Order was canceled due to post-only constraint
- `'canceled-reduce-only'` → ❌ Order was canceled due to reduce-only constraint
- `'canceled-position-not-allowed'` → ❌ Position not allowed
- `'canceled-margin-not-allowed'` → ❌ Insufficient margin
- `'canceled-too-much-slippage'` → ❌ Too much slippage - execution price exceeded limit
- `'canceled-not-enough-liquidity'` → ❌ Not enough liquidity in the market
- `'canceled-self-trade'` → ❌ Self-trade detected
- `'canceled-expired'` → ❌ Order expired
- `'canceled-oco'` → ❌ OCO constraint violated
- `'canceled-child'` → ❌ Child order constraint violated
- `'canceled-liquidation'` → ❌ Liquidation constraint

**Example:**
```typescript
import { getCancelReason } from 'lighter-ts-sdk';

const reason = getCancelReason('canceled-too-much-slippage');
console.log(reason);
// Output: ❌ Too much slippage - execution price exceeded limit
```

### formatOrderResult()

Formats order result for logging.

**Function Signature:**
```typescript
function formatOrderResult(result: OrderStatusResult, clientOrderIndex: number): string
```

**Parameters:**
- `result: OrderStatusResult` - Order status result
- `clientOrderIndex: number` - Client order index

**Returns:** `string` - Formatted message

**Example:**
```typescript
import { checkOrderStatus, formatOrderResult } from 'lighter-ts-sdk';

const result = await checkOrderStatus(orderApi, accountIndex, marketId, clientOrderIndex, auth);
const message = formatOrderResult(result, clientOrderIndex);
console.log(message);

// Output examples:
// "✅ Order 1234567890123 successfully filled!"
// "❌ Order 1234567890123 failed - ❌ Too much slippage"
// "⏳ Order 1234567890123 status: active"
```

## Complete Usage Example

```typescript
import { 
  SignerClient, 
  OrderApi, 
  ApiClient, 
  checkOrderStatus, 
  getCancelReason,
  formatOrderResult 
} from 'lighter-ts-sdk';

async function createAndCheckOrder() {
  const signerClient = new SignerClient({...});
  await signerClient.initialize();
  await signerClient.ensureWasmClient();
  
  const apiClient = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const orderApi = new OrderApi(apiClient);
  
  // Create order
  const CLIENT_ORDER_INDEX = Date.now();
  const result = await signerClient.createUnifiedOrder({
    marketIndex: 0,
    clientOrderIndex: CLIENT_ORDER_INDEX,
    baseAmount: 10000,
    isAsk: false,
    orderType: OrderType.MARKET,
    idealPrice: 400000,
    maxSlippage: 0.001
  });
  
  if (!result.success) {
    console.error('Order failed:', result.mainOrder.error);
    return;
  }
  
  console.log('✅ Order submitted:', result.mainOrder.hash);
  
  // Wait for confirmation
  await signerClient.waitForTransaction(result.mainOrder.hash);
  
  // Check order status
  const auth = await signerClient.createAuthTokenWithExpiry(3600);
  const statusResult = await checkOrderStatus(
    orderApi,
    52548,
    0,
    CLIENT_ORDER_INDEX,
    auth,
    5
  );
  
  if (statusResult.found) {
    console.log(formatOrderResult(statusResult, CLIENT_ORDER_INDEX));
    
    if (statusResult.status === 'filled') {
      console.log('✅ Order filled successfully!');
    } else if (statusResult.status?.startsWith('canceled')) {
      console.log(getCancelReason(statusResult.status));
    }
  } else {
    console.log('⚠️ Order not found - may still be processing');
  }
  
  await signerClient.close();
}
```

## When to Use These Utilities

### Use `checkOrderStatus()` when:
- You need to verify order execution
- You want to check if an order filled or was canceled
- You need detailed order information
- You want to monitor order status in your application

### Use `getCancelReason()` when:
- You need to display user-friendly cancel reasons
- Building error messages or logging
- Debugging order failures

### Use `formatOrderResult()` when:
- Logging order status updates
- Building status dashboards
- Displaying order information to users

## Common Patterns

### Check Order After Creation
```typescript
const result = await signerClient.createUnifiedOrder(params);
if (result.success) {
  // Wait a bit for order to be processed
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Check status
  const status = await checkOrderStatus(orderApi, accountIndex, marketId, clientOrderIndex, auth);
  
  if (status.found && status.status === 'filled') {
    console.log('✅ Order executed successfully');
  }
}
```

### Check Multiple Orders
```typescript
const orderIndexes = [123, 456, 789];

for (const orderIndex of orderIndexes) {
  const status = await checkOrderStatus(orderApi, accountIndex, marketId, orderIndex, auth);
  
  if (status.found) {
    console.log(`Order ${orderIndex}: ${formatOrderResult(status, orderIndex)}`);
  }
}
```

### Handle Cancel Reasons
```typescript
const status = await checkOrderStatus(orderApi, accountIndex, marketId, clientOrderIndex, auth);

if (status.found && status.status?.startsWith('canceled')) {
  const reason = getCancelReason(status.status);
  console.error(`Order canceled: ${reason}`);
  
  // Take appropriate action based on reason
  if (status.status === 'canceled-too-much-slippage') {
    console.log('Try adjusting your price or slippage tolerance');
  }
}
```

