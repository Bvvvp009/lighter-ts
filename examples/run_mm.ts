/**
 * Unified MM Strategy Runner — all strategies, one entry point.
 *
 * Select the strategy with MM_STRATEGY:
 *   MM_STRATEGY=as_mm       Avellaneda-Stoikov optimal MM                 [default]
 *   MM_STRATEGY=perp_mm     Normal quote-width MM (mid-based, bps spreads)
 *   MM_STRATEGY=grid        Grid MM (N levels/side, $ spacing)
 *   MM_STRATEGY=arb_mm      Fair-price arbitrage maker (mark-based, $ edge)
 *   MM_STRATEGY=cross_mm    Cross-venue MM (Core + Robinhood, bps edge)
 *
 * Single-venue strategies (as_mm | perp_mm | grid | arb_mm) use ONE merged
 * /stream WS connection for market data, fill events, and tx submission.
 * cross_mm needs credentials for both venues.
 *
 * Run: npx tsx examples/run_mm.ts [strategy] [flags]   (--help for flags)
 *   npm run mm:as | mm:perp | mm:grid | mm:arb | mm:cross
 *
 * Every knob has both a flag and an env var; the flag wins. Flags exist
 * because cmd.exe has no inline env-var prefix, so npm scripts need them.
 *
 * Env (single-venue):
 *   LIGHTER_NETWORK=robinhood, API_PRIVATE_KEY (or API_PRIVATE_KEYS_JSON),
 *   ACCOUNT_INDEX, API_KEY_INDEX
 * Env (cross_mm additionally):
 *   CORE_ACCOUNT_INDEX, CORE_API_KEY_INDEX, CORE_API_PRIVATE_KEY
 *   RH_ACCOUNT_INDEX, RH_API_KEY_INDEX, RH_API_PRIVATE_KEY
 * Shared knobs:
 *   RUN_MINUTES=15, MARKET_ID=1, MM_CYCLE_MS=12000, MM_ORDER_SIZE=50,
 *   MM_MAX_POSITION=100, MM_SPREAD_BPS=10, MM_HALF_SPREAD=20,
 *   MM_GRID_LEVELS=4, MM_GRID_SPACING=25, MM_REQUOTE_THRESHOLD=10,
 *   MM_LEVERAGE=3            leverage set on the venue at every startup
 *   MM_LOG_FILE=1            file logs (default OFF; 1 or a path enables)
 *   MM_HOT_CONFIG=1          auto-filled mm-config.json, hot-reloaded each
 *                             cycle (default OFF)
 *   MM_NO_DASHBOARD=1        plain log output instead of the live dashboard
 * A-S knobs (as_mm only):
 *   MM_AS_GAMMA=0.5           risk aversion; higher = wider + harder skew
 *   MM_AS_KAPPA=1.5           order-arrival intensity; higher = tighter
 *   MM_AS_HORIZON_MS=300000   session length for the (T-t) term
 *   MM_AS_INFINITE_HORIZON=1  pin (T-t)=1, for a maker with no session end
 *   MM_AS_SIGMA=<price>       pin volatility instead of estimating it live
 *   MM_AS_MIN_HALF_SPREAD_BPS=1, MM_AS_MAX_HALF_SPREAD_BPS=100
 *
 * Full config reference + copy-paste launch commands: docs/STRATEGIES.md
 */

import * as dotenv from 'dotenv';
import {
  ApiClient,
  AccountApi,
  OrderApi,
  SignerClient,
  WsPrivateClient,
  SignerAuthTokenProvider,
  WsExecutor,
  OrderTracker,
  StatsAggregator,
  Dashboard,
  ArbitrageStrategy,
  AvellanedaStoikovMM,
  PerpetualMMStrategy,
  GridStrategy,
  CrossVenueMM,
  resolveNetworkFromEnv,
  resolveWsUrl,
  NETWORKS,
  assertAccountIndex,
  type StrategyBase,
} from '../src';
import { setupFileLogging } from './_logging';
import { setupHotConfig } from './_hotconfig';
import {
  attributionDisabled,
  attributionFor,
  autoApproveEnabled,
  approvalExpirySeconds,
  crossVenueIntegratorFields,
  integratorFields,
  integratorIndexForVenue,
  loadKeys,
  makerFeeFor,
  printAttributionDisclosureForNetworks,
  printSupportNoticeForNetworks,
  attributionForNetwork,
  requireKeyFrom,
  takerFeeFor,
  venueForNetwork,
  type Venue,
} from './_attribution';

dotenv.config();

// ---------------------------------------------------------------------------
// CLI flags — a cross-platform front end for the MM_* env vars.
//
// `MM_STRATEGY=grid tsx run_mm.ts` does not work in an npm script on Windows
// (cmd.exe has no inline env-var prefix), so every knob also has a flag. Flags
// are written into process.env BEFORE the consts below read it, which keeps a
// single source of truth: env stays the interface, the CLI is sugar over it.
// Precedence: CLI flag > env var > default.
// ---------------------------------------------------------------------------

/** Flag -> env var. Keep in sync with the const block below. */
const FLAG_ENV: Record<string, string> = {
  strategy: 'MM_STRATEGY',
  s: 'MM_STRATEGY',
  minutes: 'RUN_MINUTES',
  market: 'MARKET_ID',
  size: 'MM_ORDER_SIZE',
  'max-position': 'MM_MAX_POSITION',
  'cycle-ms': 'MM_CYCLE_MS',
  'spread-bps': 'MM_SPREAD_BPS',
  'half-spread': 'MM_HALF_SPREAD',
  'grid-levels': 'MM_GRID_LEVELS',
  'grid-spacing': 'MM_GRID_SPACING',
  requote: 'MM_REQUOTE_THRESHOLD',
  leverage: 'MM_LEVERAGE',
  'leverage-a': 'MM_LEVERAGE_A',
  'leverage-b': 'MM_LEVERAGE_B',
  network: 'LIGHTER_NETWORK',
  venue: 'MM_VENUE',
  'log-file': 'MM_LOG_FILE',
  'hot-config': 'MM_HOT_CONFIG',
  'no-dashboard': 'MM_NO_DASHBOARD',
  gamma: 'MM_AS_GAMMA',
  kappa: 'MM_AS_KAPPA',
  'horizon-ms': 'MM_AS_HORIZON_MS',
  'infinite-horizon': 'MM_AS_INFINITE_HORIZON',
  sigma: 'MM_AS_SIGMA',
  'min-half-spread-bps': 'MM_AS_MIN_HALF_SPREAD_BPS',
  'max-half-spread-bps': 'MM_AS_MAX_HALF_SPREAD_BPS',
};

const KNOWN_STRATEGIES = ['as_mm', 'perp_mm', 'grid', 'arb_mm', 'cross_mm'];

const USAGE = `
Unified MM strategy runner.

  npx tsx examples/run_mm.ts [strategy] [flags]

Strategies:
  as_mm     Avellaneda-Stoikov optimal MM (default)
  perp_mm   Fixed quote width around the mid
  grid      N levels per side at fixed $ spacing
  arb_mm    Fair-price maker around the mark
  cross_mm  Two-venue MM with hedging (needs both venues' credentials)

Shared flags:
  --minutes=15          run length, then stop + flatten
  --market=1            market index
  --size=50             order size, whole SCALED base units (BTC has 5 size
                        decimals, so 50 = 0.0005 BTC). Decimals are rejected.
  --max-position=100    max absolute position, same units as --size
  --cycle-ms=12000      min ms between cancel/replace batches
  --requote=10          $ drift before a requote is due
  --leverage=3          leverage set on the venue at startup (every run).
                        Example: 2 = IMF 5000, 3 = IMF 3333, 10 = IMF 1000.
                        Omit to leave the venue's current setting alone.
  --leverage-a=5        cross_mm only: leverage for venue A (core) — overrides
                        --leverage for that venue.
  --leverage-b=2        cross_mm only: leverage for venue B (robinhood) —
                        overrides --leverage for that venue. Venues cap
                        leverage independently (BTC: core 50x, RH 5x), so one
                        shared number can exceed the tighter cap.
  --network=robinhood   mainnet | testnet | robinhood | robinhood-testnet
  --venue=mainnet       single-venue strategies: which venue to quote on
  --log-file            also write logs to logs/<strategy>-<time>.log
                        (default OFF; pass --log-file=<path> for a custom file)
  --hot-config          write an auto-filled mm-config.json and re-read it
                        EVERY cycle — edit + save to change config mid-run
                        without stopping (default OFF)
  --no-dashboard        skip the live CLI dashboard (plain log output)
  --print-config        show the resolved config and exit -- places no orders,
                        opens no connections. Check a command before funding it.

Per strategy:
  --spread-bps=10       perp_mm, cross_mm: half-spread / edge in bps
  --half-spread=20      arb_mm: edge from fair, in $
  --grid-levels=4       grid: levels per side
  --grid-spacing=25     grid: $ between levels
  --gamma=0.5           as_mm: risk aversion
  --kappa=1.5           as_mm: order-arrival intensity
  --horizon-ms=300000   as_mm: session length for the (T-t) term
  --infinite-horizon    as_mm: pin (T-t)=1 for continuous running
  --sigma=<price>       as_mm: pin volatility instead of estimating it
  --min-half-spread-bps=1    as_mm: floor on the quoted half-spread
  --max-half-spread-bps=100  as_mm: ceiling on the quoted half-spread

Every flag maps to the matching MM_* env var; see docs/STRATEGIES.md for the
full config reference, defaults, and attribution opt-out.
`;

/** Set by --print-config/--dry-run: echo the resolved config, place no orders. */
let PRINT_CONFIG_ONLY = false;

function applyCliFlags(argv: readonly string[]): void {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;

    if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    }

    // Handled after the const block, once there is a resolved config to print.
    if (arg === '--print-config' || arg === '--dry-run') {
      PRINT_CONFIG_ONLY = true;
      continue;
    }

    // Bare positional strategy name: `run_mm.ts grid`
    if (!arg.startsWith('-')) {
      const name = arg.toLowerCase();
      if (!KNOWN_STRATEGIES.includes(name)) {
        console.error(
          `Unknown strategy '${arg}'. Expected one of: ${KNOWN_STRATEGIES.join(', ')}.\n` +
            `Run with --help for usage.`,
        );
        process.exit(1);
      }
      process.env['MM_STRATEGY'] = name;
      continue;
    }

    const body = arg.replace(/^--?/, '');
    const eq = body.indexOf('=');
    const key = (eq === -1 ? body : body.slice(0, eq)).toLowerCase();
    const envVar = FLAG_ENV[key];
    if (!envVar) {
      console.error(`Unknown flag '${arg}'. Run with --help for usage.`);
      process.exit(1);
    }

    let value: string;
    if (eq !== -1) {
      value = body.slice(eq + 1);
    } else if (key === 'infinite-horizon') {
      // Boolean flag: bare `--infinite-horizon` means on.
      value = '1';
    } else if (key === 'no-dashboard') {
      // Boolean flag: bare `--no-dashboard` means on.
      value = '1';
    } else if (key === 'log-file') {
      // Boolean-ish flag: bare `--log-file` enables the default logs/ file.
      value = '1';
    } else if (key === 'hot-config') {
      // Boolean-ish flag: bare `--hot-config` enables mm-config.json.
      value = '1';
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        console.error(`Flag '${arg}' needs a value, e.g. ${arg}=<value>.`);
        process.exit(1);
      }
      value = next;
      i++;
    }
    process.env[envVar] = value;
  }
}

applyCliFlags(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Validate the two selectors that decide WHAT model runs and WHICH exchange
// account it runs against. Both accept values from .env as well as from flags,
// so validating inside applyCliFlags would only cover half the ways in. A typo
// here is not cosmetic: `MM_STRATEGY=gird` used to fall through to the default
// (Avellaneda-Stoikov), and `MM_VENUE=mainet` used to fall through to Robinhood
// -- either one silently trades a model or a venue the operator did not ask
// for, with real money. Fail loudly instead.
// ---------------------------------------------------------------------------

/** Accepted MM_VENUE spellings -> the network the single-venue path uses. */
const VENUE_ALIASES: Record<string, string> = {
  mainnet: 'mainnet',
  core: 'mainnet',
  robinhood: 'robinhood',
  rh: 'robinhood',
  testnet: 'testnet',
  'robinhood-testnet': 'robinhood-testnet',
};

function assertKnownSelectors(): void {
  const strategy = process.env.MM_STRATEGY;
  if (strategy !== undefined && !KNOWN_STRATEGIES.includes(strategy.toLowerCase())) {
    console.error(
      `Unknown MM_STRATEGY '${strategy}'. Expected one of: ${KNOWN_STRATEGIES.join(', ')}.
` +
        `Set it in .env or pass --strategy=<name>; --help lists them.`,
    );
    process.exit(1);
  }

  const venue = process.env.MM_VENUE;
  if (venue !== undefined && VENUE_ALIASES[venue.toLowerCase()] === undefined) {
    console.error(
      `Unknown MM_VENUE '${venue}'. Expected one of: ${Object.keys(VENUE_ALIASES).join(', ')}.
` +
        `MM_VENUE picks which exchange account the strategy trades on, so this ` +
        `is not defaulted.`,
    );
    process.exit(1);
  }
}

assertKnownSelectors();

/**
 * The venue the single-venue strategies quote on, as a network name.
 * One resolution shared by setup, attribution, and the flatten safety net --
 * three copies of this ternary is how they drift apart.
 */
function singleVenueNetworkName(): string {
  const raw = (process.env.MM_VENUE || process.env.LIGHTER_NETWORK || 'robinhood').toLowerCase();
  return VENUE_ALIASES[raw] ?? 'robinhood';
}

/** Env var -> the CLI flag that sets it, so an error can name both. */
const ENV_FLAG: Record<string, string> = Object.entries(FLAG_ENV).reduce<Record<string, string>>(
  (acc, [flag, envVar]) => {
    if (!(envVar in acc) || flag.length > 1) acc[envVar] = flag;
    return acc;
  },
  {},
);

function knobError(envVar: string, raw: string, expected: string): never {
  const flag = ENV_FLAG[envVar];
  throw new Error(
    `${envVar}=${JSON.stringify(raw)} is not usable: expected ${expected}.\n` +
      (flag ? `  Set it with ${envVar}=<value> or --${flag}=<value>.\n` : '') +
      `  Refusing to start rather than resolving it to a value you did not ask for.`,
  );
}

/**
 * An integer knob: order size, max position, grid levels, durations.
 *
 * Sizes and positions are counts of SCALED base units (BTC has 5 size
 * decimals, so 50 means 0.0005 BTC), which is why these are integers and not
 * decimals. `parseInt` accepts a decimal and silently discards the fraction
 * -- `--size=0.000125` would become `0`, and a zero `baseAmount` is a live
 * order the caller never intended. Fail here instead.
 */
function intKnob(envVar: string, fallback: string, min: number): number {
  const raw = (process.env[envVar] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    knobError(envVar, raw, `a whole number >= ${min} (scaled base units, not decimals)`);
  }
  return value;
}

/** A decimal knob: spreads, spacings, thresholds. Fractions are meaningful here. */
function floatKnob(envVar: string, fallback: string, min: number): number {
  const raw = (process.env[envVar] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) {
    knobError(envVar, raw, `a finite number >= ${min}`);
  }
  return value;
}

const STRATEGY = (process.env.MM_STRATEGY || 'as_mm').toLowerCase();
const RUN_DURATION_MS = intKnob('RUN_MINUTES', '15', 1) * 60 * 1000;
const MARKET_ID = intKnob('MARKET_ID', '1', 0);
const ORDER_SIZE = intKnob('MM_ORDER_SIZE', '50', 1);
const MAX_POSITION = intKnob('MM_MAX_POSITION', '100', 1);
const CYCLE_MS = intKnob('MM_CYCLE_MS', '12000', 1);
const SPREAD_BPS = floatKnob('MM_SPREAD_BPS', '10', 0);
const HALF_SPREAD = floatKnob('MM_HALF_SPREAD', '20', 0);
const GRID_LEVELS = intKnob('MM_GRID_LEVELS', '4', 1);
const GRID_SPACING = floatKnob('MM_GRID_SPACING', '25', 0);
const REQUOTE_THRESHOLD = floatKnob('MM_REQUOTE_THRESHOLD', '10', 0);
/**
 * Leverage to set on the venue at startup (every run). Validated here so a
 * typo fails before any order is signed; the strategy re-validates and the
 * start aborts if the venue rejects the update. Unset = leave the venue as-is.
 */
const LEVERAGE_RAW = process.env.MM_LEVERAGE;
const LEVERAGE = LEVERAGE_RAW !== undefined && LEVERAGE_RAW !== ''
  ? (() => {
      const v = Number(LEVERAGE_RAW);
      if (!Number.isFinite(v) || v <= 0) {
        knobError('MM_LEVERAGE', LEVERAGE_RAW, 'a positive number (e.g. 2, 3, 10)');
      }
      return v;
    })()
  : undefined;
/**
 * Per-venue leverage overrides for cross_mm (core / robinhood). Venues cap
 * leverage independently (BTC: core 50x, RH 5x), so one shared number can
 * exceed the tighter cap. Unset = fall back to MM_LEVERAGE.
 */
const leverageVenueKnob = (env: string): number | undefined => {
  const raw = process.env[env];
  if (raw === undefined || raw === '') return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) {
    knobError(env, raw, 'a positive number (e.g. 2, 3, 10)');
  }
  return v;
};
const LEVERAGE_A = leverageVenueKnob('MM_LEVERAGE_A');
const LEVERAGE_B = leverageVenueKnob('MM_LEVERAGE_B');
// Avellaneda-Stoikov parameters. See docs/STRATEGIES.md before changing GAMMA
// on a funded account: it controls how hard quotes lean against inventory.
const AS_GAMMA = floatKnob('MM_AS_GAMMA', '0.5', 0);
// kappa is a divisor in the (2/gamma)*ln(1 + gamma/kappa) spread term; zero
// makes the log argument infinite and the quoted spread NaN.
const AS_KAPPA = floatKnob('MM_AS_KAPPA', '1.5', Number.MIN_VALUE);
const AS_HORIZON_MS = intKnob('MM_AS_HORIZON_MS', '300000', 1);
const AS_INFINITE_HORIZON = process.env.MM_AS_INFINITE_HORIZON === '1';
const AS_MIN_HALF_SPREAD_BPS = floatKnob('MM_AS_MIN_HALF_SPREAD_BPS', '1', 0);
const AS_MAX_HALF_SPREAD_BPS = floatKnob('MM_AS_MAX_HALF_SPREAD_BPS', '100', 0);

// ---------------------------------------------------------------------------
// Partner (builder) attribution + credentials — enforcement layer 1 of 3.
// All of it lives in examples/_attribution.ts so every runner shares one
// implementation. See docs/ATTRIBUTION.md for the full policy and opt-out.
// ---------------------------------------------------------------------------
const ATTRIBUTION_DISABLED = attributionDisabled();
const INTEGRATOR_TAKER_FEE = takerFeeFor('mainnet');
const INTEGRATOR_MAKER_FEE = makerFeeFor('mainnet');
const INTEGRATOR_AUTO_APPROVE = autoApproveEnabled();
const INTEGRATOR_EXPIRY_SECONDS = approvalExpirySeconds();

/**
 * Networks this run will touch — drives which disclosures are printed.
 *
 * Kept as network NAMES, not `Venue`s: testnets have no builder account, and
 * collapsing them onto a default venue made the startup banner advertise
 * Robinhood attribution on runs whose orders carried none. The disclosure must
 * describe what is actually stamped.
 */
const RUN_NETWORKS: string[] =
  STRATEGY === 'cross_mm' ? ['mainnet', 'robinhood'] : [singleVenueNetworkName()];

/** The subset of RUN_NETWORKS that carries a builder account. */
const RUN_VENUES: Venue[] = RUN_NETWORKS.map(venueForNetwork).filter(
  (v): v is Venue => v !== undefined,
);

/**
 * Echo the fully resolved config and exit, without opening a connection or
 * signing anything. Every knob below has three possible sources (flag, .env,
 * built-in default) and the precedence is only visible after resolution, so
 * "what will this command actually do" is otherwise unanswerable until orders
 * are already live. Run this first on a funded account.
 */
function printResolvedConfig(): void {
  const rows: Array<[string, string]> = [
    ['strategy', STRATEGY],
    ['market id', String(MARKET_ID)],
    ['run length', `${RUN_DURATION_MS / 60000} min`],
    ['order size', `${ORDER_SIZE} base units`],
    ['max position', `${MAX_POSITION} base units`],
    ['cycle', `${CYCLE_MS} ms`],
    ['requote threshold', `$${REQUOTE_THRESHOLD}`],
    ['leverage', LEVERAGE !== undefined ? `${LEVERAGE}x (set at startup)` : 'venue default (not set)'],
    ['file log', process.env.MM_LOG_FILE ? `on (${process.env.MM_LOG_FILE})` : 'off'],
    ['hot config', process.env.MM_HOT_CONFIG ? `on (${process.env.MM_HOT_CONFIG})` : 'off'],
    ['dashboard', process.env.MM_NO_DASHBOARD === '1' ? 'off' : 'on (if TTY)'],
  ];

  if (STRATEGY === 'cross_mm') {
    rows.push(['venues', 'mainnet + robinhood']);
    rows.push(['edge', `${SPREAD_BPS} bps`]);
    if (LEVERAGE_A !== undefined) rows.push(['leverage core', `${LEVERAGE_A}x (set at startup)`]);
    if (LEVERAGE_B !== undefined) rows.push(['leverage rh', `${LEVERAGE_B}x (set at startup)`]);
  } else {
    rows.push(['venue', singleVenueNetworkName()]);
  }

  if (STRATEGY === 'as_mm') {
    rows.push(['gamma (risk aversion)', String(AS_GAMMA)]);
    rows.push(['kappa (arrival)', String(AS_KAPPA)]);
    rows.push([
      'horizon',
      AS_INFINITE_HORIZON ? 'infinite (T-t pinned to 1)' : `${AS_HORIZON_MS} ms`,
    ]);
    rows.push(['sigma', process.env.MM_AS_SIGMA ? `${process.env.MM_AS_SIGMA} (pinned)` : 'estimated live']);
    rows.push(['half-spread clamp', `${AS_MIN_HALF_SPREAD_BPS}-${AS_MAX_HALF_SPREAD_BPS} bps`]);
  } else if (STRATEGY === 'perp_mm') {
    rows.push(['half-spread', `${SPREAD_BPS} bps`]);
  } else if (STRATEGY === 'grid') {
    rows.push(['levels per side', String(GRID_LEVELS)]);
    rows.push(['level spacing', `$${GRID_SPACING}`]);
  } else if (STRATEGY === 'arb_mm') {
    rows.push(['edge from fair', `$${HALF_SPREAD}`]);
  }

  const width = Math.max(...rows.map(([k]) => k.length));
  console.log('');
  console.log('--- Resolved config (--print-config: nothing was sent) ---');
  for (const [k, v] of rows) {
    console.log(`  ${k.padEnd(width)} : ${v}`);
  }

  console.log('');
  console.log('  Attribution');
  for (const network of RUN_NETWORKS) {
    const d = attributionForNetwork(network);
    console.log(
      `  ${network.padEnd(width)} : ${
        d.enabled
          ? `#${d.accountIndex}, maker ${d.makerFee / 100} bps / taker ${d.takerFee / 100} bps`
          : `off (${d.label})`
      }`,
    );
  }
  console.log('');
  console.log('No orders were placed and no connection was opened.');
  console.log('Drop --print-config to run this for real.');
  console.log('');
}

function wireLogging(
  tracker: OrderTracker,
  executor: WsExecutor,
  stats: StatsAggregator,
  counters: { orders: number; fills: number; cancels: number; errors: number },
  venueTag: string = 'default',
): void {
  // The venue tag is load-bearing: StatsAggregator buckets every fill/PnL
  // delta per tag, and the cross-venue dashboard reads getVenueStats(tag).
  // Attaching both venues' trackers under the default tag merges their PnL
  // into one bucket and leaves the per-venue rows empty.
  const pfx = venueTag !== 'default' ? `[${venueTag}] ` : '';
  tracker.on('orderPlaced', (event: any) => {
    counters.orders++;
    console.log(`${pfx}[ORDER] #${event.order.clientOrderIndex} ${event.order.isAsk ? 'SELL' : 'BUY'} ${event.order.baseAmount} units @ ${event.order.price.toFixed(1)}`);
  });
  tracker.on('orderFill', (event: any) => {
    counters.fills++;
    console.log(`${pfx}[FILL] ${event.order.isAsk ? 'SELL' : 'BUY'} ${event.fillSize} @ ${event.price.toFixed(2)} (full=${event.isFullFill})`);
  });
  tracker.on('orderPartialFill', (event: any) => {
    console.log(`${pfx}[PARTIAL] ${event.order.isAsk ? 'SELL' : 'BUY'} +${event.fillDelta} (cum=${event.cumulativeFilled}, rem=${event.remaining}) @ ${event.fillPrice.toFixed(2)}`);
  });
  tracker.on('orderCanceled', (event: any) => {
    counters.cancels++;
    console.log(`${pfx}[CANCEL] order #${event.order.orderIndex} reason=${event.reason}`);
  });
  tracker.on('orderRejected', (event: any) => {
    console.log(`${pfx}[REJECT] order #${event.order.orderIndex} reason=${event.reason}`);
  });
  tracker.on('positionOpen', (event: any) => {
    console.log(`${pfx}[POSITION OPEN] ${event.side} ${event.size} @ ${event.entryPrice.toFixed(2)}`);
  });
  tracker.on('positionChanged', (event: any) => {
    console.log(`${pfx}[POSITION CHANGED] size=${event.position.size} uPnL=${event.position.unrealizedPnl.toFixed(4)} rPnL=${event.position.realizedPnl.toFixed(4)}`);
  });
  tracker.on('positionClose', (event: any) => {
    console.log(`${pfx}[POSITION CLOSE] mkt=${event.marketId} rPnL=${event.realizedPnl.toFixed(4)}`);
  });
  executor.on('batchSent', (event: any) => {
    console.log(`${pfx}[BATCH] ${event.cancels} cancels + ${event.creates} creates in 1 WS message`);
  });
  executor.on('wsError', (event: any) => {
    console.log(`${pfx}[WS-ERROR] ${event.operation}: ${event.error instanceof Error ? event.error.message : String(event.error)}`);
  });
  executor.on('error', (event: any) => {
    counters.errors++;
    console.log(`${pfx}[ERROR] ${event.operation}: ${event.error instanceof Error ? event.error.message : String(event.error)}`);
  });
  stats.attachTracker(tracker, venueTag);
  stats.attachExecutor(executor, venueTag);
}

interface SingleVenueSetup {
  strategy: StrategyBase;
  tracker: OrderTracker;
  wsPrivate: WsPrivateClient;
  signerClient: SignerClient;
  executor: WsExecutor;
}

async function setupSingleVenue(): Promise<SingleVenueSetup> {
  // MM_VENUE selects which venue the single-venue strategies run on
  // (robinhood by default — matches LIGHTER_NETWORK; mainnet uses the
  // LIGHTER_MAINNET_* credentials).
  //
  // When MM_VENUE is set it is authoritative over LIGHTER_NETWORK. It is the
  // knob an operator reaches for to point one run at one exchange account, and
  // letting LIGHTER_NETWORK quietly win would trade the wrong book.
  const venue = singleVenueNetworkName();
  let network = process.env.MM_VENUE ? NETWORKS[venue]! : resolveNetworkFromEnv();
  let accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  let apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  let { privateKey, apiPrivateKeys } = loadKeys();

  if (venue === 'mainnet') {
    network = NETWORKS.mainnet;
    accountIndex = parseInt(process.env.LIGHTER_MAINNET_ACCOUNT_INDEX || process.env.ACCOUNT_INDEX || '0', 10);
    apiKeyIndex = parseInt(process.env.LIGHTER_MAINNET_API_KEY_INDEX || process.env.API_KEY_INDEX || '0', 10);
    privateKey = process.env.LIGHTER_MAINNET_API_PRIVATE_KEY
      ? requireKeyFrom(['LIGHTER_MAINNET_API_PRIVATE_KEY'], 'runner: mainnet key override')
      : privateKey;
    apiPrivateKeys = undefined; // mainnet key is not part of the RH multi-key map
  }
  console.log(`[INIT] Single-venue target: ${network.name} (account=${accountIndex} keyIdx=${apiKeyIndex})`);

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
  await ensureIntegratorApproval(signerClient, network.name as 'mainnet' | 'robinhood');

  const wsPrivate = new WsPrivateClient({
    url: resolveWsUrl(network),
    auth: new SignerAuthTokenProvider(signerClient),
    accountId: accountIndex,
    txTimeoutMs: 5000,
  });
  await wsPrivate.connect();
  console.log('[INIT] WsPrivateClient connected (merged: data + fills + tx submission)');

  const executor = new WsExecutor(signerClient, wsPrivate, { httpFallback: true, wsTxTimeoutMs: 5000 });
  const tracker = new OrderTracker(accountIndex);

  const common = {
    marketId: MARKET_ID,
    accountId: accountIndex,
    maxPositionSize: MAX_POSITION,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,
    cycleMs: CYCLE_MS,
    // Leverage is applied at startup on every run (see StrategyBase.applyLeverage).
    ...(LEVERAGE !== undefined ? { leverage: LEVERAGE } : {}),
    ...integratorFields(network.name as 'mainnet' | 'robinhood'),
  };

  let strategy: StrategyBase;
  if (STRATEGY === 'grid') {
    strategy = new GridStrategy(
      {
        ...common,
        maxOpenOrders: 2 * GRID_LEVELS,
        gridLevels: GRID_LEVELS,
        gridSpacing: GRID_SPACING,
        orderSize: ORDER_SIZE,
        autoRecenter: true,
        relevelThreshold: REQUOTE_THRESHOLD,
      },
      signerClient, wsPrivate, executor, tracker,
    );
  } else if (STRATEGY === 'perp_mm') {
    strategy = new PerpetualMMStrategy(
      {
        ...common,
        maxOpenOrders: 4,
        orderSize: ORDER_SIZE,
        bidSpreadBps: SPREAD_BPS,
        inventorySkewBps: 2 * SPREAD_BPS,
        maxInventoryFraction: 0.5,
        requoteThreshold: REQUOTE_THRESHOLD,
        priceSource: 'mid',
      },
      signerClient, wsPrivate, executor, tracker,
    );
  } else if (STRATEGY === 'arb_mm') {
    strategy = new ArbitrageStrategy(
      {
        ...common,
        maxOpenOrders: 4,
        fairPriceSource: 'mark',
        threshold: HALF_SPREAD,
        orderSize: ORDER_SIZE,
        maxSlippage: 0.001,
        makerExecution: true,
        requoteThreshold: REQUOTE_THRESHOLD,
        inventorySkew: 1.0,
        maxInventoryFraction: 0.5,
      },
      signerClient, wsPrivate, executor, tracker,
    );
  } else {
    // as_mm (default) — real Avellaneda-Stoikov, not a spread heuristic.
    // sigma is estimated live from mid samples, so no MM_AS_SIGMA default here:
    // pinning it would freeze the model's only view of market risk.
    strategy = new AvellanedaStoikovMM(
      {
        ...common,
        maxOpenOrders: 4,
        orderSize: ORDER_SIZE,
        gamma: AS_GAMMA,
        kappa: AS_KAPPA,
        timeHorizonMs: AS_HORIZON_MS,
        infiniteHorizon: AS_INFINITE_HORIZON,
        minHalfSpreadBps: AS_MIN_HALF_SPREAD_BPS,
        maxHalfSpreadBps: AS_MAX_HALF_SPREAD_BPS,
        maxInventoryFraction: 0.5,
        requoteThreshold: REQUOTE_THRESHOLD,
        priceSource: 'mid',
        ...(process.env.MM_AS_SIGMA ? { sigma: parseFloat(process.env.MM_AS_SIGMA) } : {}),
      },
      signerClient, wsPrivate, executor, tracker,
    );
  }

  return { strategy, tracker, wsPrivate, signerClient, executor };
}

async function runCrossVenue(counters: { orders: number; fills: number; cancels: number; errors: number }): Promise<{ strategy: CrossVenueMM; trackers: OrderTracker[]; executors: WsExecutor[]; stats: StatsAggregator }> {
  const corePrivateKey = requireKeyFrom(
    ['CORE_API_PRIVATE_KEY', 'LIGHTER_MAINNET_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
    'cross-venue runner: Core (mainnet) key',
  );
  const rhPrivateKey = requireKeyFrom(
    ['RH_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
    'cross-venue runner: Robinhood key',
  );
  const coreAccountIndex = parseInt(
    process.env.CORE_ACCOUNT_INDEX ||
    process.env.LIGHTER_MAINNET_ACCOUNT_INDEX ||
    process.env.ACCOUNT_INDEX || '0', 10);
  const rhAccountIndex = parseInt(
    process.env.RH_ACCOUNT_INDEX ||
    process.env.ACCOUNT_INDEX || '0', 10);
  const coreApiKeyIndex = parseInt(
    process.env.CORE_API_KEY_INDEX ||
    process.env.LIGHTER_MAINNET_API_KEY_INDEX ||
    process.env.API_KEY_INDEX || '0', 10);
  const rhApiKeyIndex = parseInt(
    process.env.RH_API_KEY_INDEX ||
    process.env.API_KEY_INDEX || '0', 10);

  const coreSigner = new SignerClient({ network: 'mainnet', privateKey: corePrivateKey, accountIndex: coreAccountIndex, apiKeyIndex: coreApiKeyIndex });
  await coreSigner.initialize();
  await coreSigner.ensureWasmClient();
  const rhSigner = new SignerClient({ network: 'robinhood', privateKey: rhPrivateKey, accountIndex: rhAccountIndex, apiKeyIndex: rhApiKeyIndex });
  await rhSigner.initialize();
  await rhSigner.ensureWasmClient();
  console.log('[INIT] Both SignerClients initialized');
  await ensureIntegratorApproval(coreSigner, 'mainnet');
  await ensureIntegratorApproval(rhSigner, 'robinhood');

  const coreWs = new WsPrivateClient({
    url: resolveWsUrl(NETWORKS.mainnet),
    auth: new SignerAuthTokenProvider(coreSigner),
    accountId: coreAccountIndex,
    txTimeoutMs: 5000,
  });
  await coreWs.connect();
  const rhWs = new WsPrivateClient({
    url: resolveWsUrl(NETWORKS.robinhood),
    auth: new SignerAuthTokenProvider(rhSigner),
    accountId: rhAccountIndex,
    txTimeoutMs: 5000,
  });
  await rhWs.connect();
  console.log('[INIT] Both WsPrivateClients connected');

  const coreExecutor = new WsExecutor(coreSigner, coreWs, { httpFallback: true, wsTxTimeoutMs: 5000 });
  const rhExecutor = new WsExecutor(rhSigner, rhWs, { httpFallback: true, wsTxTimeoutMs: 5000 });
  const coreTracker = new OrderTracker(coreAccountIndex);
  const rhTracker = new OrderTracker(rhAccountIndex);

  const strategy = new CrossVenueMM(
    {
      marketId: MARKET_ID,
      accountAId: coreAccountIndex,
      accountBId: rhAccountIndex,
      edgeBps: SPREAD_BPS,
      orderSize: ORDER_SIZE,
      maxNetPosition: MAX_POSITION * 2,
      maxPositionPerVenue: MAX_POSITION,
      maxOpenOrdersPerVenue: 4,
      hedgeOnFill: true,
      hedgeSlippage: 0.002,
      tickIntervalMs: 1000,
      selfTradeBehavior: 0,
      reconnectTimeoutMs: 30000,
      // Leverage applied on BOTH venues at startup (CrossVenueMM.applyLeverage).
      // Per-venue overrides fall back to the shared value.
      ...(LEVERAGE !== undefined ? { leverage: LEVERAGE } : {}),
      ...(LEVERAGE_A !== undefined ? { leverageA: LEVERAGE_A } : {}),
      ...(LEVERAGE_B !== undefined ? { leverageB: LEVERAGE_B } : {}),
      // Per-venue builder attribution (indexes differ between Core and RH).
      // The tags below must match the venue tags passed to CrossVenueMM.
      ...crossVenueIntegratorFields({ core: 'mainnet', rh: 'robinhood' }, 'mainnet'),
    },
    { network: 'mainnet', signerClient: coreSigner, wsPrivate: coreWs, executor: coreExecutor, tracker: coreTracker, tag: 'core' },
    { network: 'robinhood', signerClient: rhSigner, wsPrivate: rhWs, executor: rhExecutor, tracker: rhTracker, tag: 'rh' },
  );

  const stats = new StatsAggregator();
  wireLogging(coreTracker, coreExecutor, stats, counters, 'core');
  wireLogging(rhTracker, rhExecutor, stats, counters, 'rh');
  stats.attachStrategy(strategy as any);
  stats.attachCrossVenue(strategy as any);

  return { strategy, trackers: [coreTracker, rhTracker], executors: [coreExecutor, rhExecutor], stats };
}

/**
 * FLATTEN-ALL SAFETY NET — never leave positions open after a test run.
 * Queries each venue's account REST API for live positions and closes any
 * nonzero position with a reduce-only market order. Runs after strategy.stop()
 * (which cancels all orders) as the final shutdown step.
 *
 * Returns true only when every venue was READ BACK flat. An accepted close tx
 * is not proof the position closed, so the caller must not announce a flat book
 * on the strength of this having been called.
 */
async function flattenAllVenues(): Promise<boolean> {
  let allFlat = true;
  const venues: Array<{ label: string; network: 'mainnet' | 'robinhood'; key: string; acct: number; keyIdx: number }> = [];

  if (STRATEGY === 'cross_mm') {
    venues.push({
      label: 'core',
      network: 'mainnet',
      key: requireKeyFrom(
        ['CORE_API_PRIVATE_KEY', 'LIGHTER_MAINNET_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
        'flatten safety net: Core key',
      ),
      acct: parseInt(process.env.CORE_ACCOUNT_INDEX || process.env.LIGHTER_MAINNET_ACCOUNT_INDEX || process.env.ACCOUNT_INDEX || '0', 10),
      keyIdx: parseInt(process.env.CORE_API_KEY_INDEX || process.env.LIGHTER_MAINNET_API_KEY_INDEX || process.env.API_KEY_INDEX || '0', 10),
    });
    venues.push({
      label: 'rh',
      network: 'robinhood',
      key: requireKeyFrom(['RH_API_PRIVATE_KEY', 'API_PRIVATE_KEY'], 'flatten safety net: RH key'),
      acct: parseInt(process.env.RH_ACCOUNT_INDEX || process.env.ACCOUNT_INDEX || '0', 10),
      keyIdx: parseInt(process.env.RH_API_KEY_INDEX || process.env.API_KEY_INDEX || '0', 10),
    });
  } else {
    const isMain = singleVenueNetworkName() === 'mainnet';
    venues.push({
      label: isMain ? 'core' : 'rh',
      network: isMain ? 'mainnet' : 'robinhood',
      key: isMain
        ? requireKeyFrom(
            ['LIGHTER_MAINNET_API_PRIVATE_KEY', 'API_PRIVATE_KEY'],
            'flatten safety net: mainnet key',
          )
        : requireKeyFrom(['API_PRIVATE_KEY'], 'flatten safety net: key'),
      acct: isMain
        ? parseInt(process.env.LIGHTER_MAINNET_ACCOUNT_INDEX || process.env.ACCOUNT_INDEX || '0', 10)
        : parseInt(process.env.ACCOUNT_INDEX || '0', 10),
      keyIdx: isMain
        ? parseInt(process.env.LIGHTER_MAINNET_API_KEY_INDEX || process.env.API_KEY_INDEX || '0', 10)
        : parseInt(process.env.API_KEY_INDEX || '0', 10),
    });
  }

  for (const v of venues) {
    try {
      const signer = new SignerClient({ network: v.network, privateKey: v.key, accountIndex: v.acct, apiKeyIndex: v.keyIdx });
      await signer.initialize();
      await signer.ensureWasmClient();
      const auth = await signer.createAuthToken();
      const api = new ApiClient({ host: NETWORKS[v.network].apiUrl });
      const accountApi = new AccountApi(api);

      /** Live positions per the venue — the only thing that proves a close. */
      const readPositions = async (): Promise<any[]> => {
        const acct = await accountApi.getAccount({ by: 'index', value: String(v.acct) }, auth);
        return (acct?.positions || []).filter((p: any) => parseFloat(p.position) !== 0);
      };

      let positions: any[] = [];
      try {
        positions = await readPositions();
      } catch (e) {
        // Can't read the book, so can't claim it's flat.
        console.log(`[FLATTEN ${v.label}] position query failed: ${e instanceof Error ? e.message : String(e)}`);
        allFlat = false;
        await api.close();
        await signer.close();
        continue;
      }

      if (positions.length === 0) {
        console.log(`[FLATTEN ${v.label}] already flat`);
        await api.close();
        await signer.close();
        continue;
      }

      // Two passes at most: send the closes, let the sequencer apply them, read
      // back. The second pass covers a close that was accepted but didn't fill.
      for (let pass = 1; pass <= 2 && positions.length > 0; pass++) {
        console.log(`[FLATTEN ${v.label}] closing ${positions.length} open position(s)... (pass ${pass}/2)`);
        for (const p of positions) {
          // Order-book details give the per-market size decimals for unit conversion
          const orderApi = new OrderApi(api);
          const details = await orderApi.getOrderBookDetailsRaw(p.market_id);
          const d = details.order_book_details?.[0];
          const baseScale = Math.pow(10, d?.size_decimals ?? 5);
          const posSize = Math.abs(parseFloat(p.position));
          const baseAmount = Math.round(posSize * baseScale);
          const isLong = p.sign === 1;

          // avgExecutionPrice is the WORST price this close accepts, so the
          // buffer has to move AGAINST the position: a floor below the book to
          // sell, a ceiling above it to buy. This was `entry * quoteScale * 10`
          // in both directions — for a long, a sell floor ten times above the
          // market, which rests instead of crossing and leaves the position
          // open. getBestPrice returns an already-scaled integer price.
          const bestPrice = await signer.getBestPrice(p.market_id, isLong);
          const refPx = isLong ? Math.floor(bestPrice * 0.99) : Math.ceil(bestPrice * 1.01);

          const [tx, , err] = await signer.createMarketOrder({
            marketIndex: p.market_id,
            clientOrderIndex: Date.now() + Math.floor(Math.random() * 10000),
            baseAmount,
            avgExecutionPrice: refPx,
            isAsk: isLong,
            reduceOnly: true,
            // Taker market close — attribute it to this venue's builder
            ...(integratorIndexForVenue(v.network) !== undefined && { integratorAccountIndex: integratorIndexForVenue(v.network) }),
            ...(INTEGRATOR_TAKER_FEE !== undefined && { integratorTakerFee: INTEGRATOR_TAKER_FEE }),
            ...(INTEGRATOR_MAKER_FEE !== undefined && { integratorMakerFee: INTEGRATOR_MAKER_FEE }),
          } as any);
          if (err) {
            console.log(`[FLATTEN ${v.label}] close FAILED mkt=${p.market_id} size=${posSize}: ${err}`);
          } else {
            console.log(`[FLATTEN ${v.label}] close sent mkt=${p.market_id} ${isLong ? 'SELL' : 'BUY'} ${posSize} @${isLong ? '>=' : '<='}${refPx} (tx=${tx?.hash?.slice(0, 18) ?? 'n/a'}...)`);
          }
        }

        // Let the sequencer apply the fills before reading the book back.
        await new Promise((resolve) => setTimeout(resolve, 3000));
        try {
          positions = await readPositions();
        } catch (e) {
          console.log(`[FLATTEN ${v.label}] verify query failed: ${e instanceof Error ? e.message : String(e)}`);
          allFlat = false;
          break;
        }
      }

      if (positions.length === 0) {
        console.log(`[FLATTEN ${v.label}] verified flat`);
      } else {
        allFlat = false;
        for (const p of positions) {
          console.log(`[FLATTEN ${v.label}] STILL OPEN mkt=${p.market_id} size=${p.position} sign=${p.sign}`);
        }
      }

      await api.close();
      await signer.close();
    } catch (e) {
      console.log(`[FLATTEN ${v.label}] venue-level failure: ${e instanceof Error ? e.message : String(e)}`);
      allFlat = false;
    }
  }

  return allFlat;
}

/**
 * Ensure integrator attribution is approved on a venue before quoting.
  *
  * There is no REST endpoint to read existing approvals, so when
  * INTEGRATOR_AUTO_APPROVE=1 (default) the runner (re-)submits the
  * APPROVE_INTEGRATOR tx at startup — per the partner-attribution spec a
  * re-approve simply overwrites the prior approval, so this is idempotent
  * for identical values.
  *
  * SIGNATURE REQUIREMENTS (checked BEFORE any tx is sent):
  * - Same L1 address as the integrator account, or all fees zero:
  *   L2 API-key signature only — no ETH_PRIVATE_KEY needed.
  * - Cross-L1 integrator with nonzero fees: the approve tx needs the
  *   trader's L1 signature. ETH_PRIVATE_KEY must be set, and we verify it
  *   derives the same L1 address as the trading account — if missing or
  *   mismatched the runner EXITS instead of submitting a doomed tx
  *   (a failed approve means orders carry attribution the sequencer will
  *   reject). Override with INTEGRATOR_AUTO_APPROVE=0 after approving once.
  *
  * Note: re-approving with SMALLER caps than a previous approval reduces
  * them — set caps explicitly if the account already approved higher ones.
  */
async function ensureIntegratorApproval(signer: SignerClient, venue: 'mainnet' | 'robinhood'): Promise<void> {
  const venueLabel = venue;
  const INTEGRATOR_INDEX = integratorIndexForVenue(venue);
  if (INTEGRATOR_INDEX === undefined || !INTEGRATOR_AUTO_APPROVE) return;
  const taker = INTEGRATOR_TAKER_FEE ?? 0;
  const maker = INTEGRATOR_MAKER_FEE ?? 0;
  const expiry = Date.now() + INTEGRATOR_EXPIRY_SECONDS * 1000;
  const ethPrivateKey = process.env.ETH_PRIVATE_KEY || undefined;

  /** Abort the run — attribution is revenue-critical, never trade unattributed. */
  const fail = (msg: string): never => {
    throw new Error(`[INTEGRATOR] venue=${venueLabel}: ${msg}\n[INTEGRATOR] The run was aborted BEFORE any order was placed. Fix the issue above, or disable attribution explicitly with INTEGRATOR_ACCOUNT_INDEX=0 (unattributed trading).`);
  };

  // Pre-flight: does this approval need an L1 signature, and do we have a
  // matching key? Same-L1 (or zero-fee) approvals pass without a wallet.
  if (taker > 0 || maker > 0) {
    let integratorL1: string | undefined;
    try {
      const auth = await signer.createAuthToken();
      const accountApi = (signer as any).accountApi as AccountApi;
      const integratorAcct = await accountApi.getAccount({ by: 'index', value: String(INTEGRATOR_INDEX) }, auth);
      integratorL1 = (integratorAcct as any)?.l1_address;
    } catch {
      // Account lookup failed — assume cross-L1 (conservative).
    }

    let traderL1: string | undefined;
    try {
      const auth = await signer.createAuthToken();
      const accountApi = (signer as any).accountApi as AccountApi;
      const traderAcct = await accountApi.getAccount({ by: 'index', value: String((signer as any).config.accountIndex) }, auth);
      traderL1 = (traderAcct as any)?.l1_address;
    } catch {
      // ignore — fall through to key checks
    }

    const sameL1 = !!(integratorL1 && traderL1 && integratorL1.toLowerCase() === traderL1.toLowerCase());

    if (!sameL1) {
      if (!ethPrivateKey) {
        fail(`integrator ${INTEGRATOR_INDEX} is on a DIFFERENT L1 address and fees are nonzero — the approve tx requires your L1 (Ethereum) signature. Set ETH_PRIVATE_KEY in .env (it is used ONLY for this one-time approve signature; trading itself stays L2/API-key), or approve once via a wallet with INTEGRATOR_OP=approve npx tsx examples/integrator_integration.ts and then set INTEGRATOR_AUTO_APPROVE=0.`);
      }
      try {
        const ethers = await import('ethers');
        const keyAddress = new ethers.Wallet(ethPrivateKey as string).address;
        if (traderL1 && keyAddress.toLowerCase() !== traderL1.toLowerCase()) {
          fail(`ETH_PRIVATE_KEY derives ${keyAddress} but the trading account L1 is ${traderL1} — the L1 signature would be invalid. Fix ETH_PRIVATE_KEY or approve via your wallet.`);
        }
        console.log(`[INTEGRATOR] venue=${venueLabel}: cross-L1 approval detected — using ETH_PRIVATE_KEY for the L1 signature (one-time).`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('[INTEGRATOR]')) throw e;
        fail(`invalid ETH_PRIVATE_KEY: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      console.log(`[INTEGRATOR] venue=${venueLabel}: integrator shares this account's L1 address — L2 signature only, no wallet needed.`);
    }
  }

  console.log(`[INTEGRATOR] venue=${venueLabel}: submitting APPROVE_INTEGRATOR for integrator=${INTEGRATOR_INDEX} taker=${taker} maker=${maker} expiry=${new Date(expiry).toISOString()}`);
  const [, txHash, err] = await signer.approveIntegrator({
    integratorIndex: INTEGRATOR_INDEX,
    maxPerpsTakerFee: taker,
    maxPerpsMakerFee: maker,
    maxSpotTakerFee: taker,
    maxSpotMakerFee: maker,
    approvalExpiry: expiry,
    // exactOptionalPropertyTypes: omit rather than pass an explicit undefined
    ...(ethPrivateKey ? { ethPrivateKey } : {}),
  });
  if (err) {
    fail(`approve tx FAILED: ${err}. The sequencer would reject attributed orders without a valid approval — this is revenue-critical. Retry, or approve manually: INTEGRATOR_OP=approve npx tsx examples/integrator_integration.ts`);
  }
  if (!txHash) {
    fail(`approve tx returned no hash (submission may not have reached the sequencer).`);
  }
  console.log(`[INTEGRATOR] venue=${venueLabel}: approved (tx=${txHash.slice(0, 18)}...)`);
}

async function main() {
  console.log(`=== Unified MM Runner — strategy=${STRATEGY} | cycle=${CYCLE_MS}ms | market=${MARKET_ID} ===`);
  if (!['as_mm', 'arb_mm', 'perp_mm', 'grid', 'cross_mm'].includes(STRATEGY)) {
    throw new Error(
      `Unknown MM_STRATEGY "${STRATEGY}". Valid: as_mm | arb_mm | perp_mm | grid | cross_mm`,
    );
  }
  console.log(`Order size: ${ORDER_SIZE} units | Max position: ${MAX_POSITION} units | Spread: ${SPREAD_BPS}bps | Half-spread: $${HALF_SPREAD}`);
  // Attribution disclosure — printed before a single order is placed, so the
  // user always knows what is being attributed and how to turn it off.
  printAttributionDisclosureForNetworks(...RUN_NETWORKS);
  if (!ATTRIBUTION_DISABLED) {
    console.log(`Auto-approve integrator: ${INTEGRATOR_AUTO_APPROVE ? 'yes' : 'no (INTEGRATOR_AUTO_APPROVE=0)'}`);
  }
  console.log(`Run duration: ${RUN_DURATION_MS / 60000} minutes`);
  console.log(`---`);

  const counters = { orders: 0, fills: 0, cancels: 0, errors: 0 };
  let strategyObj: any;
  let mainTracker: OrderTracker | null = null;
  let crossTrackers: OrderTracker[] = [];
  let crossExecutors: WsExecutor[] = [];
  let venueTags: string[] = ['default'];
  let statsAgg: StatsAggregator | null = null;

  if (STRATEGY === 'cross_mm') {
    const { strategy, trackers, executors, stats } = await runCrossVenue(counters);
    strategyObj = strategy;
    crossTrackers = trackers;
    crossExecutors = executors;
    venueTags = strategy.getVenueTags();
    statsAgg = stats;
  } else {
    const { strategy, tracker, wsPrivate } = await setupSingleVenue();
    strategyObj = strategy;
    mainTracker = tracker;
    const stats = new StatsAggregator();
    const executor = (strategy as any).getExecutor();
    wireLogging(tracker, executor, stats, counters);
    stats.attachStrategy(strategy as any);
    statsAgg = stats;
    void wsPrivate;
  }

  // ── File logging (default OFF) ─────────────────────────────────────────
  const fileLogging = setupFileLogging(`mm-${STRATEGY}`);
  if (fileLogging.path) {
    console.log(`[LOG] file logging ON \u2192 ${fileLogging.path}`);
  }

  // ── Hot config file (default OFF; auto-filled + re-read every cycle) ──
  const hotConfig = setupHotConfig();
  const hotKnown: Record<string, number | boolean | undefined> = {};
  if (hotConfig.path) {
    const editable = strategyObj.getEditableConfig?.() ?? [];
    hotConfig.writeInitial(
      editable.map((f: { key: string; label: string; get: () => number | boolean | undefined }) => ({
        key: f.key,
        label: f.label,
        value: f.get(),
      })),
    );
    // Seed every editable key (undefined = known-but-unset) so the file can
    // also set knobs the run started without — e.g. leverage.
    for (const f of editable) hotKnown[f.key] = f.get();
  }

  // ── Dashboard (live CLI; skipped with MM_NO_DASHBOARD or non-TTY) ───────
  const useDashboard = process.env.MM_NO_DASHBOARD !== '1' && Boolean(process.stdout.isTTY);
  let dashboard: Dashboard | null = null;
  if (useDashboard && statsAgg) {
    dashboard = new Dashboard({
      stats: statsAgg,
      trackers: STRATEGY === 'cross_mm' ? crossTrackers : mainTracker!,
      executors: STRATEGY === 'cross_mm'
        ? crossExecutors
        : (strategyObj as any).getExecutor(),
      strategy: strategyObj,
      crossVenue: STRATEGY === 'cross_mm',
      venueTags,
      refreshMs: 250,
      ...(fileLogging.path ? { onEvent: fileLogging.logEvent } : {}),
    });
  }

  // Headless status line (kept when the dashboard is off or unavailable).
  const statusInterval = setInterval(() => {
    if (useDashboard && dashboard) return;
    const pos = mainTracker?.getPosition(MARKET_ID);
    const posStr = pos && pos.size !== 0
      ? ` | POS sign=${pos.sign} size=${pos.size} uPnL=${pos.unrealizedPnl.toFixed(4)}`
      : ' | flat';
    console.log(`[STATUS] state=${strategyObj.getState?.() ?? 'running'} orders=${counters.orders} fills=${counters.fills} cancels=${counters.cancels} errors=${counters.errors}${posStr}`);
  }, 30000);

  console.log('[INIT] Starting strategy...');
  if (dashboard) dashboard.start();
  await strategyObj.start();
  console.log(`[INIT] Strategy started. Running for ${RUN_DURATION_MS / 60000} minutes...`);

  // Hot config re-read: every cycle, apply file edits without a restart.
  // `hotKnown` mirrors the STRATEGY's effective values (kept in sync via the
  // configUpdated event, which fires for menu edits too) so a Space-menu
  // change can never be ping-ponged back by a stale file value.
  const hotConfigTimer = setInterval(() => {
    if (!hotConfig.path) return;
    const changes = hotConfig.readChanges(hotKnown);
    const keys = Object.keys(changes);
    if (keys.length === 0) return;
    try {
      strategyObj.updateConfig(changes);
      console.log(`[CONFIG] hot config applied: ${keys.map((k) => `${k}=${changes[k]}`).join(', ')}`);
    } catch (e) {
      console.log(`[CONFIG] hot config rejected: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, Math.min(CYCLE_MS, 5000));

  if (hotConfig.path) {
    (strategyObj as any).on('configUpdated', (ev: { keys: string[]; config: Record<string, any> }) => {
      for (const k of ev.keys ?? []) {
        if (k in hotKnown) hotKnown[k] = ev.config?.[k];
      }
    });
  }

  const shutdown = async (reason: string) => {
    console.log(`\n=== ${reason} ===`);
    clearInterval(statusInterval);
    clearInterval(hotConfigTimer);
    dashboard?.stop();
    try {
      await strategyObj.stop();
    } catch (e) {
      console.log(`[SHUTDOWN] strategy.stop() error: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Final PnL line — same source the dashboard showed. Cross-venue runs
    // also print each venue's bucket so the totals can be reconciled against
    // the venues' own reporting.
    if (statsAgg) {
      statsAgg.updateUnrealizedPnl();
      console.log(
        `[SHUTDOWN] PnL: realized=${statsAgg.realizedPnl.toFixed(4)} unrealized=${statsAgg.unrealizedPnl.toFixed(4)} total=${statsAgg.getTotalPnl().toFixed(4)} | volume=${statsAgg.totalVolume.toFixed(2)} fills=${statsAgg.fillCount}`,
      );
      if (STRATEGY === 'cross_mm') {
        for (const tag of venueTags) {
          const v = statsAgg.getVenueStats(tag);
          if (v) {
            console.log(
              `[SHUTDOWN] ${tag}: realized=${v.realizedPnl.toFixed(4)} unrealized=${v.unrealizedPnl.toFixed(4)} vol=${v.volume.toFixed(2)} fills=${v.fills} funding=${v.funding.toFixed(6)}`,
            );
          }
        }
      }
    }
    console.log(`Final: orders=${counters.orders} fills=${counters.fills} cancels=${counters.cancels} errors=${counters.errors}`);
    // SAFETY NET: verify flat on every venue; close anything left over.
    const allFlat = await flattenAllVenues();
    if (allFlat) {
      console.log('[SHUTDOWN] All venues flat. Done.');
    } else {
      console.log(
        '[SHUTDOWN] WARNING: a position could not be verified closed — see the [FLATTEN] lines above.\n' +
          '           Close it before the next run: npx tsx examples/close_all_positions.ts',
      );
    }
    // Closing ask: thank supporters, or invite opted-out users to support
    // development. Never blocks or alters the exit path.
    // Every network the run touched, not just the first: cross_mm stamps a
    // different integrator on each venue and disclosed both at startup.
    printSupportNoticeForNetworks(...RUN_NETWORKS);
    fileLogging.close();
    // Non-zero when the book could not be verified flat, so a wrapper script
    // sees a failure instead of reading the support banner as a clean finish.
    process.exit(allFlat ? 0 : 1);
  };

  const stopTimer = setTimeout(() => void shutdown('RUN COMPLETE'), RUN_DURATION_MS);

  process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Ctrl-C received...');
    clearTimeout(stopTimer);
    void shutdown('SIGINT SHUTDOWN');
  });
}

if (PRINT_CONFIG_ONLY) {
  printResolvedConfig();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});