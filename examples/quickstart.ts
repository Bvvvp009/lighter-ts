/**
 * Quickstart: the smallest possible end-to-end flow with the Lighter TypeScript SDK.
 *
 * Places a small limit order priced well away from the market (so it won't fill),
 * waits for it to confirm on-chain, then cancels it. No OTOCO/SL-TP, no grouped
 * orders — just initialize -> create -> confirm -> cancel -> close.
 *
 * Run: npx tsx examples/quickstart.ts
 */

import { SignerClient, OrderType, resolveNetworkFromEnv } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function quickstart() {
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required. See .env.example.');
  }
  const ACCOUNT_INDEX = Number.parseInt(process.env['ACCOUNT_INDEX'] ?? '0', 10);
  const API_KEY_INDEX = Number.parseInt(process.env['API_KEY_INDEX'] ?? '0', 10);
  // Network is driven by LIGHTER_NETWORK in .env (mainnet | testnet | robinhood).
  // Passing `network` lets SignerClient pick the host and the signing chain_id.
  const network = resolveNetworkFromEnv();
  console.log(`Using Lighter network: ${network.name} (${network.apiUrl}, chain_id ${network.chainId})`);
  const MARKET_INDEX = 0; // ETH/USDC perp

  const signerClient = new SignerClient({
    network,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    console.log('1. Placing a small limit BUY order, priced well below market (so it rests, not fills)...');

    // Market 0 (ETH/USDC perp): size_decimals=4, price_decimals=2, min_base_amount=0.0050 ETH,
    // min_quote_amount=$10. baseAmount/price are both scaled integers: 100 -> 0.0100 ETH, 120000 -> $1,200.00.
    const clientOrderIndex = Date.now();
    const [, orderHash, orderErr] = await signerClient.createOrder({
      marketIndex: MARKET_INDEX,
      clientOrderIndex,
      baseAmount: 100, // 0.0100 ETH
      price: 120000, // $1,200.00 - adjust to something below current market price for your asset
      isAsk: false, // BUY
      orderType: OrderType.LIMIT,
    });

    if (orderErr || !orderHash) {
      console.error('❌ Order failed:', orderErr);
      return;
    }
    console.log('✅ Order submitted:', orderHash);

    console.log('\n2. Waiting for on-chain confirmation (can take up to ~2 minutes)...');
    await signerClient.waitForTransaction(orderHash, 120000, 3000);
    console.log('✅ Order confirmed on-chain.');

    console.log('\n3. Looking up the order to cancel it...');
    const orderApi = (signerClient as any).orderApi;
    const auth = await signerClient.createAuthToken();
    const activeOrders = await orderApi.getAccountActiveOrders(ACCOUNT_INDEX, MARKET_INDEX, auth);
    const ourOrder = activeOrders.find((o: any) => o.client_order_index === clientOrderIndex);

    if (!ourOrder) {
      console.log('ℹ️  Order not found in active orders (it may have already been cancelled or filled).');
      return;
    }

    console.log('\n4. Cancelling the order...');
    const [, cancelHash, cancelErr] = await signerClient.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex: ourOrder.order_index,
    });

    if (cancelErr) {
      console.error('❌ Cancel failed:', cancelErr);
      return;
    }
    console.log('✅ Order cancelled:', cancelHash);

    console.log('\n🎉 Quickstart complete! See examples/README.md for everything else the SDK can do.');
  } finally {
    await signerClient.close();
  }
}

const isMain = process.argv[1]?.includes('quickstart');
if (isMain) {
  quickstart().catch(console.error);
}

export { quickstart };
