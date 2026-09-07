/**
 * Perpetual MM Strategy — Live run (hummingbot pure_mm style)
 *
 * Pure single-venue market maker: POST_ONLY bid + ask around the mid with
 * basis-point spreads, inventory skew, active unwind, and ONE cancel-and-
 * requote batch per user-defined cycle (single sendtxbatch WS message).
 *
 * Run: npx tsx examples/run_perp_mm_live.ts
 *
 * Env:
 *   LIGHTER_NETWORK=robinhood, API_PRIVATE_KEY (or API_PRIVATE_KEYS_JSON),
 *   ACCOUNT_INDEX, API_KEY_INDEX
 * Optional:
 *   RUN_MINUTES=15        run duration
 *   MARKET_ID=1           BTC perp
 *   MM_CYCLE_MS=12000     order-operations cycle (PRIMARY knob)
 *   MM_ORDER_SIZE=50      order size in base units
 *   MM_BID_SPREAD_BPS=10  bid half-spread (bps of mid)
 *   MM_ASK_SPREAD_BPS=10  ask half-spread (default: same as bid)
 *   MM_SKEW_BPS=20        inventory skew (bps per unit inventory ratio)
 *   MM_MAX_POSITION=100   max position in base units
 *   MM_REQUOTE_THRESHOLD=10  $ mid drift before a requote is due
 *   MM_LEVERAGE=3         leverage set on the venue at every startup
 *   MM_LOG_FILE=1         file logs in logs/ (default OFF; 1 or a path)
 *   MM_HOT_CONFIG=1       auto-filled mm-config.json, hot-reloaded each cycle
 *
 * Partner attribution (orders carry it by default — see docs/ATTRIBUTION.md):
 *   BUILDER_ATTRIBUTION=off       opt out entirely
 *   INTEGRATOR_ACCOUNT_INDEX=N    attribute to your own integrator account
 */

import * as dotenv from 'dotenv';
import {
  SignerClient,
  WsPrivateClient,
  SignerAuthTokenProvider,
  WsExecutor,
  OrderTracker,
  PerpetualMMStrategy,
  StatsAggregator,
  resolveNetworkFromEnv,
  resolveWsUrl,
} from '../src';
import {
  integratorFields,
  loadKeys,
  printAttributionDisclosureForNetworks,
  printSupportNoticeForNetwork,
  venueForNetwork,
} from './_attribution';
import { formatShutdownReport, shutdownExitCode } from './_shutdown';
import type { ShutdownLeg } from './_shutdown';
import { setupFileLogging } from './_logging';
import { setupHotConfig } from './_hotconfig';

dotenv.config();

const RUN_DURATION_MS = parseInt(process.env.RUN_MINUTES || '15', 10) * 60 * 1000;
const MARKET_ID = parseInt(process.env.MARKET_ID || '1', 10);
const ORDER_SIZE = parseInt(process.env.MM_ORDER_SIZE || '50', 10);
const CYCLE_MS = parseInt(process.env.MM_CYCLE_MS || '12000', 10);
const BID_SPREAD_BPS = parseFloat(process.env.MM_BID_SPREAD_BPS || '10');
const ASK_SPREAD_BPS = process.env.MM_ASK_SPREAD_BPS
  ? parseFloat(process.env.MM_ASK_SPREAD_BPS)
  : undefined;
const SKEW_BPS = parseFloat(process.env.MM_SKEW_BPS || '20');
const MAX_POSITION = parseInt(process.env.MM_MAX_POSITION || '100', 10);
const REQUOTE_THRESHOLD = parseFloat(process.env.MM_REQUOTE_THRESHOLD || '10');
const LEVERAGE_RAW = process.env.MM_LEVERAGE;
const LEVERAGE =
  LEVERAGE_RAW !== undefined && LEVERAGE_RAW !== ''
    ? (() => {
        const v = Number(LEVERAGE_RAW);
        if (!Number.isFinite(v) || v <= 0) throw new Error(`MM_LEVERAGE=${LEVERAGE_RAW} is not a positive number`);
        return v;
      })()
    : undefined;

async function main() {
  const network = resolveNetworkFromEnv();
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  const { privateKey, apiPrivateKeys } = loadKeys();
  // undefined on an unregistered network (testnets) — attribution stays off
  // there rather than guessing at a builder account.
  const venue = venueForNetwork(network.name);

  console.log(`=== Perpetual MM Strategy — Live (cycle ${CYCLE_MS}ms) ===`);
  console.log(`Network: ${network.name} | Market: ${MARKET_ID} | Account: ${accountIndex}`);
  console.log(`API keys: ${apiPrivateKeys ? Object.keys(apiPrivateKeys).join(', ') : `${apiKeyIndex} (single)`}`);
  console.log(`Order size: ${ORDER_SIZE} units | Bid spread: ${BID_SPREAD_BPS}bps${ASK_SPREAD_BPS ? ` | Ask spread: ${ASK_SPREAD_BPS}bps` : ' | Ask spread: same as bid'}`);
  console.log(`Skew: ${SKEW_BPS}bps | Max position: ${MAX_POSITION} units | Requote drift: $${REQUOTE_THRESHOLD}`);
  console.log(`Cycle: ${CYCLE_MS}ms (~${Math.floor(60000 / CYCLE_MS)}/min) | Mode: MAKER (POST_ONLY)`);
  // Layer 1: disclose what this run's orders will carry, before any is signed.
  // The WsExecutor stamps attribution whether or not this prints, so the
  // disclosure is the thing that keeps that from being covert.
  printAttributionDisclosureForNetworks(network.name);
  console.log(`Run duration: ${RUN_DURATION_MS / 60000} minutes`);
  console.log(`---`);

  const signerClient = new SignerClient({
    network: network.name as any,
    privateKey,
    ...(apiPrivateKeys ? { apiPrivateKeys } : {}),
    accountIndex,
    apiKeyIndex,
  });
  await signerClient.initialize();
  await signerClient.ensureWasmClient();
  console.log('[INIT] SignerClient initialized');

  const wsPrivate = new WsPrivateClient({
    url: resolveWsUrl(network),
    auth: new SignerAuthTokenProvider(signerClient),
    accountId: accountIndex,
    txTimeoutMs: 5000,
  });
  await wsPrivate.connect();
  console.log('[INIT] WsPrivateClient connected (merged: data + fills + tx submission)');

  const executor = new WsExecutor(signerClient, wsPrivate, {
    httpFallback: true,
    wsTxTimeoutMs: 5000,
  });

  const tracker = new OrderTracker(accountIndex);

  const strategy = new PerpetualMMStrategy(
    {
      marketId: MARKET_ID,
      accountId: accountIndex,
      maxPositionSize: MAX_POSITION,
      maxOpenOrders: 4,
      makerOnly: true,
      selfTradeBehavior: 0,
      reconnectTimeoutMs: 30000,
      tickIntervalMs: 1000,
      cycleMs: CYCLE_MS,
      orderSize: ORDER_SIZE,
      bidSpreadBps: BID_SPREAD_BPS,
      ...(ASK_SPREAD_BPS !== undefined ? { askSpreadBps: ASK_SPREAD_BPS } : {}),
      inventorySkewBps: SKEW_BPS,
      maxInventoryFraction: 0.5,
      requoteThreshold: REQUOTE_THRESHOLD,
      priceSource: 'mid',
      // Leverage applied at startup on every run (StrategyBase.applyLeverage).
      ...(LEVERAGE !== undefined ? { leverage: LEVERAGE } : {}),
      // Layer 2: `attributionNetwork` lets StrategyBase re-derive attribution
      // on its own, so deleting the explicit index below cannot silently
      // disable it.
      ...(venue ? integratorFields(venue) : {}),
    },
    signerClient,
    wsPrivate,
    executor,
    tracker,
  );

  const stats = new StatsAggregator();
  stats.attachTracker(tracker);
  stats.attachExecutor(executor);
  stats.attachStrategy(strategy);

  // File logging (default OFF).
  const fileLogging = setupFileLogging('mm-perp');
  if (fileLogging.path) {
    console.log(`[LOG] file logging ON \u2192 ${fileLogging.path}`);
    const origPush = stats.events.push.bind(stats.events);
    (stats.events as any).push = (ev: any) => {
      try { fileLogging.logEvent(ev); } catch {}
      return origPush(ev);
    };
  }

  // Hot config file (default OFF): auto-filled, re-read every cycle.
  const hotConfig = setupHotConfig();
  const hotKnown: Record<string, number | boolean> = {};
  if (hotConfig.path) {
    const editable = strategy.getEditableConfig();
    hotConfig.writeInitial(
      editable.map((f) => ({ key: f.key, label: f.label, value: f.get() })),
    );
    for (const f of editable) hotKnown[f.key] = f.get() as number | boolean;
  }
  const hotConfigTimer = setInterval(() => {
    if (!hotConfig.path) return;
    const changes = hotConfig.readChanges(hotKnown);
    const keys = Object.keys(changes);
    if (keys.length === 0) return;
    try {
      strategy.updateConfig(changes as any);
      for (const k of keys) hotKnown[k] = changes[k]!;
      console.log(`[CONFIG] hot config applied: ${keys.map((k) => `${k}=${changes[k]}`).join(', ')}`);
    } catch (e) {
      console.log(`[CONFIG] hot config rejected: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, Math.min(CYCLE_MS, 5000));

  let orderCount = 0;
  let fillCount = 0;
  let cancelCount = 0;
  let errorCount = 0;

  tracker.on('orderPlaced', (event: any) => {
    orderCount++;
    console.log(`[ORDER] #${event.order.clientOrderIndex} ${event.order.isAsk ? 'SELL' : 'BUY'} ${event.order.baseAmount} units @ ${event.order.price.toFixed(1)}`);
  });
  tracker.on('orderFill', (event: any) => {
    fillCount++;
    console.log(`[FILL] ${event.order.isAsk ? 'SELL' : 'BUY'} ${event.fillSize} @ ${event.price.toFixed(2)} (full=${event.isFullFill})`);
  });
  tracker.on('orderPartialFill', (event: any) => {
    console.log(`[PARTIAL] ${event.order.isAsk ? 'SELL' : 'BUY'} +${event.fillDelta} (cum=${event.cumulativeFilled}, rem=${event.remaining}) @ ${event.fillPrice.toFixed(2)}`);
  });
  tracker.on('orderCanceled', (event: any) => {
    cancelCount++;
    console.log(`[CANCEL] order #${event.order.orderIndex} reason=${event.reason}`);
  });
  tracker.on('orderRejected', (event: any) => {
    console.log(`[REJECT] order #${event.order.orderIndex} reason=${event.reason}`);
  });
  tracker.on('positionOpen', (event: any) => {
    console.log(`[POSITION OPEN] ${event.side} ${event.size} @ ${event.entryPrice.toFixed(2)}`);
  });
  tracker.on('positionChanged', (event: any) => {
    console.log(`[POSITION CHANGED] size=${event.position.size} uPnL=${event.position.unrealizedPnl.toFixed(2)} rPnL=${event.position.realizedPnl.toFixed(2)}`);
  });
  tracker.on('positionClose', (event: any) => {
    console.log(`[POSITION CLOSE] mkt=${event.marketId} rPnL=${event.realizedPnl.toFixed(2)}`);
  });
  executor.on('batchSent', (event: any) => {
    console.log(`[BATCH] ${event.cancels} cancels + ${event.creates} creates in 1 WS message`);
  });
  executor.on('wsError', (event: any) => {
    console.log(`[WS-ERROR] ${event.operation}: ${event.error instanceof Error ? event.error.message : String(event.error)}`);
  });
  executor.on('error', (event: any) => {
    errorCount++;
    console.log(`[ERROR] ${event.operation}: ${event.error instanceof Error ? event.error.message : String(event.error)}`);
  });

  const statusInterval = setInterval(() => {
    const md = strategy.getMarketData();
    const elapsed = Math.floor((Date.now() - (strategy as any).stats.startTime) / 1000);
    const pos = tracker.getPosition(MARKET_ID);
    const posStr = pos && pos.size !== 0
      ? ` | POS sign=${pos.sign} size=${pos.size} entry=${pos.avgEntryPrice.toFixed(2)} uPnL=${pos.unrealizedPnl.toFixed(4)}`
      : ' | flat';
    console.log(`[STATUS ${elapsed}s] state=${strategy.getState()} ticks=${(strategy as any).stats.ticksProcessed} orders=${orderCount} fills=${fillCount} cancels=${cancelCount} errors=${errorCount}` +
      (md ? ` | bid=${md.bestBid.toFixed(1)} ask=${md.bestAsk.toFixed(1)} mid=${md.midPrice.toFixed(1)}` : ' | no market data') + posStr);
  }, 30000);

  console.log('[INIT] Starting strategy...');
  await strategy.start();
  console.log(`[INIT] Strategy started. Running for ${RUN_DURATION_MS / 60000} minutes...`);

  /**
   * Single shutdown path for both the timer and Ctrl-C.
   *
   * `strategy.stop()` cancels resting orders but does NOT close a position an
   * earlier fill opened, and both exit paths used to `process.exit(0)`
   * regardless — so a run that ended holding inventory reported success. This
   * reports what the tracker holds and exits non-zero when something is open.
   * It deliberately does not close: the REST-verified flatten net lives in
   * run_mm.ts, and claiming a close this never read back would repeat the bug
   * that net was fixed for.
   *
   * The decision itself lives in ./_shutdown, shared with the dashboards, so
   * the open-inventory branch is covered by tests/dashboard-shutdown.test.ts
   * rather than only being reachable by ending a live run holding a position.
   */
  const finish = async (label: string): Promise<never> => {
    clearTimeout(stopTimer);
    clearInterval(statusInterval);
    clearInterval(hotConfigTimer);
    await strategy.stop();
    stats.updateUnrealizedPnl();
    console.log(
      `${label}: orders=${orderCount} fills=${fillCount} cancels=${cancelCount} errors=${errorCount} | ` +
        `PnL realized=${stats.realizedPnl.toFixed(4)} unrealized=${stats.unrealizedPnl.toFixed(4)} total=${stats.getTotalPnl().toFixed(4)}`,
    );

    const legs: ShutdownLeg[] = [{ marketId: MARKET_ID, position: tracker.getPosition(MARKET_ID) }];
    for (const line of formatShutdownReport('Shutdown', legs)) console.log(line);

    printSupportNoticeForNetwork(network.name);
    fileLogging.close();
    process.exit(shutdownExitCode(legs));
  };

  const stopTimer = setTimeout(() => {
    console.log(`\n=== RUN COMPLETE (${RUN_DURATION_MS / 60000} min) ===`);
    void finish('Final stats');
  }, RUN_DURATION_MS);

  process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Ctrl-C received, stopping...');
    void finish('Final');
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});