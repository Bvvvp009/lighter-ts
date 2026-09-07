/**
 * Cross-Venue Market-Making Strategy with Live CLI Dashboard
 *
 * This example runs a cross-venue market maker between Lighter Core (mainnet)
 * and Lighter-on-Robinhood (robinhood) with a live dual-column terminal dashboard.
 *
 * The strategy quotes on both venues simultaneously and hedges inventory
 * across them — when filled on venue A, it immediately places an opposite
 * market order on venue B.
 *
 * Prerequisites:
 * - .env with TWO sets of credentials:
 *   CORE_API_PRIVATE_KEY, CORE_ACCOUNT_INDEX, CORE_API_KEY_INDEX
 *   RH_API_PRIVATE_KEY, RH_ACCOUNT_INDEX, RH_API_KEY_INDEX
 *   Each falls back the same way `run_mm.ts cross_mm` does: Core also accepts
 *   LIGHTER_MAINNET_* and then the plain ACCOUNT_INDEX / API_KEY_INDEX,
 *   Robinhood accepts the plain pair. A .env that runs `cross_mm` runs this.
 * - Both accounts must be funded with USDC on their respective venues
 * - LIGHTER_NETWORK is ignored — this example sets the networks explicitly
 *
 * Run: npx tsx examples/mm_cross_venue_dashboard.ts
 *
 * Optional: set MM_RUN_MINUTES to stop automatically after N minutes.
 * Unset, the dashboard runs until you quit. Use it when stdout is not a
 * terminal (piped to a log, CI), where the keyboard controls below are
 * unavailable and Ctrl-C may not reach the process on Windows.
 *
 *   MM_LEVERAGE=3     leverage set on BOTH venues at startup (every run)
 *   MM_LOG_FILE=1     also write events to logs/ (default OFF)
 *   MM_HOT_CONFIG=1   auto-filled mm-config.json, hot-reloaded each cycle
 *
 * Controls: [Space] config menu   [P] Pause   [E] Emergency stop
 *           [R] Reset stats       [Q] Quit
 */

import * as dotenv from 'dotenv';
import {
  SignerClient,
  WsPrivateClient,
  SignerAuthTokenProvider,
  WsExecutor,
  OrderTracker,
  CrossVenueMM,
  StatsAggregator,
  Dashboard,
  resolveWsUrl,
  NETWORKS,
} from '../src';
import {
  crossVenueIntegratorFields,
  printAttributionDisclosure,
  printSupportNotice,
  requireKeyFrom,
} from './_attribution';
import { formatShutdownReport, shutdownExitCode } from './_shutdown';
import type { ShutdownLeg } from './_shutdown';
import { setupFileLogging } from './_logging';
import { setupHotConfig } from './_hotconfig';

dotenv.config();

async function main() {
  const marketId = parseInt(process.env.MARKET_ID || '0', 10);

  // ── 1. Load credentials for both venues ───────────────────────────────
  const corePrivateKey = requireKeyFrom(
    ['CORE_API_PRIVATE_KEY', 'LIGHTER_MAINNET_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
    'cross-venue dashboard: Core key',
  );
  // Same chain as `run_mm.ts cross_mm`. Falling straight to '0' would quote
  // account 0 with this key rather than the account the key belongs to, and the
  // resulting auth failure names neither the account nor the missing variable.
  const coreAccountIndex = parseInt(
    process.env.CORE_ACCOUNT_INDEX ||
      process.env.LIGHTER_MAINNET_ACCOUNT_INDEX ||
      process.env.ACCOUNT_INDEX ||
      '0',
    10,
  );
  const coreApiKeyIndex = parseInt(
    process.env.CORE_API_KEY_INDEX ||
      process.env.LIGHTER_MAINNET_API_KEY_INDEX ||
      process.env.API_KEY_INDEX ||
      '0',
    10,
  );

  const rhPrivateKey = requireKeyFrom(
    ['RH_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
    'cross-venue dashboard: Robinhood key',
  );
  const rhAccountIndex = parseInt(
    process.env.RH_ACCOUNT_INDEX || process.env.ACCOUNT_INDEX || '0',
    10,
  );
  const rhApiKeyIndex = parseInt(
    process.env.RH_API_KEY_INDEX || process.env.API_KEY_INDEX || '0',
    10,
  );

  console.log('Creating clients for Core (mainnet) + Robinhood (robinhood)...');

  // Builder attribution — disclosed for both venues before any order.
  printAttributionDisclosure('mainnet', 'robinhood');

  // ── 2. Create SignerClients ───────────────────────────────────────────
  const coreSigner = new SignerClient({
    network: 'mainnet',
    privateKey: corePrivateKey,
    accountIndex: coreAccountIndex,
    apiKeyIndex: coreApiKeyIndex,
  });
  await coreSigner.initialize();
  await coreSigner.ensureWasmClient();

  const rhSigner = new SignerClient({
    network: 'robinhood',
    privateKey: rhPrivateKey,
    accountIndex: rhAccountIndex,
    apiKeyIndex: rhApiKeyIndex,
  });
  await rhSigner.initialize();
  await rhSigner.ensureWasmClient();
  console.log('Both SignerClients initialized');

  // ── 3. Create merged WS clients for both venues (data + fills + tx) ───
  const coreWsUrl = resolveWsUrl(NETWORKS.mainnet);
  const rhWsUrl = resolveWsUrl(NETWORKS.robinhood);

  const coreWsPrivate = new WsPrivateClient({
    url: coreWsUrl,
    auth: new SignerAuthTokenProvider(coreSigner),
    accountId: coreAccountIndex,
  });
  await coreWsPrivate.connect();

  const rhWsPrivate = new WsPrivateClient({
    url: rhWsUrl,
    auth: new SignerAuthTokenProvider(rhSigner),
    accountId: rhAccountIndex,
  });
  await rhWsPrivate.connect();
  console.log('WS private clients connected (merged: data + fills + tx submission)');

  // ── 4. Create trackers + executors ────────────────────────────────────
  const coreTracker = new OrderTracker(coreAccountIndex);
  const rhTracker = new OrderTracker(rhAccountIndex);

  const coreExecutor = new WsExecutor(coreSigner, coreWsPrivate);
  const rhExecutor = new WsExecutor(rhSigner, rhWsPrivate);
  await coreExecutor.connectWs();
  await rhExecutor.connectWs();

  // ── 5. Create CrossVenueMM ───────────────────────────────────────────
  const strategy = new CrossVenueMM(
    {
      marketId,
      accountAId: coreAccountIndex,
      accountBId: rhAccountIndex,
      edgeBps: parseFloat(process.env.MM_EDGE_BPS || '5'),
      orderSize: parseInt(process.env.MM_ORDER_SIZE || '10000', 10),
      maxNetPosition: parseInt(process.env.MM_MAX_NET_POSITION || '100000', 10),
      maxPositionPerVenue: parseInt(process.env.MM_MAX_POS_PER_VENUE || '50000', 10),
      maxOpenOrdersPerVenue: 10,
      hedgeOnFill: true,
      hedgeSlippage: parseFloat(process.env.MM_HEDGE_SLIPPAGE || '0.002'),
      tickIntervalMs: parseInt(process.env.MM_TICK_INTERVAL || '500', 10),
      selfTradeBehavior: 0, // EXPIRE_MAKER
      // Partner attribution (layer 1) — tags must match the venue tags below.
      ...crossVenueIntegratorFields({ core: 'mainnet', rh: 'robinhood' }, 'mainnet'),
      // Leverage applied on BOTH venues at startup (CrossVenueMM.applyLeverage).
      ...(process.env.MM_LEVERAGE ? { leverage: Number(process.env.MM_LEVERAGE) } : {}),
      reconnectTimeoutMs: 30000,
    },
    {
      network: NETWORKS.mainnet,
      signerClient: coreSigner,
      wsPrivate: coreWsPrivate,
      executor: coreExecutor,
      tracker: coreTracker,
      tag: 'core',
    },
    {
      network: NETWORKS.robinhood,
      signerClient: rhSigner,
      wsPrivate: rhWsPrivate,
      executor: rhExecutor,
      tracker: rhTracker,
      tag: 'rh',
    },
  );

  // ── 6. Create StatsAggregator + Dashboard ─────────────────────────────
  const stats = new StatsAggregator();
  stats.attachTracker(coreTracker, 'core');
  stats.attachTracker(rhTracker, 'rh');
  stats.attachExecutor(coreExecutor, 'core');
  stats.attachExecutor(rhExecutor, 'rh');
  stats.attachCrossVenue(strategy);

  // File logging (default OFF).
  const fileLogging = setupFileLogging('mm-cross');
  if (fileLogging.path) {
    console.log(`[LOG] file logging ON \u2192 ${fileLogging.path}`);
  }

  // Hot config file (default OFF): auto-filled, re-read every cycle.
  const hotConfig = setupHotConfig();
  const hotKnown: Record<string, number | boolean> = {};
  if (hotConfig.path) {
    const editable = strategy.getEditableConfig();
    hotConfig.writeInitial(editable.map((f) => ({ key: f.key, label: f.label, value: f.get() })));
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
  }, 5000);

  const dashboard = new Dashboard({
    stats,
    trackers: [coreTracker, rhTracker],
    executors: [coreExecutor, rhExecutor],
    strategy,
    refreshMs: 250,
    crossVenue: true,
    venueTags: ['core', 'rh'],
    ...(fileLogging.path ? { onEvent: fileLogging.logEvent } : {}),
  });

  // ── 7. Start ──────────────────────────────────────────────────────────
  dashboard.start();
  console.log('Cross-venue dashboard started. [Q] quit, [P] pause, [E] emergency stop.');

  await strategy.start();

  /**
   * One shutdown path for the bounded-run timer, the 'stopped' event and
   * Ctrl-C.
   *
   * strategy.stop() cancels resting orders but does not close a position a
   * fill already opened, so exiting 0 unconditionally reports success on a
   * run that ended holding inventory. Report what the tracker holds and exit
   * non-zero when something is open. Closing is close_all_positions.ts's job
   * -- it verifies the close by reading it back over REST, which this cannot.
   */
  let shuttingDown = false;
  const shutdown = async (label: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    dashboard.stop();
    clearInterval(hotConfigTimer);
    await strategy.stop().catch(() => {});

    // Both legs matter here: a hedge that filled on one venue and not the
    // other leaves directional risk that a single-venue check would miss.
    const legs: ShutdownLeg[] = [
      { venue: 'core', marketId, position: coreTracker.getPosition(marketId) },
      { venue: 'rh', marketId, position: rhTracker.getPosition(marketId) },
    ];
    for (const line of formatShutdownReport(label, legs)) console.log(line);

    printSupportNotice('mainnet', 'robinhood');
    fileLogging.close();
    process.exit(shutdownExitCode(legs));
  };

  // Optional bounded run. Unset (the default) keeps the dashboard up until
  // Ctrl-C; setting it self-stops through the same orderly shutdown, which
  // is the only way to bound a run when stdout is not a TTY and Ctrl-C
  // cannot be delivered.
  const runMinutesRaw = process.env.MM_RUN_MINUTES;
  const runMinutes = runMinutesRaw ? parseFloat(runMinutesRaw) : NaN;
  if (Number.isFinite(runMinutes) && runMinutes > 0) {
    console.log(`Bounded run: stopping after ${runMinutes} minute(s).`);
    setTimeout(() => {
      console.log(`\n=== RUN COMPLETE (${runMinutes} min) ===`);
      void shutdown('Final');
    }, runMinutes * 60_000);
  }

  strategy.on('stopped', () => {
    void shutdown('Strategy stopped');
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    void shutdown('Final');
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});