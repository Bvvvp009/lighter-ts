# Margin Management Guide

This guide explains margin modes, direction constants, and practical workflows for managing collateral on Lighter Protocol.

## Table of Contents

- [Margin Modes](#margin-modes)
- [Direction Constants](#direction-constants)
- [Cross-Margin Operations](#cross-margin-operations)
- [Isolated-Margin Operations](#isolated-margin-operations)
- [Switching Between Modes](#switching-between-modes)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Margin Modes

Lighter Protocol supports two collateral management modes:

### Cross-Margin Mode (Mode 0)

```typescript
SignerClient.CROSS_MARGIN_MODE = 0
```

**Characteristics:**
- Collateral is shared across all markets
- Leverage is set per-market but uses shared collateral pool
- No per-market collateral management needed
- Simpler for most traders
- Liquidation risk uses account-level balance

**When to use:**
- Portfolio-level risk management
- Multiple markets with correlated risk
- Simpler automation logic

**Example:**
```typescript
// Set ETH to 5x leverage, cross-margin
const [info, hash, error] = await client.updateLeverage(
  0,  // marketIndex: ETH
  SignerClient.CROSS_MARGIN_MODE,  // mode: 0
  5   // leverage: 5x
);
```

### Isolated-Margin Mode (Mode 1)

```typescript
SignerClient.ISOLATED_MARGIN_MODE = 1
```

**Characteristics:**
- Each market has its own collateral pool
- Collateral must be added/removed explicitly per market
- Higher leverage possible (different margin fractions)
- More control, more management required
- Liquidation risk is per-market

**When to use:**
- Market-specific risk management
- Different leverage for different markets
- Protecting one position from affecting others

**Example:**
```typescript
// Set ETH to 20x leverage, isolated margin
const [info, hash, error] = await client.updateLeverage(
  0,  // marketIndex: ETH
  SignerClient.ISOLATED_MARGIN_MODE,  // mode: 1
  20  // leverage: 20x
);
```

## Direction Constants

The `direction` parameter in `updateMargin()` controls whether you're adding or removing collateral from an isolated-margin position.

### Available Directions

```typescript
// Add collateral to an isolated-margin position
SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL = 1

// Remove collateral from an isolated-margin position
SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL = 0
```

**Important:** Direction is only meaningful for isolated-margin positions. Cross-margin uses the account's total balance.

### Adding Collateral (Direction = 1)

```typescript
const [marginInfo, txHash, error] = await client.updateMargin(
  marketIndex,  // Which market
  usdcAmount,   // How much USDC to add
  SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL  // Direction: 1
);

// Example: Add 500 USDC to BTC market (index 1)
const [info, hash, err] = await client.updateMargin(
  1,      // BTC market
  500,    // 500 USDC
  1       // Add collateral
);
```

**Use cases:**
- Increase collateral buffer as position grows
- Prevent liquidation during volatility
- React to position P&L changes

### Removing Collateral (Direction = 0)

```typescript
const [marginInfo, txHash, error] = await client.updateMargin(
  marketIndex,  // Which market
  usdcAmount,   // How much USDC to remove
  SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL  // Direction: 0
);

// Example: Remove 100 USDC from ETH market (index 0)
const [info, hash, err] = await client.updateMargin(
  0,      // ETH market
  100,    // Remove 100 USDC
  0       // Remove collateral
);
```

**Use cases:**
- Harvest profits from profitable positions
- Rebalance collateral between markets
- Recover capital for other uses

**Caution:** Ensure sufficient buffer remains to prevent liquidation.

## Cross-Margin Operations

### Setup Cross-Margin

```typescript
async function setupCrossMargin(marketIndex: number, leverage: number) {
  // Update leverage to cross-margin mode
  const [info, hash, error] = await client.updateLeverage(
    marketIndex,
    SignerClient.CROSS_MARGIN_MODE,  // 0
    leverage
  );
  
  if (error) {
    console.error('Failed to set cross-margin:', error);
    return;
  }
  
  // Wait for confirmation
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Cross-margin set to ${leverage}x`);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  }
}

// Usage
await setupCrossMargin(0, 5);  // ETH at 5x cross-margin
```

### Create Position in Cross-Margin

```typescript
async function createCrossMarginOrder(orderParams: any) {
  // No special collateral handling - uses account balance
  const result = await client.createOrder(orderParams);
  
  if (!result.hash) {
    console.error('Order failed:', result.error);
    return;
  }
  
  try {
    await client.waitForTransaction(result.hash, 30000);
    console.log('✅ Position opened with cross-margin collateral');
  } catch (error) {
    console.error('❌ Position failed:', error.message);
  }
}
```

### Monitor Cross-Margin Account

```typescript
async function monitoCrossMarginHealth() {
  const account = await client.getAccountMetadata();
  
  console.log('Cross-Margin Account Health:');
  console.log('  Total Collateral:', account.collateral);
  console.log('  Available Balance:', account.available_balance);
  console.log('  Margin Usage:', parseFloat(account.margin_usage) + '%');
  console.log('  Buying Power:', account.buying_power);
  
  const marginUsagePercent = parseFloat(account.margin_usage);
  if (marginUsagePercent > 80) {
    console.warn('⚠️ HIGH MARGIN USAGE - Close positions or add collateral');
  }
}
```

## Isolated-Margin Operations

### Setup Isolated-Margin

```typescript
async function setupIsolatedMargin(
  marketIndex: number,
  leverage: number,
  initialCollateral: number
) {
  // Step 1: Update leverage to isolated-margin mode
  console.log('Setting up isolated margin...');
  const [info, hash, error] = await client.updateLeverage(
    marketIndex,
    SignerClient.ISOLATED_MARGIN_MODE,  // 1
    leverage
  );
  
  if (error) {
    console.error('❌ Failed to set isolated margin:', error);
    return null;
  }
  
  console.log('⏳ Waiting for leverage update...');
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Isolated margin set to ${leverage}x`);
    return true;
  } catch (error) {
    console.error('❌ Leverage update failed:', error.message);
    return null;
  }
}

// Usage
const success = await setupIsolatedMargin(0, 20, 1000);  // ETH, 20x, 1000 USDC
```

### Create Position with Isolated-Margin

```typescript
async function createIsolatedMarginOrder(
  marketIndex: number,
  orderParams: any
) {
  // Step 1: Ensure isolated margin is active
  // (Should be done once during setup)
  
  // Step 2: Create the order (uses isolated collateral)
  const result = await client.createOrder(orderParams);
  
  if (!result.hash) {
    console.error('❌ Order creation failed:', result.error);
    return;
  }
  
  console.log('✅ Order submitted');
  
  // Step 3: Wait for confirmation
  try {
    await client.waitForTransaction(result.hash, 30000);
    console.log('✅ Position opened with isolated-margin collateral');
    
    // Step 4: Monitor position
    await monitorIsolatedPosition(marketIndex);
  } catch (error) {
    console.error('❌ Order failed:', error.message);
  }
}

async function monitorIsolatedPosition(marketIndex: number) {
  const account = await client.getAccountMetadata();
  
  // Get per-market stats
  const marketStats = account.market_accounts[marketIndex];
  
  console.log(`Isolated Margin Position (Market ${marketIndex}):`);
  console.log('  Collateral:', marketStats.collateral);
  console.log('  Position Value:', marketStats.portfolio_value);
  console.log('  Margin Usage:', parseFloat(marketStats.margin_usage) + '%');
  console.log('  Available Balance:', marketStats.available_balance);
}
```

### Add Collateral to Isolated Position

```typescript
async function addIsolatedCollateral(
  marketIndex: number,
  usdcAmount: number
) {
  console.log(`Adding ${usdcAmount} USDC to market ${marketIndex}...`);
  
  const [info, hash, error] = await client.updateMargin(
    marketIndex,
    usdcAmount,
    SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL  // Direction: 1
  );
  
  if (error) {
    console.error('❌ Failed to add collateral:', error);
    return;
  }
  
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Added ${usdcAmount} USDC`);
    
    // Verify new collateral
    const account = await client.getAccountMetadata();
    const marketStats = account.market_accounts[marketIndex];
    console.log('  New Collateral:', marketStats.collateral);
    console.log('  New Margin Usage:', parseFloat(marketStats.margin_usage) + '%');
  } catch (error) {
    console.error('❌ Collateral update failed:', error.message);
  }
}

// Usage: Add 200 USDC to prevent liquidation
await addIsolatedCollateral(0, 200);
```

### Remove Collateral from Isolated Position

```typescript
async function removeIsolatedCollateral(
  marketIndex: number,
  usdcAmount: number
) {
  // First verify we have enough available balance
  const account = await client.getAccountMetadata();
  const marketStats = account.market_accounts[marketIndex];
  const available = parseFloat(marketStats.available_balance);
  
  if (available < usdcAmount) {
    console.error(
      `❌ Insufficient available balance. Available: ${available}, Requested: ${usdcAmount}`
    );
    return;
  }
  
  console.log(`Removing ${usdcAmount} USDC from market ${marketIndex}...`);
  
  const [info, hash, error] = await client.updateMargin(
    marketIndex,
    usdcAmount,
    SignerClient.ISOLATED_MARGIN_REMOVE_COLLATERAL  // Direction: 0
  );
  
  if (error) {
    console.error('❌ Failed to remove collateral:', error);
    return;
  }
  
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Removed ${usdcAmount} USDC`);
    
    // Verify remaining collateral
    const updatedAccount = await client.getAccountMetadata();
    const updatedStats = updatedAccount.market_accounts[marketIndex];
    console.log('  Remaining Collateral:', updatedStats.collateral);
    console.log('  Margin Usage:', parseFloat(updatedStats.margin_usage) + '%');
  } catch (error) {
    console.error('❌ Collateral removal failed:', error.message);
  }
}

// Usage: Harvest 100 USDC profit
await removeIsolatedCollateral(0, 100);
```

## Switching Between Modes

### Cross → Isolated

```typescript
async function switchCrossToIsolated(
  marketIndex: number,
  newLeverage: number
) {
  console.log(`Switching market ${marketIndex} to isolated margin...`);
  
  // This updates leverage AND switches mode
  const [info, hash, error] = await client.updateLeverage(
    marketIndex,
    SignerClient.ISOLATED_MARGIN_MODE,  // Switch to isolated
    newLeverage
  );
  
  if (error) {
    console.error('❌ Mode switch failed:', error);
    return;
  }
  
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Switched to isolated margin at ${newLeverage}x`);
  } catch (error) {
    console.error('❌ Switch failed:', error.message);
  }
}

// Usage: Switch to 20x isolated
await switchCrossToIsolated(0, 20);
```

### Isolated → Cross

```typescript
async function switchIsolatedToCross(
  marketIndex: number,
  newLeverage: number
) {
  console.log(`Switching market ${marketIndex} to cross margin...`);
  
  // Close or close-reduce isolated positions first if needed
  const [info, hash, error] = await client.updateLeverage(
    marketIndex,
    SignerClient.CROSS_MARGIN_MODE,  // Switch to cross
    newLeverage
  );
  
  if (error) {
    console.error('❌ Mode switch failed:', error);
    return;
  }
  
  try {
    await client.waitForTransaction(hash, 30000);
    console.log(`✅ Switched to cross margin at ${newLeverage}x`);
    
    // Isolated collateral converts back to account balance
    console.log('💡 Isolated collateral now part of cross-margin pool');
  } catch (error) {
    console.error('❌ Switch failed:', error.message);
  }
}

// Usage: Switch to 5x cross
await switchIsolatedToCross(0, 5);
```

## Best Practices

### 1. Always Check Available Balance Before Removing

```typescript
// ❌ DON'T: Just assume you have balance
await client.updateMargin(0, 100, 0);

// ✅ DO: Verify first
const account = await client.getAccountMetadata();
const available = parseFloat(account.market_accounts[0].available_balance);

if (available >= 100) {
  await client.updateMargin(0, 100, 0);
} else {
  console.error(`Insufficient balance: ${available}`);
}
```

### 2. Setup Mode Before Creating Positions

```typescript
// ✅ DO: Setup leverage/mode first
await client.updateLeverage(0, SignerClient.ISOLATED_MARGIN_MODE, 20);
await client.waitForTransaction(...);

// Then create position
await client.createOrder(orderParams);
```

### 3. Monitor Margin Health

```typescript
setInterval(async () => {
  const account = await client.getAccountMetadata();
  
  for (const market of account.market_accounts) {
    const usage = parseFloat(market.margin_usage);
    if (usage > 75) {
      console.warn(`⚠️ Market ${market.market_id}: ${usage}% margin usage`);
    }
  }
}, 30000);  // Check every 30 seconds
```

### 4. Use Reasonable Leverage

```typescript
// Margin requirement (IMF = Initial Margin Fraction)
// IMF = 10000 / leverage
// 
// For 20x: IMF = 10000/20 = 500 => 5% margin required
// For 5x:  IMF = 10000/5 = 2000 => 20% margin required

// ✅ Recommended: Start conservatively
const leverage = 5;  // 20% margin buffer
```

### 5. Close Positions Before Mode Switching

```typescript
// If switching an active market between modes, close position first
await client.createMarketOrder({
  marketIndex: 0,
  baseAmount: positionSize,
  isAsk: isLong ? true : false,  // Opposite direction
  reduceOnly: true
});

// Wait for execution
await client.waitForTransaction(result.hash, 30000);

// Then switch mode
await client.updateLeverage(0, newMode, newLeverage);
```

## Troubleshooting

### "Insufficient margin to add collateral"

**Problem**: Trying to add collateral but account has no balance
**Solution**: Deposit USDC to account first

```typescript
// Deposit to account
const [tx, hash, err] = await client.depositToSubaccount(usdcAmount);
```

### "Cannot remove collateral - would breach maintenance margin"

**Problem**: Position too close to liquidation
**Solution**: 
- Reduce position size first
- Add more collateral instead
- Close position entirely

```typescript
// Option 1: Close position to release collateral
await client.createMarketOrder({
  marketIndex,
  baseAmount: positionSize,
  isAsk: !isLong,
  reduceOnly: true
});

// Option 2: Reduce by 50%
await client.createMarketOrder({
  marketIndex,
  baseAmount: positionSize / 2,
  isAsk: !isLong,
  reduceOnly: true
});
```

### Direction Parameter Wrong (0 instead of 1)

**Problem**: Used wrong direction constant
**Solution**: Use SignerClient constants

```typescript
// ❌ WRONG: Magic numbers
await client.updateMargin(0, 100, 0);  // Confusing - is this add or remove?

// ✅ RIGHT: Use constants
await client.updateMargin(
  0,
  100,
  SignerClient.ISOLATED_MARGIN_ADD_COLLATERAL
);
```

### Cannot Switch Mode - Position Still Open

**Problem**: Trying to switch modes with active positions
**Solution**: Close positions first

```typescript
// Close all positions on market first
await client.createMarketOrder({
  marketIndex: 0,
  baseAmount: getCurrentPositionSize(),
  isAsk: isCurrentlyLong(),
  reduceOnly: true
});

// Wait and verify closed
await client.waitForTransaction(result.hash, 30000);

// Now switch mode
await client.updateLeverage(0, newMode, newLeverage);
```

## Summary

**Cross-Margin (Mode 0):**
- Shared collateral pool across markets
- Simpler to manage
- Good for correlated positions

**Isolated-Margin (Mode 1):**
- Per-market collateral pools
- Add/Remove collateral explicitly with direction
- More control over per-market risk

**Direction Constants:**
- `1` = Add collateral (increase margin buffer)
- `0` = Remove collateral (harvest or rebalance)

**Always:**
1. Check available balance before removing
2. Monitor margin usage regularly
3. Plan transitions between modes
4. Use SignerClient constants instead of magic numbers

For more examples, see:
- `examples/update_margin.ts` - Basic margin operations
- `examples/update_margin_leverage.ts` - Mode switching
- `examples/multi_client_advanced.ts` - Multiple markets
