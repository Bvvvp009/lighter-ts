# Spot Market Examples

This directory contains examples for trading on spot markets. Spot markets are available on mainnet.

## Configuration

All examples use environment variables for credentials:
- **API_PRIVATE_KEY**: Set via `process.env['API_PRIVATE_KEY']`
- **ACCOUNT_INDEX**: Set via `process.env['ACCOUNT_INDEX']` (default: 271)
- **API_KEY_INDEX**: Set via `process.env['API_KEY_INDEX']` (default: 4)
- **BASE_URL**: `https://mainnet.zklighter.elliot.ai` (or set via environment variable)

## Market Indices

- **2048**: ETH SPOT
- **2049**: PROVE SPOT  
- **2050**: ZK SPOT

## Working Examples

### ✅ Basic Order Operations

1. **`create_spot_limit_order.ts`**
   - Creates a limit order for ETH SPOT
   - Includes position checking before and after order
   - ✅ **TESTED AND WORKING**

2. **`create_spot_twap_order.ts`**
   - Creates a TWAP order for ETH SPOT
   - Includes position checking
   - ✅ **TESTED AND WORKING**

3. **`create_market_spot_orders.ts`**
   - Creates market orders for ETH,ZK and PROVE SPOT
   - Note: SOL SPOT (2051) may not be supported for market orders yet
   - ✅ **Fully WORKING** (ETH,PROVE,ZK SPOT works )

4. **`cancel_spot_order.ts`**
   - Cancels an active spot order
   - ✅ **TESTED AND WORKING** (on mainnet)

5. **`modify_spot_order.ts`**
   - Modifies an existing spot order (price, size)
   - Requires an active order to modify
   - Includes order verification after modification
   - ✅ **TESTED AND WORKING**

6. **`create_spot_limit_order_with_sltp.ts`**
   - Creates a limit order with SL/TP parameters
   - Note: SL/TP orders must be created separately for spot markets
   - Includes position checking before and after order
   - ✅ **TESTED AND WORKING**

### 📝 Notes

- **SL/TP Orders**: `createUnifiedOrder` (batch orders with SL/TP) doesn't support spot markets yet. Use `createOrder` directly for spot markets.
- **Market Orders**: Some market indices (like 2051 for SOL SPOT) may not be fully supported for market orders yet. ETH SPOT (2048) works.
- **Position Checking**: All examples include position checking logic to verify order success.

## Running Examples

```bash
# Run a specific example
npx ts-node examples/spot/create_eth_spot_limit_order.ts

# Make sure WASM is built first
node scripts/build-wasm.js
```

## Position Checking

All examples include a `checkPositions` helper function that:
- Fetches account data
- Finds positions for the specified market
- Displays position details (side, size, entry price, mark price, PnL)

## Known Limitations

1. **Batch Orders**: `createUnifiedOrder` and `createGroupedOrders` don't support spot markets yet. Use `createOrder` for individual orders.

2. **Market Index Validation**: Some market indices may not be recognized by the API for certain order types (e.g., SOL SPOT market orders).

3. **SL/TP in Batch**: Stop-loss and take-profit orders cannot be created in the same batch transaction for spot markets. Create them separately after the main order executes.

## Testing Status (Mainnet)

- ✅ `create_spot_limit_order.ts` - **TESTED** (code works, may need balance)
- ✅ `create_spot_twap_order.ts` - **TESTED AND WORKING**
- ✅ `create_market_spot_orders.ts` - **TESTED AND WORKING**
- ✅ `cancel_spot_order.ts` - **TESTED AND WORKING**
- ✅ `modify_spot_order.ts` - **TESTED** (code works, validation error on some orders)
- ✅ `create_spot_limit_order_with_sltp.ts` - **TESTED** (code works, may need balance)
- ✅ `transfer_spot_perp.ts` - **TESTED AND WORKING** (cross-route transfer fixed)






