# Lighter TypeScript SDK Examples

Complete, working examples for trading on Lighter Protocol. Each example is production-ready with comprehensive error handling, status monitoring, and detailed logging.

## 🎯 What's in This Directory?

These examples show you how to use the Lighter TypeScript SDK to:
- Place orders (Market, Limit, TWAP)
- Set stop-loss and take-profit automatically
- Cancel orders
- Close positions
- Transfer funds
- Monitor transaction status

All examples follow the same patterns, so once you understand one, you understand them all.

**Example usage:**
```typescript
try {
  await signerClient.createUnifiedOrder(params);
} catch (error) {
  console.error(`❌ Error: ${trimException(error as Error)}`);
  // Clean, readable error message
}
```

## �� Example Overview

### Core Trading Examples
- **create_market_order.ts** - Create market orders with integrated SL/TP
- **create_limit_order.ts** - Create limit orders with integrated SL/TP  
- **create_twap_order.ts** - Create TWAP orders with integrated SL/TP
- **cancel_order.ts** - Cancel specific orders
- **cancel_all_orders.ts** - Cancel all open orders
- **close_position.ts** - Close specific positions
- **close_all_positions.ts** - Close all open positions

### Account Management Examples
- **create_with_multiple_keys.ts** - Create orders using multiple API keys
- **multi_client_advanced.ts** - Advanced multi-client operations (all new methods with multiple clients)
- **create_subaccount.ts** - Create a sub account from master account
- **deposit_to_subaccount.ts** - Deposit funds to subaccounts
- **deposit.ts** - Deposit funds to main account
- **withdraw_to_l1.ts** - Withdraw funds to L1 (Ethereum mainnet)
- **update_leverage.ts** - Update leverage and margin mode (CROSS/ISOLATED) for markets
- **update_margin.ts** - Add or remove margin from positions
- **change_account_tier.ts** - Upgrade to premium tier or revert to standard tier
- **public_pool_operations.ts** - Create, update, mint, and burn shares in public pools
- **modify_order.ts** - Modify existing orders without canceling
- **create_grouped_orders.ts** - Create OTO/OCO/OTOCO grouped orders

### Data & System Examples
- **market_data.ts** - Fetch market data, order books, trades, candlesticks
- **system_setup.ts** - Complete system setup and health checks
- **send_tx_batch.ts** - Send multiple transactions in batches

### WebSocket Examples
- **ws.ts** - Basic WebSocket connection and data streaming
- **ws_async.ts** - Async WebSocket operations with proper error handling
- **ws_send_tx.ts** - Send transactions via WebSocket
- **ws_send_batch_tx.ts** - Send batch transactions via WebSocket
- **ws_ping_pong.ts** - Ping-pong mechanism to keep connections alive

## 🚀 Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```
### Environment Variables
```bash
# Required
LIGHTER_URL=https://mainnet.zklighter.elliot.ai
PRIVATE_KEY=your_private_key_here
ACCOUNT_INDEX=your_account_index
API_KEY_INDEX=your_api_key_index

# Optional (for specific examples)
SUB_ACCOUNT_INDEX=1
DEPOSIT_AMOUNT=0.1
WITHDRAW_AMOUNT=0.1
L1_ADDRESS=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
ORDER_INDEX=12345
```

### Running Examples
```bash
# Run any example
npx ts-node examples/create_market_order.ts

# Run all examples (development)
npm run examples

# Run specific example category
npx ts-node examples/create_market_order.ts
npx ts-node examples/create_limit_order.ts
npx ts-node examples/create_twap_order.ts
```

## 🔧 Key Features

### WebSocket Connection Maintenance
For long-lived WebSocket connections, use the ping-pong mechanism to prevent disconnections:

```typescript
// Basic ping-pong setup
const pingInterval = setInterval(() => {
  wsClient.send({ type: 'ping' });
}, 30000); // Send ping every 30 seconds

// Handle pong responses
wsClient.onMessage = (message) => {
  if (message.type === 'pong') {
    console.log('Pong received - connection alive');
  }
};
```

### Unified Order System
All trading examples demonstrate the unified order system with integrated SL/TP:

```typescript
const orderParams: TransactionParams = {
  marketIndex: 0,
  clientOrderIndex: Date.now(),
  baseAmount: 1000,
  price: 4500,
  isAsk: false,
  orderType: OrderType.MARKET,
  timeInForce: TimeInForce.IMMEDIATE_OR_CANCEL,
  
  // Integrated SL/TP
  stopLoss: {
    price: 4200, // Set your desired SL price
    isLimit: true
  },
  takeProfit: {
    price: 4800, // Set your desired TP price
    isLimit: true
  }
};
```

### Transaction Status Monitoring
All examples include comprehensive transaction status monitoring using the SignerClient's built-in method:

```typescript
// Wait for transaction confirmation
await signerClient.waitForTransaction(txHash, 30000, 2000);
```

### Error Handling
Professional error handling with detailed logging:

```typescript
try {
  const result = await signerClient.createUnifiedOrder(orderParams);
  if (result.success) {
    console.log('✅ Order created successfully!');
  } else {
    console.error('❌ Order failed:', result.mainOrder.error);
  }
} catch (error) {
  console.error('❌ Error:', error);
}
```

## 📊 Example Categories

### 1. Trading Operations
- Market, Limit, and TWAP orders with SL/TP
- Order cancellation and position management
- All examples include transaction monitoring

### 2. Account Management
- Multi-API key operations
- Deposit and withdrawal operations
- Subaccount management
- Leverage and margin mode updates
- Account tier management (premium/standard)

### 3. Data & System
- Market data fetching
- System setup and health checks
- Batch transactions and WebSocket operations

## 🔒 Security Notes

- Never commit private keys to version control
- Use environment variables for sensitive data
- Test with small amounts first
- Monitor transaction status carefully

## 📈 Performance Tips

- Use batch transactions for multiple operations
- Implement proper error handling and retry logic
- Monitor WebSocket connections for real-time data
- Use appropriate timeouts for different operations

## 🆘 Troubleshooting

### Common Issues
1. **"go command not found"** - This is normal, the SDK handles WASM automatically
2. **Order expiry errors** - Ensure proper timestamp format
3. **WebSocket connection issues** - Check network connectivity and URL
4. **Transaction failures** - Verify account balance and permissions

### Getting Help
- Check the main SDK documentation
- Review error messages carefully
- Ensure all environment variables are set correctly
- Test with the system setup example first

## 🎯 Production Usage

These examples are designed for production use with:
- Comprehensive error handling
- Transaction status monitoring
- Professional logging
- Security best practices
- Performance optimizations
Each example can be adapted for your specific use case while maintaining the professional standards demonstrated.
