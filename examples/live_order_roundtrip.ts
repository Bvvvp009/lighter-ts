/**
 * Live order round-trip test — places a real limit order on Robinhood,
 * verifies it appears in the WS account_orders channel, then cancels it.
 *
 * SAFE: prices far from market (50% of last trade), so it rests and never fills.
 *
 * Run: npx tsx examples/live_order_roundtrip.ts
 */

import * as dotenv from 'dotenv';
import {
  SignerClient,
  WsPrivateClient,
  SignerAuthTokenProvider,
  OrderTracker,
  WsExecutor,
  resolveWsUrl,
  NETWORKS,
  WebSocketOrderClient,
  OrderType,
  TimeInForce,
} from '../src';

dotenv.config();

async function main() {
  const network = NETWORKS.robinhood;
  const privateKey = process.env.API_PRIVATE_KEY!;
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  const marketId = parseInt(process.env.MARKET_ID || '0', 10);

  console.log(`=== Live Order Round-Trip on Robinhood ===`);
  console.log(`Account: ${accountIndex} | Market: ${marketId}\n`);

  // 1. Create SignerClient
  const signer = new SignerClient({
    network: 'robinhood',
    privateKey,
    accountIndex,
    apiKeyIndex,
  });
  await signer.initialize();
  await signer.ensureWasmClient();
  console.log('SignerClient initialized');

  // 2. Get current price
  const orderApi = (signer as any).orderApi;
  const obDetails = await orderApi.getOrderBookDetails({ market_id: marketId });
  const lastPrice = obDetails.last_trade_price;
  console.log(`Last trade price: ${lastPrice}`);

  // 3. Place a limit BUY at 50% of last price (safe — rests, never fills).
  //
  // Sizes and prices go on the wire as scaled integers, and the scales are
  // per-market. This block used to hard-code `baseAmount = 1000` with a
  // `/ 1e6` display; on a 4-decimal market that is 0.1 ETH, not the 0.001 ETH
  // it claimed, and the venue rejected it for margin.
  const sizeDecimals = Number(obDetails.size_decimals);
  const priceDecimals = Number(obDetails.price_decimals);
  const baseScale = 10 ** sizeDecimals;
  const quoteScale = 10 ** priceDecimals;

  const bidPrice = Math.round(lastPrice * 0.5 * quoteScale) / quoteScale;

  // Both minimums are checked against the price the order is QUOTED at, not
  // against the mid — half of market is still a real price to the sequencer,
  // so a size that looks fine at the mid can be under min_quote_amount here.
  const minBase = Number(obDetails.min_base_amount);
  const minQuote = Number(obDetails.min_quote_amount);
  const baseAmount = Math.ceil(Math.max(minBase, minQuote / bidPrice) * baseScale);
  const baseHuman = baseAmount / baseScale;
  const clientOrderIndex = Date.now();

  console.log(
    `\nPlacing limit BUY ${baseHuman} ${obDetails.symbol} @ ${bidPrice} ` +
      `(50% of ${lastPrice}) = $${(baseHuman * bidPrice).toFixed(2)} notional`,
  );
  console.log(
    `  market mins: base >= ${minBase}, quote >= $${minQuote} | ` +
      `scales: base 1e${sizeDecimals}, price 1e${priceDecimals}`,
  );

  // 4. Set up WS tracking
  const wsUrl = resolveWsUrl(network);
  const wsPrivate = new WsPrivateClient({
    url: wsUrl,
    auth: new SignerAuthTokenProvider(signer),
    accountId: accountIndex,
  });
  await wsPrivate.connect();

  const tracker = new OrderTracker(accountIndex);

  // Listen for order events
  let orderPlacedReceived = false;
  let orderCanceledReceived = false;

  tracker.on('orderPlaced', (event: any) => {
    orderPlacedReceived = true;
    console.log(`  [TRACKER] orderPlaced: clientIdx=${event.order.clientOrderIndex} status=${event.order.status}`);
  });
  tracker.on('orderCanceled', (event: any) => {
    orderCanceledReceived = true;
    console.log(`  [TRACKER] orderCanceled: orderIdx=${event.order.orderIndex} reason=${event.reason}`);
  });

  // Subscribe to account orders
  const ordersSub = await wsPrivate.subscribeAccountOrders(marketId, accountIndex);
  ordersSub.on('update', (msg: any) => {
    console.log(`  [WS] account_orders update: type=${msg.type}`);
    tracker.onAccountOrdersMessage(msg);
  });

  // Also subscribe to positions
  const posSub = await wsPrivate.subscribeAccountAllPositions(accountIndex);
  posSub.on('update', (msg: any) => {
    tracker.onAccountAllPositionsMessage(msg);
  });

  // 5. Place the order via SignerClient (HTTP path — most reliable)
  const [txInfo, txHash, createError] = await signer.createOrder({
    marketIndex: marketId,
    clientOrderIndex,
    baseAmount,
    price: Math.round(bidPrice * quoteScale),
    isAsk: false,
    orderType: OrderType.LIMIT,
    timeInForce: TimeInForce.GOOD_TILL_TIME,
  });

  if (createError) {
    console.error(`Order creation failed: ${createError}`);
    await wsPrivate.destroy();
    await signer.close();
    process.exit(1);
  }

  console.log(`Order placed! txHash: ${txHash}`);
  tracker.registerOrder({
    clientOrderIndex,
    marketId,
    isAsk: false,
    price: bidPrice,
    baseAmount,
    orderType: 'limit',
    timeInForce: 'good-till-time',
  });

  // 6. Wait for WS to confirm the order
  console.log('\nWaiting 5s for WS confirmation...');
  await new Promise((r) => setTimeout(r, 5000));

  // 7. Verify order is visible via REST (needs auth token)
  const authToken = await signer.createAuthTokenWithExpiry();
  const activeOrders = await orderApi.getAccountActiveOrders(accountIndex, marketId, authToken);
  const ourOrder = activeOrders.find((o: any) => o.client_order_index === clientOrderIndex);
  if (ourOrder) {
    console.log(`REST confirms order is active: orderIndex=${ourOrder.order_index} price=${ourOrder.price} remaining=${ourOrder.remaining_base_amount}`);
  } else {
    console.log('Order not found in active orders (may have been rejected or already processed)');
  }

  // 8. Cancel the order
  if (ourOrder) {
    console.log(`\nCancelling order ${ourOrder.order_index}...`);
    const [, cancelHash, cancelError] = await signer.cancelOrder({
      marketIndex: marketId,
      orderIndex: ourOrder.order_index,
    });

    if (cancelError) {
      console.error(`Cancel failed: ${cancelError}`);
    } else {
      console.log(`Cancel sent! txHash: ${cancelHash}`);
    }

    // 9. Wait for WS to confirm the cancel
    console.log('Waiting 5s for WS cancel confirmation...');
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 10. Summary
  console.log('\n=== Results ===');
  console.log(`Order placed via HTTP: ${txHash ? 'YES' : 'NO'}`);
  console.log(`WS orderPlaced event: ${orderPlacedReceived ? 'YES' : 'NO'}`);
  console.log(`REST confirmed active: ${ourOrder ? 'YES' : 'NO'}`);
  console.log(`WS orderCanceled event: ${orderCanceledReceived ? 'YES' : 'NO'}`);

  // 11. Cleanup
  await wsPrivate.destroy();
  await signer.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});