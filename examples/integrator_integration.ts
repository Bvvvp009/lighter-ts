/**
 * Builder/integrator fee integration example.
 *
 * Lighter lets an "integrator" (builder) account earn a share of the taker/
 * maker fees on orders it routes. Two pieces are required:
 *
 *   1. ONE-TIME PER TRADER: the trader's account signs an
 *      APPROVE_INTEGRATOR tx (tx type 45) naming the integrator's account
 *      index with fee caps + expiry. `signer.approveIntegrator(...)`.
 *   2. PER ORDER: the routing client includes the integrator index + fee
 *      fields in the signed order so the fee is attributed at match time.
 *      Set `integratorAccountIndex` / `integratorTakerFee` /
 *      `integratorMakerFee` on createOrder params (SignerClient, WsExecutor,
 *      and all MM strategies support this).
 *
 * Sub-commands (INTEGRATOR_OP env var, default "info"):
 *   info          show how the flow works + current env config
 *   approve       sign + submit the one-time APPROVE_INTEGRATOR tx
 *                 (INTEGRATOR_ACCOUNT_INDEX, INTEGRATOR_TAKER_FEE_BPS,
 *                  INTEGRATOR_MAKER_FEE_BPS, INTEGRATOR_EXPIRY_SECONDS)
 *   quote         place a single far-from-market POST_ONLY order carrying
 *                 integrator fields, then cancel it (proves attribution works)
 *
 * SECURITY: the approve tx caps the fees the integrator can ever charge;
 * keep the caps at or below what you negotiated and use a finite expiry.
 *
 * Run: npx tsx examples/integrator_integration.ts
 */
import * as dotenv from 'dotenv';
import {
  SignerClient,
  OrderApi,
  OrderType,
  TimeInForce,
  resolveNetworkFromEnv,
} from '../src';

dotenv.config();

const OP = (process.env.INTEGRATOR_OP || 'info').toLowerCase();
const INTEGRATOR_INDEX = parseInt(process.env.INTEGRATOR_ACCOUNT_INDEX || '0', 10);
// Fee units are MILLIONTHS (1e-6) of trade size per the partner-attribution
// spec: 50 = 0.5 bps, 200 = 2 bps, 500 = 5 bps, 1000 = 10 bps.
// Defaults: maker 0.5 bps (50) / taker 2 bps (200) — MM-viable maker edge
// with revenue on taker flow. Accept either raw millionths or a bps suffix
// via INTEGRATOR_TAKER_FEE / INTEGRATOR_TAKER_FEE_BPS.
function feeFromEnv(rawName: string, bpsName: string, fallback: number): number {
  if (process.env[rawName] !== undefined) return Math.round(parseFloat(process.env[rawName]!));
  if (process.env[bpsName] !== undefined) return Math.round(parseFloat(process.env[bpsName]!) * 100);
  return fallback;
}
const TAKER_FEE = feeFromEnv('INTEGRATOR_TAKER_FEE', 'INTEGRATOR_TAKER_FEE_BPS', 200);
const MAKER_FEE = feeFromEnv('INTEGRATOR_MAKER_FEE', 'INTEGRATOR_MAKER_FEE_BPS', 50);
const EXPIRY_SECONDS = parseInt(process.env.INTEGRATOR_EXPIRY_SECONDS || String(365 * 24 * 3600), 10);
const MARKET_ID = parseInt(process.env.MARKET_ID || '1', 10);

async function main(): Promise<void> {
  const network = resolveNetworkFromEnv();
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  const privateKey = process.env.API_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('API_PRIVATE_KEY is required');
  }

  console.log(`=== Integrator Integration — network=${network.name} account=${accountIndex} op=${OP} ===`);
  console.log(`Integrator account index: ${INTEGRATOR_INDEX} | taker cap: ${TAKER_FEE} (= ${(TAKER_FEE / 100).toFixed(1)} bps) | maker cap: ${MAKER_FEE} (= ${(MAKER_FEE / 100).toFixed(1)} bps)`);

  const signer = new SignerClient({
    network: network.name as any,
    privateKey,
    accountIndex,
    apiKeyIndex,
  });
  await signer.initialize();
  await signer.ensureWasmClient();

  if (OP === 'info') {
    console.log(`
Integrator (builder) fee flow (https://apidocs.rh.lighter.xyz/docs/partner-attribution):
  1. INTEGRATOR_OP=approve npx tsx examples/integrator_integration.ts
     -> trader signs tx type 45 (APPROVE_INTEGRATOR) with fee caps + expiry.
        Env: INTEGRATOR_ACCOUNT_INDEX (required), INTEGRATOR_TAKER_FEE /
             INTEGRATOR_MAKER_FEE (millionths; defaults taker 200 = 2 bps,
             maker 50 = 0.5 bps, applied to perps AND spot),
             INTEGRATOR_EXPIRY_SECONDS (default 1y).
        Caps are validated against systemConfig before signing. L2 signature
        only when the integrator shares the trader's L1 address (or fees are
        zero); a cross-L1 integrator needs ETH_PRIVATE_KEY for one L1 sig.
  2. Route orders with integrator fields — all MM strategies pick these up
     from the same env vars (INTEGRATOR_ACCOUNT_INDEX + fee vars), and
     SignerClient.createOrder accepts integratorAccountIndex /
     integratorTakerFee / integratorMakerFee directly. Fees charged must
     not exceed the approved caps.
  3. INTEGRATOR_OP=quote places one attributed POST_ONLY order far from
     market and cancels it — a no-risk attribution test.`);
    await signer.close();
    return;
  }

  if (INTEGRATOR_INDEX <= 0) {
    throw new Error('INTEGRATOR_ACCOUNT_INDEX is required for approve/quote ops');
  }

  if (OP === 'approve') {
    const expiry = Date.now() + EXPIRY_SECONDS * 1000; // ms unix timestamp
    console.log(`Approving integrator ${INTEGRATOR_INDEX} until unix-ms ${expiry}...`);
    const [approveInfo, txHash, err] = await signer.approveIntegrator({
      integratorIndex: INTEGRATOR_INDEX,
      maxPerpsTakerFee: TAKER_FEE,
      maxPerpsMakerFee: MAKER_FEE,
      maxSpotTakerFee: TAKER_FEE,
      maxSpotMakerFee: MAKER_FEE,
      approvalExpiry: expiry,
      ...(process.env.ETH_PRIVATE_KEY ? { ethPrivateKey: process.env.ETH_PRIVATE_KEY } : {}),
    });
    if (err) {
      console.error(`Approve FAILED: ${err}`);
      process.exit(1);
    }
    console.log(`Approve submitted: txHash=${txHash}`);
    console.log(JSON.stringify(approveInfo, null, 2));
    await signer.close();
    return;
  }

  if (OP === 'quote') {
    const orderApi = (signer as any).orderApi as OrderApi;
    const details = await orderApi.getOrderBookDetailsRaw(MARKET_ID);
    const d = details.order_book_details?.[0];
    if (!d) throw new Error(`Market ${MARKET_ID} not found`);
    const last = Number(d.last_trade_price);
    const baseScale = Math.pow(10, d.size_decimals);
    const quoteScale = Math.pow(10, d.price_decimals);
    const minBase = Math.ceil(parseFloat(d.min_base_amount) * baseScale);
    const minQuote = parseFloat(d.min_quote_amount || '0');

    // Far-from-market bid (50% of last) so it rests; sized above minQuote
    let baseAmount = Math.max(minBase, Math.ceil((minQuote / (last * 0.5)) * baseScale));
    const bidPrice = Math.round(last * 0.5 * quoteScale) / quoteScale;

    console.log(`Placing attributed POST_ONLY BID ${baseAmount} units @ $${bidPrice.toFixed(2)} (minQuote=$${minQuote})...`);
    const clientOrderIndex = Date.now();
    const [, txHash, createErr] = await signer.createOrder({
      marketIndex: MARKET_ID,
      clientOrderIndex,
      baseAmount,
      price: Math.round(bidPrice * quoteScale),
      isAsk: false,
      orderType: OrderType.LIMIT,
      timeInForce: TimeInForce.POST_ONLY,
      integratorAccountIndex: INTEGRATOR_INDEX,
      integratorTakerFee: TAKER_FEE,
      integratorMakerFee: MAKER_FEE,
    } as any);
    if (createErr || !txHash) {
      console.error(`Order FAILED: ${createErr}`);
      process.exit(1);
    }
    console.log(`Order placed with integrator attribution: txHash=${txHash}`);

    // Wait for the order to index, then cancel it
    await new Promise((r) => setTimeout(r, 4000));
    const auth = await signer.createAuthToken();
    const active = await orderApi.getAccountActiveOrders(accountIndex, MARKET_ID, auth);
    const ours = (active as any[]).find((o: any) => o.client_order_index === clientOrderIndex);
    if (ours) {
      console.log(`Order active: orderIndex=${ours.order_index} — cancelling...`);
      const [, cancelHash, cancelErr] = await signer.cancelOrder({
        marketIndex: MARKET_ID,
        orderIndex: ours.order_index,
      });
      console.log(cancelErr ? `Cancel FAILED: ${cancelErr}` : `Cancelled: ${cancelHash}`);
    } else {
      console.log('Order not found in active orders (may have been rejected as post-only) — running cancel-all as a precaution');
      await signer.cancelAllOrders(0, 0, -1, MARKET_ID);
    }
    await signer.close();
    return;
  }

  throw new Error(`Unknown INTEGRATOR_OP "${OP}". Valid: info | approve | quote`);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});