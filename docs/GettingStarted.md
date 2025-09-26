# Getting Started Guide

This guide will help you get up and running with the Lighter TypeScript SDK quickly.

## Prerequisites

- Node.js 16+ installed
- TypeScript 4.5+ (if using TypeScript directly)
- A Lighter account with some USDC deposited

## Installation

### Using npm

```bash
npm install lighter-ts-sdk
```

### Using yarn

```bash
yarn add lighter-ts-sdk
```

## Quick Start

### 1. Basic API Usage

```typescript
import { ApiClient, AccountApi } from 'lighter-ts-sdk';

async function main() {
  const client = new ApiClient({ host: 'https://mainnet.zklighter.elliot.ai' });
  const accountApi = new AccountApi(client);
  
  try {
    const account = await accountApi.getAccount({ by: 'index', value: '123' });
    console.log('Account:', account);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```

### 2. Trading with SignerClient

```typescript
import { SignerClient } from 'lighter-ts-sdk';

async function main() {
  const client = new SignerClient({
    url: 'https://mainnet.zklighter.elliot.ai',
    privateKey: 'your-api-key-private-key',
    accountIndex: 123,
    apiKeyIndex: 0,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  try {
    await client.initialize();
    await client.ensureWasmClient();

    // Create a market order
    const [tx, txHash, err] = await client.createMarketOrder({
      marketIndex: 0, // ETH/USDC
      clientOrderIndex: Date.now(),
      baseAmount: 1000000, // 1 ETH
      avgExecutionPrice: 300000000, // Max $3000
      isAsk: true // Sell order
    });

    if (err) {
      console.error('Order failed:', err);
      return;
    }

    console.log('Order created:', txHash);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
```

## Setup Process

### Step 1: Get Your Account Information

First, you need to obtain your account index and API key information. You can do this through the Lighter web app or by using the system setup example.

### Step 2: Generate API Keys

Use the system setup example to generate API keys:

```bash
npx ts-node examples/system_setup.ts
```

This will output something like:
```
BASE_URL = 'https://mainnet.zklighter.elliot.ai'
API_KEY_PRIVATE_KEY = '0x...' # Your generated API private key
ACCOUNT_INDEX = 595
API_KEY_INDEX = 1
```

### Step 3: Configure Your Environment

Create a `.env` file in your project root:

```env
BASE_URL=https://mainnet.zklighter.elliot.ai
API_PRIVATE_KEY=0x... # Your generated API private key
ACCOUNT_INDEX=595
API_KEY_INDEX=1
```

### Step 4: Start Trading

Now you can use the SDK to create orders:

```typescript
import { SignerClient } from 'lighter-ts-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new SignerClient({
  url: process.env.BASE_URL!,
  privateKey: process.env.API_PRIVATE_KEY!,
  accountIndex: parseInt(process.env.ACCOUNT_INDEX!),
  apiKeyIndex: parseInt(process.env.API_KEY_INDEX!),
  wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
});

// Your trading logic here...
```

## Common Patterns

### Error Handling

Always check for errors when calling SDK methods:

```typescript
const [tx, txHash, err] = await client.createOrder(params);
if (err) {
  console.error('Order creation failed:', err);
  return;
}
console.log('Order created successfully:', txHash);
```

### Async/Await Pattern

The SDK uses async/await throughout. Always use try/catch for error handling:

```typescript
try {
  const account = await accountApi.getAccount({ by: 'index', value: '123' });
  console.log('Account:', account);
} catch (error) {
  console.error('Failed to get account:', error.message);
}
```

### Resource Cleanup

Always close clients when done:

```typescript
try {
  // Your code here
} finally {
  await client.close();
}
```

## Examples

The SDK includes comprehensive examples in the `examples/` directory:

- `create_market_order.ts` - Basic market order creation
- `create_cancel_order.ts` - Limit order creation and cancellation
- `get_info.ts` - API information retrieval
- `system_setup.ts` - Account setup and API key generation
- `transfer_update_leverage.ts` - Account management operations
- `ws.ts` - WebSocket real-time data

Run any example with:

```bash
npx ts-node examples/[example-name].ts
```

## WebSocket Usage

For real-time data, use the WebSocket client:

```typescript
import { WsClient } from 'lighter-ts-sdk';

const wsClient = new WsClient({
  url: 'wss://mainnet.zklighter.elliot.ai/ws',
  accountIndex: 123,
  apiKeyIndex: 0,
  privateKey: 'your-api-key-private-key'
});

await wsClient.connect();

// Subscribe to order book updates
wsClient.subscribeOrderBook(0, (data) => {
  console.log('Order book update:', data);
});

// Subscribe to account updates
wsClient.subscribeAccount((data) => {
  console.log('Account update:', data);
});
```

## Troubleshooting

### Common Issues

1. **"WASM functions not properly registered"**
   - Ensure the WASM binary is built and accessible
   - Check that the `wasmPath` is correct

2. **"Invalid signature" errors**
   - Verify your API key private key is correct
   - Check that account index and API key index match your setup

3. **"Account not found" errors**
   - Ensure you have deposited USDC to create an account
   - Verify your account index is correct

4. **Network errors**
   - Check your internet connection
   - Verify the API URL is correct
   - Ensure you're using the correct network (mainnet vs testnet)

### Getting Help

- Check the [API documentation](docs/)
- Review the [examples](examples/)
- Join our [Discord community](https://discord.gg/lighter)
- Visit our [documentation site](https://docs.lighter.xyz)

## Next Steps

- Explore the [API documentation](docs/) for detailed method information
- Check out the [examples](examples/) for more complex use cases
- Learn about [WebSocket integration](docs/WsClient.md) for real-time data
- Review the [type definitions](docs/types/) for TypeScript support
