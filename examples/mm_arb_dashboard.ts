/**
 * Arbitrage Strategy with Live CLI Dashboard
 *
 * This example runs an A_S (ask/bid spread / statistical arbitrage) strategy
 * on a single Lighter venue with a live terminal dashboard.
 *
 * The strategy detects when the venue's bid/ask deviates from a fair price
 * (mark price by default) and executes to capture the spread.
 *
 * Prerequisites:
 * - .env with API_PRIVATE_KEY, ACCOUNT_INDEX, API_KEY_INDEX, LIGHTER_NETWORK
 * - Funded account with USDC balance
 *
 * Run: npx tsx examples/mm_arb_dashboard.ts
 *
 * Optional: set MM_RUN_MINUTES to stop automatically after N minutes.
 * Unset, the dashboard runs until you quit. Use it when stdout is not a
 * terminal (piped to a log, CI), where the keyboard controls below are
 * unavailable and Ctrl-C may not reach the process on Windows.
 *
 *   MM_LEVERAGE=3     leverage set on the venue at startup (every run)
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
  ArbitrageStrategy,
  StatsAggregator,
  Dashboard,
  resolveNetworkFromEnv,
  resolveWsUrl,
} from '../src';
import {
  integratorFields,
  printAttributionDisclosure,
  printSupportNotice,
  requireKeyFrom,
  venueForNetwork,
} from './_attribution';
import { formatShutdownReport, shutdownExitCode } from './_shutdown';
import type { ShutdownLeg } from './_shutdown';
import { setupFileLogging } from './_logging';
import { setupHotConfig } from './_hotconfig';

dotenv.config();

async function main() {
  const network = resolveNetworkFromEnv();
  const privateKey = requireKeyFrom(['API_PRIVATE_KEY'], 'arb dashboard: key load');
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  const marketId = parseInt(process.env.MARKET_ID || '0', 10);

  console.log(`Network: ${network.name} | Market: ${marketId} | Account: ${accountIndex}`);

  // Builder attribution — disclosed before any order is placed.
  const venue = venueForNetwork(network.name);
  if (venue) printAttributionDisclosure(venue);

  // Create SignerClient
  // url + chainId, not the network name: the name would send SignerClient
  // back to the profile host and quietly drop a BASE_URL override that the
  // banner above has already reported as the venue.
  const signerClient = new SignerClient({
    url: network.apiUrl,
    chainId: network.chainId,
    privateKey,
    accountIndex,
    apiKeyIndex,
  });
  await signerClient.initialize();
  await signerClient.ensureWasmClient();
  console.log('SignerClient initialized');

  // Create WS client (merged: subscriptions + auth + tx submission)
  const wsUrl = resolveWsUrl(network);
  const wsPrivate = new WsPrivateClient({
    url: wsUrl,
    auth: new SignerAuthTokenProvider(signerClient),
    accountId: accountIndex,
  });
  await wsPrivate.connect();

  // Create tracker + executor + strategy
  const tracker = new OrderTracker(accountIndex);
  const executor = new WsExecutor(signerClient, wsPrivate);
  await executor.connectWs();

  const strategy = new ArbitrageStrategy(
    {
      marketId,
      accountId: accountIndex,
      maxPositionSize: parseInt(process.env.MM_MAX_POSITION || '50000', 10),
      maxOpenOrders: 5,
      makerOnly: false, // taker execution for arb
      selfTradeBehavior: 0,
      reconnectTimeoutMs: 30000,
      tickIntervalMs: 500, // fast tick for arb
      fairPriceSource: (process.env.MM_FAIR_PRICE_SOURCE || 'mark') as any,
      threshold: parseFloat(process.env.MM_ARB_THRESHOLD || '2'),
      orderSize: parseInt(process.env.MM_ORDER_SIZE || '10000', 10),
      maxSlippage: parseFloat(process.env.MM_ARB_SLIPPAGE || '0.001'),
      cooldownMs: parseInt(process.env.MM_ARB_COOLDOWN || '500', 10),
      makerExecution: false,
      // Leverage applied at startup on every run (StrategyBase.applyLeverage).
      ...(process.env.MM_LEVERAGE ? { leverage: Number(process.env.MM_LEVERAGE) } : {}),
      ...(venue ? integratorFields(venue) : {}),
    },
    signerClient,
    wsPrivate,
    executor,
    tracker,
  );

  // Dashboard
  const stats = new StatsAggregator();
  stats.attachTracker(tracker);
  stats.attachExecutor(executor);
  stats.attachStrategy(strategy);

  // File logging (default OFF).
  const fileLogging = setupFileLogging('mm-arb');
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
    trackers: tracker,
    executors: executor,
    strategy,
    refreshMs: 250,
    ...(fileLogging.path ? { onEvent: fileLogging.logEvent } : {}),
  });

  dashboard.start();
  console.log('Dashboard started. [Q] quit, [P] pause, [E] emergency stop.');

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

    const legs: ShutdownLeg[] = [{ marketId, position: tracker.getPosition(marketId) }];
    for (const line of formatShutdownReport(label, legs)) console.log(line);

    if (venue) printSupportNotice(venue);
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