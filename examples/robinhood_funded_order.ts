/**
 * Robinhood FUNDED trading example — the real signed order round-trip.
 *
 * Prerequisite: robinhood_authenticated_smoke.ts (the no-op chain_id proof).
 * This goes one step further: with a funded account it places a REAL signed L2
 * limit order, waits for on-chain confirmation, verifies it is resting on the
 * book, then cancels it and verifies the cancel. That is the full create →
 * confirm → cancel trading loop — the actual proof that trading works on
 * Robinhood with chain_id 466324.
 *
 * SAFE BY DESIGN (no fill risk, minimal margin, everything released on cancel):
 *   - It only places a BUY (bid) priced at ~50% of the last trade price. A bid
 *     at half the market cannot cross the best ask, so it rests on the book and
 *     never fills. (A market crash of 50% would be required to fill it — and
 *     even then you'd just be buying ETH cheaply; there is no loss scenario.)
 *   - The order is the smallest legal size that meets the market's min notional
 *     (min_quote_amount). On Robinhood market 0 (ETH perp) that is ~$10 notional,
 *     so the reserved margin is only the initial-margin fraction of ~$10 — a
 *     dollar or two at most, well within the funded balance. The margin is
 *     released the moment the order is cancelled.
 *   - It refuses to guess a price: if it cannot read a live last-trade price it
 *     aborts rather than risk placing an order that could cross the market.
 *   - It never cancels by "cancel all" — it cancels only the single order it
 *     placed (by order_index), so your other orders (if any) are untouched.
 *
 * Requires in .env: LIGHTER_NETWORK=robinhood, API_PRIVATE_KEY, ACCOUNT_INDEX,
 * API_KEY_INDEX. The private key is read from env and never printed.
 *
 *   npx tsx examples/robinhood_funded_order.ts
 */

import { SignerClient, ApiClient, AccountApi, OrderApi, OrderType, resolveNetworkFromEnv } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

const MARKET_INDEX = 0; // ETH perp on Robinhood (same id as mainnet)

function extractTxHash(txHash: any): string {
  if (!txHash) return '';
  if (typeof txHash === 'string') return txHash;
  if (typeof txHash === 'object') return txHash.tx_hash || txHash.hash || '';
  return '';
}

function roundDownToTick(human: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(human * factor) / factor;
}
function roundUpToTick(human: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(human * factor) / factor;
}
function toScaledInt(human: number, decimals: number): number {
  return Math.round(human * Math.pow(10, decimals));
}

async function main() {
  const privateKey = process.env['API_PRIVATE_KEY'] || '';
  const accountIndex = parseInt(process.env['ACCOUNT_INDEX'] || '', 10);
  const apiKeyIndex = parseInt(process.env['API_KEY_INDEX'] || '', 10);
  if (!privateKey || !Number.isFinite(accountIndex) || !Number.isFinite(apiKeyIndex)) {
    console.error('❌ Missing API_PRIVATE_KEY / ACCOUNT_INDEX / API_KEY_INDEX in .env');
    process.exit(1);
  }

  const network = resolveNetworkFromEnv();
  if (network.name !== 'robinhood') {
    console.error(`❌ This example is for Robinhood. LIGHTER_NETWORK is '${network.name}'. Set LIGHTER_NETWORK=robinhood in .env.`);
    process.exit(1);
  }

  console.log('────────────────────────────────────────────────────────────');
  console.log(` network        : ${network.name}`);
  console.log(` api url        : ${network.apiUrl}`);
  console.log(` L2 signing id  : ${network.chainId}`);
  console.log(` account index  : ${accountIndex}`);
  console.log(` api key index  : ${apiKeyIndex}`);
  console.log(` market         : ${MARKET_INDEX} (ETH perp)`);
  console.log('────────────────────────────────────────────────────────────');

  const signerClient = new SignerClient({ network, privateKey, accountIndex, apiKeyIndex });
  await signerClient.initialize();
  await signerClient.ensureWasmClient();
  console.log('✅ WASM signer initialized');

  const apiClient = new ApiClient({ host: network.apiUrl });
  const accountApi = new AccountApi(apiClient);
  const orderApi = new OrderApi(apiClient);

  try {
    // ---- 1. Auth + account (prove creds, show funded balance) ----
    const auth = await signerClient.createAuthToken();
    const acc: any = await accountApi.getAccount({ by: 'index', value: String(accountIndex) }, auth);
    const available = Number(acc.available_balance ?? 0);
    console.log('\n=== account ===');
    console.log(`  available_balance : ${available} (free margin)`);
    console.log(`  total_asset_value : ${acc.total_asset_value}`);
    for (const a of acc.assets || []) {
      console.log(`  asset ${String(a.asset_id).padStart(2)} ${(a.symbol || '?').padEnd(6)} balance=${a.balance} margin_balance=${a.margin_balance} margin_mode=${a.margin_mode}`);
    }
    if (available <= 0) {
      console.error('\n❌ No available margin. Fund the account (USDG) before running this example.');
      process.exit(1);
    }

    // ---- 2. Market specs (min_base, min_quote, decimals) ----
    // getOrderBooks is typed OrderBook[] but Robinhood wraps it as {order_books:[...]}.
    const booksResp: any = await orderApi.getOrderBooks();
    const books: any[] = Array.isArray(booksResp) ? booksResp : (booksResp?.order_books || booksResp?.markets || []);
    const m = books.find((b) => b.market_id === MARKET_INDEX);
    if (!m) {
      console.error(`\n❌ Market ${MARKET_INDEX} not found in orderBooks (${books.length} markets).`);
      process.exit(1);
    }
    const minBase = Number(m.min_base_amount);
    const minQuote = Number(m.min_quote_amount);
    const sizeDec = Number(m.supported_size_decimals);
    const priceDec = Number(m.supported_price_decimals);
    console.log('\n=== market 0 specs ===');
    console.log(`  symbol=${m.symbol} status=${m.status} min_base=${minBase} min_quote=${minQuote} size_dec=${sizeDec} price_dec=${priceDec}`);

    // ---- 3. Live price (refuse to guess) ----
    const rt: any = await orderApi.getRecentTrades({ market_id: MARKET_INDEX, limit: 1 });
    const lastTrade = (rt?.trades || [])[0];
    if (!lastTrade || !lastTrade.price) {
      console.error('\n❌ No recent trades for market 0 — cannot determine a safe price. Aborting (will not guess).');
      process.exit(1);
    }
    const lastPrice = Number(lastTrade.price);
    console.log(`\n=== price ===\n  last trade price : ${lastPrice}`);

    // ---- 4. Compute a safe far-from-market resting bid ----
    // Bid at 50% of last price (cannot cross the ask → rests, never fills).
    const bidHuman = roundDownToTick(lastPrice * 0.5, priceDec);
    // Smallest size that meets min notional, rounded up to the size tick, and >= min_base.
    let baseHuman = roundUpToTick(Math.max(minBase, (minQuote * 1.05) / bidHuman), sizeDec);
    if (baseHuman < minBase) baseHuman = roundUpToTick(minBase, sizeDec);
    const notional = baseHuman * bidHuman;
    const baseRaw = toScaledInt(baseHuman, sizeDec);
    const priceRaw = toScaledInt(bidHuman, priceDec);
    // Pessimistic margin check: even at 50% IMR, reserved margin must stay < available.
    const pessimisticMargin = notional * 0.5;

    console.log('\n=== planned order (SAFE: rests, never fills; margin released on cancel) ===');
    console.log(`  side        : BUY (bid)`);
    console.log(`  price       : ${bidHuman}  (raw ${priceRaw})  — 50% of last trade ${lastPrice}`);
    console.log(`  base size   : ${baseHuman} ETH  (raw ${baseRaw})`);
    console.log(`  notional    : ${notional.toFixed(6)}  (min_quote ${minQuote})`);
    console.log(`  base >= min_base? ${baseHuman >= minBase}   notional >= min_quote? ${notional >= minQuote}`);
    console.log(`  est. margin (pessimistic 50% IMR): ${pessimisticMargin.toFixed(4)}  vs available ${available}`);
    if (pessimisticMargin >= available) {
      console.error('\n❌ Even a pessimistic margin estimate exceeds available balance. Aborting (top up USDG).');
      process.exit(1);
    }

    // ---- 5. Submit the signed L2 limit order ----
    const clientOrderIndex = Date.now();
    console.log(`\n→ submitting signed L2 createOrder (clientOrderIndex=${clientOrderIndex}) ...`);
    const [, orderHashRaw, orderErr] = await signerClient.createOrder({
      marketIndex: MARKET_INDEX,
      clientOrderIndex,
      baseAmount: baseRaw,
      price: priceRaw,
      isAsk: false, // BUY
      orderType: OrderType.LIMIT,
    });

    if (orderErr || !orderHashRaw) {
      const msg = String(orderErr || 'no hash');
      console.error(`\n❌ createOrder rejected: ${msg}`);
      if (/margin|balance|not enough/i.test(msg)) {
        console.error('   → margin/balance rejection. The order did NOT rest, so no funds are locked. Top up USDG and retry.');
      } else if (/min|size|amount|notional|tick/i.test(msg)) {
        console.error('   → size/tick/min-notional rejection. Order did not rest; no funds locked.');
      } else {
        console.error('   → other rejection. Order did not rest; no funds locked.');
      }
      process.exit(2);
    }
    const orderHash = extractTxHash(orderHashRaw);
    console.log(`✅ createOrder accepted by sequencer: ${orderHash}`);

    // ---- 6. Wait for on-chain confirmation ----
    console.log('\n→ waiting for on-chain confirmation ...');
    try {
      await signerClient.waitForTransaction(orderHash, 120000, 3000);
      console.log('✅ create confirmed on-chain');
    } catch (e: any) {
      console.error(`⚠️  confirmation wait failed: ${e?.message ?? e}`);
      console.error('   (submission succeeded = signature accepted; confirmation may just be slow.)');
    }

    // ---- 7. Verify the order is resting (retry briefly for read consistency) ----
    let ourOrder: any = null;
    for (let attempt = 1; attempt <= 5 && !ourOrder; attempt++) {
      const activeOrders = await orderApi.getAccountActiveOrders(accountIndex, MARKET_INDEX, auth);
      const arr7 = Array.isArray(activeOrders) ? activeOrders : (activeOrders as any).orders || [];
      ourOrder = arr7.find((o: any) => o.client_order_index === clientOrderIndex) || null;
      if (!ourOrder && attempt < 5) await new Promise((r) => setTimeout(r, 1500));
    }
    if (!ourOrder) {
      console.error('\n⚠️  Order not found in active orders after create. It may have filled or been rejected post-submission.');
      console.error('   Check your positions / inactive orders. (At a 50%-below-market bid a fill is not expected.)');
      process.exit(3);
    }
    console.log('\n=== order is resting on the book ===');
    console.log(`  order_index : ${ourOrder.order_index}`);
    console.log(`  side        : ${ourOrder.is_ask ? 'ASK' : 'BID'}  status: ${ourOrder.status}`);
    console.log(`  price       : ${ourOrder.price}  size: ${ourOrder.size ?? ourOrder.initial_base_amount ?? ourOrder.base_size ?? '?'}  remaining: ${ourOrder.remaining_size ?? '?'}`);

    // ---- 8. Cancel the single order we placed ----
    console.log(`\n→ cancelling order_index ${ourOrder.order_index} ...`);
    const [, cancelHashRaw, cancelErr] = await signerClient.cancelOrder({
      marketIndex: MARKET_INDEX,
      orderIndex: ourOrder.order_index,
    });
    if (cancelErr || !cancelHashRaw) {
      console.error(`\n❌ cancelOrder rejected: ${cancelErr || 'no hash'}`);
      console.error('   ⚠️  The order is still RESTING on the book. Cancel it manually (order_index above) or run cancel_all_orders.ts.');
      process.exit(4);
    }
    const cancelHash = extractTxHash(cancelHashRaw);
    console.log(`✅ cancelOrder accepted by sequencer: ${cancelHash}`);

    console.log('\n→ waiting for cancel confirmation ...');
    try {
      await signerClient.waitForTransaction(cancelHash, 120000, 3000);
      console.log('✅ cancel confirmed on-chain');
    } catch (e: any) {
      console.error(`⚠️  cancel confirmation wait failed: ${e?.message ?? e} (submission succeeded).`);
    }

    // ---- 9. Verify it's gone (retry to absorb read-after-write lag) ----
    let stillThere: any = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const activeAfter = await orderApi.getAccountActiveOrders(accountIndex, MARKET_INDEX, auth);
      const afterArr = Array.isArray(activeAfter) ? activeAfter : (activeAfter as any).orders || [];
      stillThere = afterArr.find((o: any) => o.client_order_index === clientOrderIndex);
      if (!stillThere) {
        console.log(`✅ order no longer in active orders (cancel confirmed, attempt ${attempt})`);
        break;
      }
      if (attempt < 6) {
        console.log(`   attempt ${attempt}: still listed (read replica may lag) — retrying in 2s ...`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (stillThere) {
      console.error('\n⚠️  Order still active after cancel + retries! Cancel it manually (order_index above) or run cancel_all_orders.ts.');
      process.exit(5);
    }

    // ---- 10. Final balance (margin released) ----
    const acc2: any = await accountApi.getAccount({ by: 'index', value: String(accountIndex) }, auth);
    console.log(`\n=== final balance ===\n  available_balance : ${acc2.available_balance} (was ${available} — margin released on cancel)`);

    console.log(`\nVERDICT: Robinhood funded trading works 🎉 — signed create + confirm + cancel with chain_id ${network.chainId}.`);
  } finally {
    await apiClient.close();
    await signerClient.close();
  }
}

const isMain = process.argv[1]?.includes('robinhood_funded_order');
if (isMain) {
  main().catch((e) => {
    console.error('funded_order failed:', e);
    process.exit(1);
  });
}

export { main as robinhoodFundedOrder };