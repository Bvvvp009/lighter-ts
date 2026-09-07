# Market Making Configuration Guide

This guide is the **class-level** reference: every config field on every
strategy class, how prices/sizes are scaled, and copy-paste-ready example
configs for constructing the strategies yourself in TypeScript.

If you just want to *run* a strategy from the terminal, start with
[STRATEGIES.md](./STRATEGIES.md) instead — it documents the `MM_*` env vars and
CLI flags of the unified runner, with launch commands for each of the five
strategies.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Price & Size Scaling](#price--size-scaling)
- [Common Config (StrategyConfig)](#common-config-strategyconfig)
- [Strategy 1: Arbitrage / Fair-price maker `arb_mm` (ArbitrageStrategy)](#strategy-1-arbitrage--fair-price-maker-arb_mm)
- [Strategy 2: Grid (GridStrategy)](#strategy-2-grid)
- [Strategy 3: Perpetual MM (PerpetualMMStrategy)](#strategy-3-perpetual-mm)
- [Strategy 4: Cross-Venue MM (CrossVenueMM)](#strategy-4-cross-venue-mm)
- [Dashboard Config](#dashboard-config)
- [Env Variables](#env-variables)
- [Choosing the Right Strategy](#choosing-the-right-strategy)

---

## Prerequisites

```env
# .env file
LIGHTER_NETWORK=robinhood          # mainnet | testnet | robinhood | robinhood-testnet
API_PRIVATE_KEY=...                # Lighter API key: 80 hex chars, NOT your wallet key
ACCOUNT_INDEX=76                   # your account index on the venue
API_KEY_INDEX=0                    # API key index (from createApiKey)
```

You need:
1. A funded account with USDC collateral
2. An API key created via `signerClient.createApiKey()`
3. For cross-venue: accounts on BOTH Core (mainnet) and Robinhood

---

## Architecture: ONE merged WS connection

All MM strategies use a single `/stream` WebSocket (`WsPrivateClient`) for:
- Market data (ticker, order book, market stats)
- Private fill/cancel/position events (auth via `SignerAuthTokenProvider`)
- **Signed transaction submission** (`jsonapi/sendtx` + `jsonapi/sendtxbatch`,
  verified live on mainnet AND Robinhood)

A full requote (cancel + cancel + place bid + place ask) is **one**
`sendtxbatch` message — 4 transactions, 1 request. HTTP is only a fallback
path (rate-limited via `RateLimiter`).

**Nonce model** (`OptimisticNonceManager`, lighter-python parity): lazy
per-key fetch, local increment (no server round-trip per tx), decrement on
failure, hard-refresh on "invalid nonce", and per-key locks so same-key txs
reach the sequencer in nonce order. With multiple API keys
(`apiPrivateKeys`), sends rotate across keys and run in parallel.

**Keepalive**: the client replies `pong` to server `ping` automatically —
sessions no longer stale out (this was the root cause of the 3s WS timeouts).

---

## Price & Size Scaling

**Critical**: The WASM signer expects prices and sizes in **protocol integer units**,
not human-readable dollars/ETH. The strategy base class handles this automatically
via `priceToUnits()` and `amountToUnits()` using the market's decimal config.

| Market | price_decimals | quoteScale (10^decimals) | size_decimals | baseScale (10^decimals) |
|--------|---------------|--------------------------|---------------|-------------------------|
| ETH perp (id=0) | 2 | 100 | 4 | 10000 |
| BTC perp (id=1) | 1 | 10 | 5 | 100000 |

### How to specify order size

Config fields like `orderSize` and `maxPositionSize` are in **protocol base units**:

| Human amount | ETH (baseScale=10000) | BTC (baseScale=100000) |
|---|---|---|
| 0.001 | 10 | 100 |
| 0.005 | 50 | 500 |
| 0.01 | 100 | 1000 |
| 0.05 | 500 | 5000 |
| 0.1 | 1000 | 10000 |
| 0.5 | 5000 | 50000 |
| 1.0 | 10000 | 100000 |

Formula: `orderSize = humanAmount * baseScale`

### How threshold/spacing works

Config fields like `threshold` (arb), `gridSpacing` (grid), `edgeBps` (cross-venue)
are in **human-readable dollar units** (for arb/grid) or **basis points** (cross-venue).
The strategy converts them to protocol units before sending to the signer.

- `threshold: 5` = $5 deviation from fair price
- `gridSpacing: 10` = $10 between grid levels
- `edgeBps: 5` = 0.05% of fair price (5 bps)

---

## Common Config (StrategyConfig)

All three strategies share these base fields (from `StrategyConfig`):

```typescript
{
  // ── Required ────────────────────────────────────────────────────────────
  marketId: 1,                  // Market index: 0=ETH perp, 1=BTC perp
  accountId: 76,                // Your account index (for WS private channels)
  maxPositionSize: 50000,       // Max abs position in base units (see table above)
                                //   BTC: 50000 = 0.5 BTC max
                                //   ETH: 50000 = 5 ETH max
  maxOpenOrders: 5,             // Max simultaneous open orders per market
                                //   Standard tier: 30/market, 250 total
                                //   Plus tier: 100/market, 1000 total

  // ── Order cadence ────────────────────────────────────────────────────────
  cycleMs: 12000,               // Order-operations cycle (PRIMARY knob, hummingbot-style).
                                 //   ONE cycle = at most ONE cancel-and-requote batch
                                 //   (a single sendtxbatch WS message). Between cycles,
                                 //   ticks only refresh market data / detect fills.
                                 //   10000 = conservative, 5000 = active, 12000 = user setting
  tickIntervalMs: 1000,         // Market-data tick (ms). Does NOT trigger order ops —
                                 //   only the cycle does. Keep fast for fresh quotes.

  // ── Order behavior ──────────────────────────────────────────────────────
  makerOnly: true,              // true = POST_ONLY (maker, earns spread)
                                // false = allow taker fills
  selfTradeBehavior: 0,         // 0=EXPIRE_MAKER (default), 1=EXPIRE_TAKER,
                                //   2=EXPIRE_BOTH, 3=REDUCE

  // ── Risk controls ───────────────────────────────────────────────────────
  reconnectTimeoutMs: 30000,    // Emergency stop if WS down longer than this
  tickIntervalMs: 500,          // How often onTick() runs (ms)
                                 //   500 = fast (arb/cross-venue)
                                 //   1000 = normal (grid)

  // ── Leverage (optional) ────────────────────────────────────────────────
  leverage: 3,                   // Set on the venue at EVERY start() via
                                 //   updateLeverage(marketId, marginMode=0, leverage).
                                 //   The venue converts to IMF = 10000/leverage
                                 //   (3x -> IMF 3333). Pre-validated against the
                                 //   venue's min IMF (BTC: core max 50x, RH max
                                 //   5x); a failed update aborts the start.
                                 //   Omit to leave the venue's setting alone.
  marginMode: 0,                 // 0 = CROSS (default), 1 = ISOLATED

  // cross_mm only — per-venue leverage (venue A = core, venue B = robinhood):
  // leverageA: 10,               // overrides `leverage` for venue A
  // leverageB: 5,                // overrides `leverage` for venue B

  // ── Builder fee attribution (optional) ──────────────────────────────────
  builderIntegratorIndex: 0,    // Integrator account for fee sharing (0 = none)
  integratorTakerFee: 0,        // Taker fee in bps (0 = no attribution)
  integratorMakerFee: 0,        // Maker fee in bps (0 = no attribution)
}
```

### Live config: `updateConfig()` + hot reload

Every strategy accepts mid-run config changes through
`strategy.updateConfig({ ...patch })` — no stop, no restart. The patch is
validated and applied at the top of the **next tick**, then folded into the
strategy's own config object (grid geometry, spreads, thresholds, γ/κ/σ,
leverage — all live-editable). The apply also **marks the strategy dirty**,
forcing a requote on the next cycle so the resting orders always reflect the
new value — even when the change is smaller than `requoteThreshold`. A
`leverage` patch re-sends the venue update (pre-validated against the venue's
cap). `marketId`/`accountId` are immutable mid-run.

Two front ends ship with the examples (both OFF by default, but the dashboard
menu is available on any TTY run):
- **Dashboard config menu** — press `Space` in the live dashboard; the list is
  auto-filled with current values and shows the matching config key. Arrows
  to select, Enter to edit inline (pre-filled), Enter to commit, Esc to
  cancel/close. Works on Windows too.
- **Hot config file** — `MM_HOT_CONFIG=1` (or `--hot-config`) writes an
  auto-filled `mm-config.json` which the runner re-reads every cycle (≤5 s).
  Edit + save; unset knobs are commented placeholders you can switch on.
  Menu and file edits share the strategy's live config as one source of
  truth — they cannot ping-pong.

### How to choose `maxPositionSize`

```
maxPositionSize = (collateral * maxLeverage) / (currentPrice * IMF)
```

Example: $100 collateral, 3x leverage, BTC at $77000, IMF=50% (5000 bps):
```
maxPositionSize = (100 * 3) / (77000 * 0.5) = 0.00779 BTC = 779 base units
```

But the exchange enforces the IMF at order placement, so your real limit is:
```
maxPositionSize = collateral / (price * IMF)
```
With $24 collateral, BTC at $77000, IMF=50%: max ~0.0006 BTC = 60 base units.

**Rule of thumb**: Set `maxPositionSize` to 2x your single order size so the
strategy can hold inventory from fills without immediately hitting the limit.

---

## Strategy 1: Arbitrage / Fair-price maker (`arb_mm`)

**File**: `src/strategies/arbitrage-strategy.ts`
**Example**: `examples/mm_arb_dashboard.ts`, `examples/run_arb_live.ts`
**Runner**: `MM_STRATEGY=arb_mm`

> Naming note: this strategy used to be called "A_S" in older docs. It is
> **not** Avellaneda-Stoikov. The real Avellaneda-Stoikov strategy is
> `AvellanedaStoikovMM` (`MM_STRATEGY=as_mm`), documented in
> [STRATEGIES.md](./STRATEGIES.md). This one quotes a fixed dollar edge
> around a fair price; that one solves for the spread from inventory and
> volatility.

Two modes:
- **Taker arb** (`makerExecution: false`): Crosses spread when bid/ask deviates from fair
- **Maker MM** (`makerExecution: true`): Continuously quotes both sides around fair price

### Config

```typescript
{
  // ── Common config (see above) ───────────────────────────────────────────
  marketId: 1,                  // BTC perp
  accountId: 76,
  maxPositionSize: 50000,       // 0.5 BTC max position
  maxOpenOrders: 5,
  makerOnly: true,              // Use POST_ONLY in maker mode
  selfTradeBehavior: 0,
  reconnectTimeoutMs: 30000,
  tickIntervalMs: 500,

  // ── Arb-specific ────────────────────────────────────────────────────────
  fairPriceSource: 'mark',      // 'mark' | 'index' | 'mid' | 'external'
                                //   mark  = exchange mark price (recommended)
                                //   index = index price (spot reference)
                                //   mid   = (bestBid + bestAsk) / 2
                                //   external = custom getExternalFairPrice()

  threshold: 15,                // In taker mode: min $ deviation to trigger trade
                                // In maker mode: half-spread from fair to quote
                                //   threshold=15 -> bid at mark-15, ask at mark+15
                                //   Must be > spread/2 to be profitable in taker mode
                                //   For BTC spread ~$30, use threshold >= 20

  orderSize: 50,                // BTC: 50 = 0.0005 BTC, ETH: 50 = 0.005 ETH
                                //   Must be >= min_base_amount * baseScale
                                //   BTC min = 0.0002 * 100000 = 20
                                //   ETH min = 0.005 * 10000 = 50

  maxSlippage: 0.001,           // Taker mode only: max slippage fraction (0.1%)
                                //   Market sell price = bid * (1 - slippage)
                                //   Market buy price = ask * (1 + slippage)

  cooldownMs: 2000,             // Min ms between order attempts
                                //   500 = aggressive, 2000 = moderate, 5000 = conservative

  makerExecution: true,         // TRUE = maker MM (earns spread, recommended)
                                // FALSE = taker arb (crosses spread, needs large threshold)

  requoteThreshold: 2,          // Maker mode: $ drift before re-quoting
                                //   1 = tight (frequent requotes, more API calls)
                                //   5 = loose (fewer requotes, staler quotes)
                                //   Robinhood rate limit: 40 req/60s
}
```

### Picking `fairPriceSource` (taker mode)

In taker mode the strategy trades only when the venue's own book crosses the
fair price by more than `threshold`, so this knob decides how often it trades
at all. Measured on Robinhood BTC over 30 seconds:

| Source | Relation to the venue book | Effect on a taker arb |
|--------|----------------------------|-----------------------|
| `mark` | tracked the venue's best bid to within ~$1 (`bestBid - mark` stayed between -$0.70 and +$0.20) | Fires only on a genuine dislocation. Long quiet stretches with no trades are the expected result, not a fault. |
| `index` | sat ~$31 **above** mark for the whole sample | A standing gap of that size is a funding basis, not a dislocation. With the default `threshold` it reads as a permanent signal and crosses the spread every cooldown, paying spread plus fees each time. |
| `mid` | equals the book by definition | `bestBid - mid` is always negative, so a taker arb against it never fires. |
| `external` | whatever `getExternalFairPrice()` returns | The only source that can see a real cross-venue dislocation. |

Two practical consequences:

- A taker run that places no orders is normal with `mark`. Before treating it
  as broken, check that fair price is arriving at all — `getFairPrice()`
  returning 0 makes the strategy a silent no-op, and that looks identical from
  the outside.
- Do not raise trade frequency by switching to `index`. Raise it, if at all, by
  lowering `threshold` with the costs in view: crossing the spread pays roughly
  half the spread plus taker fees on both legs.

### Example: Conservative maker MM on BTC

```typescript
const strategy = new ArbitrageStrategy(
  {
    marketId: 1,                // BTC
    accountId: 76,
    maxPositionSize: 50000,     // 0.5 BTC
    maxOpenOrders: 4,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,       // 1s tick
    fairPriceSource: 'mark',
    threshold: 20,              // $20 half-spread (bid at mark-20, ask at mark+20)
    orderSize: 50,              // 0.0005 BTC per order
    maxSlippage: 0.001,
    cooldownMs: 3000,           // 3s between requotes
    makerExecution: true,       // maker mode
    requoteThreshold: 5,        // requote only when fair drifts > $5
  },
  signerClient,
  wsPrivate,
  executor,
  tracker,
);
```

### Example: Aggressive taker arb on ETH

```typescript
const strategy = new ArbitrageStrategy(
  {
    marketId: 0,                // ETH
    accountId: 76,
    maxPositionSize: 500,       // 0.05 ETH
    maxOpenOrders: 3,
    makerOnly: false,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 250,        // fast tick
    fairPriceSource: 'mark',
    threshold: 5,               // $5 deviation to trigger (must > spread/2)
    orderSize: 50,              // 0.005 ETH
    maxSlippage: 0.002,         // 0.2% slippage tolerance
    cooldownMs: 1000,           // 1s cooldown
    makerExecution: false,      // taker mode
  },
  signerClient,
  wsPrivate,
  executor,
  tracker,
);
```

### How the sell/buy decision works

**Maker mode** (`makerExecution: true`):
```
fairPrice = markPrice (from WS market_stats channel)
bidQuote  = fairPrice - threshold    (e.g. mark - $20)
askQuote  = fairPrice + threshold    (e.g. mark + $20)

Every tick:
  1. If fair price drifted > requoteThreshold -> cancel all, place new bid + ask
  2. If bid filled -> position grows long, next requote skips bid (only ask)
  3. If ask filled -> position grows short, next requote skips ask (only bid)
  4. If |position| >= maxPositionSize -> only place reducing orders
```

**Taker mode** (`makerExecution: false`):
```
fairPrice = markPrice
SELL trigger: bestBid > fairPrice + threshold  (bid is rich -> sell into it)
BUY trigger:  bestAsk < fairPrice - threshold  (ask is cheap -> buy into it)

  - IOC market order, fills immediately at bestBid/bestAsk
  - Profitable only if threshold > half-spread (you capture more than you pay)
  - For BTC spread ~$30: threshold must be > $15 to be profitable
```

---

## Strategy 2: Grid

**File**: `src/strategies/grid-strategy.ts`
**Example**: `examples/mm_grid_dashboard.ts`

Places N limit orders above and below a center price at fixed spacing.
When an order fills, the opposite side is replenished. Inventory is
managed by skewing the grid center when position grows.

### Config

```typescript
{
  // ── Common config ───────────────────────────────────────────────────────
  marketId: 0,                  // ETH perp
  accountId: 76,
  maxPositionSize: 1000,        // 0.1 ETH max position
  maxOpenOrders: 20,            // 2 * gridLevels
  makerOnly: true,              // Grid always uses POST_ONLY
  selfTradeBehavior: 0,
  reconnectTimeoutMs: 30000,
  tickIntervalMs: 1000,

  // ── Grid-specific ───────────────────────────────────────────────────────
  gridLevels: 5,                // Number of levels per side (5 = 5 bids + 5 asks)
  gridSpacing: 5,               // $ spacing between levels (ETH: $5, BTC: $50)
  orderSize: 50,                // ETH: 50 = 0.005 ETH per level
  centerPrice: undefined,       // Manual center (undefined = auto from mid)
  autoRecenter: true,           // Re-center grid on current mid each tick
  relevelThreshold: 10,         // $ deviation from center before full re-level
                                //   10 = cancel all + re-place when mid drifts $10
}
```

### Example: ETH grid MM

```typescript
const strategy = new GridStrategy(
  {
    marketId: 0,                // ETH perp
    accountId: 76,
    maxPositionSize: 1000,      // 0.1 ETH max
    maxOpenOrders: 20,          // 10 levels total
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    tickIntervalMs: 1000,
    gridLevels: 5,              // 5 bids + 5 asks
    gridSpacing: 5,             // $5 between levels ($1, $5, $10, $15, $20 from mid)
    orderSize: 50,              // 0.005 ETH per order
    autoRecenter: true,
    relevelThreshold: 10,       // re-level when mid drifts $10
  },
  signerClient,
  wsPrivate,
  executor,
  tracker,
);
```

### How grid works

```
Center = midPrice (auto-updated)

Level 5:  ask @ center + $25  ────────  sell
Level 4:  ask @ center + $20  ────────  sell
Level 3:  ask @ center + $15  ────────  sell
Level 2:  ask @ center + $10  ────────  sell
Level 1:  ask @ center + $5   ────────  sell
          ════════ center (mid) ════════
Level 1:  bid @ center - $5   ────────  buy
Level 2:  bid @ center - $10  ────────  buy
Level 3:  bid @ center - $15  ────────  buy
Level 4:  bid @ center - $20  ────────  buy
Level 5:  bid @ center - $25  ────────  buy

When a bid fills (price drops), the level is refilled (buy again).
When an ask fills (price rises), the level is refilled (sell again).
When |position| > 50% of max, center shifts to favor reducing orders.
When mid drifts > relevelThreshold, all orders cancelled + re-placed.
```

---

## Strategy 3: Perpetual MM

**File**: `src/strategies/perp-mm-strategy.ts`
**Example**: `examples/run_perp_mm_live.ts`

Pure single-venue market maker (hummingbot `pure_mm` style). Quotes a
POST_ONLY bid and ask around the mid price with basis-point spreads per
side. Inventory skew shifts both quotes toward the reducing side; beyond
50% of max position only the reducing side is quoted (active unwind).
One cancel-and-requote batch per `cycleMs` (single sendtxbatch message).

### Config

```typescript
{
  // ── Common config (see above) ───────────────────────────────────────────
  marketId: 1,                  // BTC perp
  accountId: 76,
  maxPositionSize: 100,         // 0.001 BTC max
  maxOpenOrders: 4,
  makerOnly: true,              // POST_ONLY always
  selfTradeBehavior: 0,
  reconnectTimeoutMs: 30000,
  tickIntervalMs: 1000,
  cycleMs: 12000,               // order-operations cycle (PRIMARY knob)

  // ── Perp-MM-specific ────────────────────────────────────────────────────
  bidSpreadBps: 10,             // bid = mid * (1 - 10/10000) (~$8 at BTC $80k)
  askSpreadBps: 10,             // ask-side override (default: same as bid)
  orderSize: 50,                // 0.0005 BTC per side
  inventorySkewBps: 20,         // bps shift per unit inventory ratio
  maxInventoryFraction: 0.5,    // entry side off at 50% max position
  requoteThreshold: 10,         // $ mid drift before a requote is due
  priceSource: 'mid',           // 'mid' (default) | 'mark'
}
```

---

## Strategy 4: Cross-Venue MM

**File**: `src/strategies/cross-venue-mm.ts`
**Example**: `examples/mm_cross_venue_dashboard.ts`

Quotes POST_ONLY orders on two venues simultaneously. When filled on
one venue, hedges with a market order on the other. Earns the edge
between the two venues' prices.

### Config

```typescript
{
  // ── Market ──────────────────────────────────────────────────────────────
  marketId: 0,                  // Must be same on both venues (0=ETH)
  accountAId: 76,               // Core mainnet account index
  accountBId: 76,               // Robinhood account index

  // ── Quoting ─────────────────────────────────────────────────────────────
  edgeBps: 5,                   // Edge in basis points (5 = 0.05%)
                                //   bid = fairPrice * (1 - edgeBps/10000)
                                //   ask = fairPrice * (1 + edgeBps/10000)
                                //   For ETH at $2400: edge = $1.20
  orderSize: 10000,             // 0.01 ETH per order (in base units)
  tickIntervalMs: 500,          // Re-quote check interval

  // ── Position limits ─────────────────────────────────────────────────────
  maxNetPosition: 100000,       // Max net position across BOTH venues (base units)
  maxPositionPerVenue: 50000,   // Max position on a single venue
  maxOpenOrdersPerVenue: 10,    // Max orders per venue

  // ── Hedging ─────────────────────────────────────────────────────────────
  hedgeOnFill: true,            // When filled on venue A, hedge on venue B
  hedgeSlippage: 0.002,         // 0.2% slippage for hedge market orders

  // ── Risk ────────────────────────────────────────────────────────────────
  selfTradeBehavior: 0,
  reconnectTimeoutMs: 30000,
  builderIntegratorIndex: undefined,
  integratorTakerFee: undefined,
  integratorMakerFee: undefined,
}
```

### Example: Cross-venue ETH MM

```typescript
const mm = new CrossVenueMM(
  {
    marketId: 0,                // ETH perp (same on both venues)
    accountAId: 76,             // Core account
    accountBId: 76,             // Robinhood account
    edgeBps: 5,                 // 0.05% edge -> ~$1.20 at ETH $2400
    orderSize: 10000,           // 0.01 ETH per quote
    maxNetPosition: 100000,     // 10 ETH max net
    maxPositionPerVenue: 50000, // 5 ETH per venue
    maxOpenOrdersPerVenue: 4,
    hedgeOnFill: true,
    hedgeSlippage: 0.002,
    tickIntervalMs: 500,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
  },
  // Venue A (Core mainnet)
  {
    network: 'mainnet',
    signerClient: coreSigner,
    wsPrivate: coreWsPrivate,
    executor: coreExecutor,
    tracker: coreTracker,
    tag: 'core',
  },
  // Venue B (Robinhood)
  {
    network: 'robinhood',
    signerClient: rhSigner,
    wsPrivate: rhWsPrivate,
    executor: rhExecutor,
    tracker: rhTracker,
    tag: 'rh',
  },
);
```

### How cross-venue works

```
fairPrice = (venueA_mid + venueB_mid) / 2
edge = fairPrice * (edgeBps / 10000)

Both venues:
  bid = fairPrice - edge  (POST_ONLY)
  ask = fairPrice + edge  (POST_ONLY)

When bid fills on venue A (someone sold to us):
  -> We're long on venue A
  -> Hedge: market SELL on venue B
  -> Net position unchanged, captured the edge

When ask fills on venue A (someone bought from us):
  -> We're short on venue A
  -> Hedge: market BUY on venue B
  -> Net position unchanged, captured the edge

If net position hits maxNetPosition:
  -> Only place reducing orders (sell if long, buy if short)
```

---

## Dashboard Config

```typescript
const dashboard = new Dashboard({
  stats: statsAggregator,       // StatsAggregator instance
  trackers: tracker,            // OrderTracker (or array for cross-venue)
  executors: executor,          // WsExecutor (or array for cross-venue)
  strategy: strategy,           // Strategy instance
  refreshMs: 250,               // Render interval (250ms = 4fps)
  crossVenue: false,            // true for two-column cross-venue layout
  venueTags: ['core', 'rh'],    // Tags for cross-venue column headers
  onEvent: (ev) => {...},       // Optional sink for every dashboard event
                                //   (used by MM_LOG_FILE file logging)
});
```

### Dashboard keyboard controls

| Key | Action |
|-----|--------|
| Space | **Config menu** — every changeable config, auto-filled with current values, showing the matching config key. Arrows (or `j`/`k`) to select, Enter to edit inline (pre-filled — backspace and retype), Enter to commit. Applies on the next strategy cycle and **forces a requote** — no restart. Bad input shows an error and stays in the editor; Esc cancels. `q` inside the menu only closes the menu |
| P | Pause/resume strategy (keeps WS active, stops new orders) |
| E | Emergency stop (cancel all + flatten) |
| R | Reset stats counters |
| Q | Quit (stop strategy + exit) |
| Ctrl-C | Same as Q |

Notes:
- The menu works the same on Windows — the Enter key there emits the
  `'return'` keycode, which is handled identically.
- Unset knobs (e.g. `leverage` when the run started without one) are listed
  as `(unset — type a value)` and can be introduced from the menu; a
  `leverage` commit re-sends the venue update.
- `MM_LEVERAGE_A`/`MM_LEVERAGE_B` appear as `leverageA`/`leverageB` for
  `cross_mm` (per-venue leverage; venues cap independently — BTC: core max
  50x, RH max 5x).

---

## Env Variables

All strategies read from `.env` via `dotenv.config()`. Supported variables:

```env
# ── Required ──────────────────────────────────────────────────────────────
LIGHTER_NETWORK=robinhood        # mainnet | testnet | robinhood | robinhood-testnet
API_PRIVATE_KEY=...              # Lighter API key, 80 hex chars (single-key mode)
                                 # NOT your Ethereum wallet key (that is ETH_PRIVATE_KEY,
                                 # 64 hex chars, and is only needed for L1 signatures)
ACCOUNT_INDEX=76                 # Account index on the venue
API_KEY_INDEX=0                  # API key index

# ── Multi-key mode (optional, takes precedence over API_PRIVATE_KEY) ──────
# Round-robin rotation + per-key nonce serialization (lighter-python parity).
# All keys must belong to the same account.
API_PRIVATE_KEYS_JSON={"0":"0x...","1":"0x..."}

# ── Optional: custom or proxied deployment ─────────────────────────────────
# BASE_URL and WS_URL take effect ONLY if LIGHTER_NETWORK above is unset. Leave
# them commented while you select a venue by name -- setting both is the one
# combination that looks correct and is not: LIGHTER_NETWORK wins, so a BASE_URL
# naming a different venue is ignored rather than honoured.
# BASE_URL=https://api.rh.lighter.xyz
# WS_URL=wss://api.rh.lighter.xyz/stream
# CHAIN_ID=466324

# ── Strategy defaults (used by dashboard examples) ────────────────────────
MARKET_ID=1                      # Default market for dashboard examples
MM_CYCLE_MS=12000                # Order-operations cycle (PRIMARY knob)
MM_ORDER_SIZE=50                 # Default order size
MM_MAX_POSITION=50000            # Default max position
MM_ARB_THRESHOLD=20              # Default arb threshold ($)
MM_ARB_SLIPPAGE=0.001            # Default slippage
MM_REQUOTE_THRESHOLD=10          # $ drift before a requote is due
MM_FAIR_PRICE_SOURCE=mark        # Default fair price source
MM_GRID_LEVELS=5                 # Default grid levels
MM_GRID_SPACING=5                # Default grid spacing ($)

# ── Leverage / logging / hot config (default OFF unless set) ──────────────
MM_LEVERAGE=3                    # Leverage set on the venue at EVERY startup
                                 #   (both venues for cross_mm). 3 -> IMF 3333.
                                 #   Validated against the venue's cap
                                 #   (BTC: core max 50x, RH max 5x).
MM_LEVERAGE_A=10                 # cross_mm only: leverage for venue A (core)
MM_LEVERAGE_B=5                  # cross_mm only: leverage for venue B (RH)
MM_LOG_FILE=1                    # 1 -> logs/mm-<strategy>-<time>.log, or a path.
                                 #   OFF by default.
MM_HOT_CONFIG=1                  # 1 -> auto-filled mm-config.json, re-read
                                 #   every cycle: edit + save to change config
                                 #   mid-run. OFF by default.
MM_NO_DASHBOARD=1                # Plain log output instead of the live CLI
                                 #   dashboard (use when piping).
```

---

## Choosing the Right Strategy

| Strategy | Best for | Capital needed | Complexity |
|----------|----------|----------------|------------|
| **Arbitrage (maker)** | Single venue, earn spread, low risk | Low ($10+) | Low |
| **Arbitrage (taker)** | Capture price dislocations | Medium ($50+) | Low |
| **Grid** | Ranging markets, passive income | Medium ($50+) | Medium |
| **Perpetual MM** | Pure mid-based quoting, hummingbot-style | Low ($10+) | Low |
| **Cross-venue** | Arbitrage between Core + Robinhood | High ($100+ per venue) | High |
| **Avellaneda-Stoikov** | Inventory-aware quoting, vol-adaptive spread | Low ($10+) | Medium |

### Unified runner (recommended)

One entry point for all five strategies. Every knob has a CLI flag as well as
an `MM_*` env var, and the flag wins — the flags exist so the same command
works on Windows, where `cmd.exe` has no inline env-var prefix:

```bash
npm run mm:as       # Avellaneda-Stoikov: inventory-aware reservation price (default)
npm run mm:perp     # Perpetual MM: fixed width around the mid, bps spreads
npm run mm:grid     # Grid MM: N levels per side at fixed $ spacing
npm run mm:arb      # Fair-price maker: fixed $ edge around the mark
npm run mm:cross    # Cross-venue MM: quotes both venues, hedges fills
npm run mm:help     # every flag, with defaults
```

```bash
npx tsx examples/run_mm.ts as_mm --venue=mainnet --minutes=5 --gamma=0.3
npx tsx examples/run_mm.ts grid  --venue=robinhood --grid-levels=4 --grid-spacing=25
```

The env form still works everywhere a shell supports it:

```bash
MM_STRATEGY=arb_mm MM_VENUE=robinhood npx tsx examples/run_mm.ts
```

Shared knobs (env): `MM_CYCLE_MS` (order cycle, default 12000), `MM_ORDER_SIZE`,
`MM_MAX_POSITION`, `MM_SPREAD_BPS`, `MM_HALF_SPREAD`, `MM_GRID_LEVELS`,
`MM_GRID_SPACING`, `MM_REQUOTE_THRESHOLD`, `RUN_MINUTES`, `MARKET_ID`.
Avellaneda-Stoikov adds `MM_AS_GAMMA`, `MM_AS_KAPPA`, `MM_AS_HORIZON_MS`,
`MM_AS_INFINITE_HORIZON`, `MM_AS_SIGMA`, `MM_AS_MIN_HALF_SPREAD_BPS` and
`MM_AS_MAX_HALF_SPREAD_BPS`. Defaults and tuning guidance for all of them are
in [STRATEGIES.md](./STRATEGIES.md).

Venue selection (single-venue strategies): `MM_VENUE=mainnet|robinhood`
(default: `LIGHTER_NETWORK`). `mainnet` reads `LIGHTER_MAINNET_ACCOUNT_INDEX` /
`LIGHTER_MAINNET_API_KEY_INDEX` / `LIGHTER_MAINNET_API_PRIVATE_KEY`;
`robinhood` reads the default `ACCOUNT_INDEX` / `API_KEY_INDEX` /
`API_PRIVATE_KEY`. For `cross_mm`, Core uses the `LIGHTER_MAINNET_*` vars
(or `CORE_*` aliases) and Robinhood uses the defaults (or `RH_*` aliases).

**Shutdown safety net:** after the run completes (or on Ctrl-C), the runner
cancels all orders, then queries each involved venue's REST positions and
closes any residue with reduce-only market orders — a run never ends with
an open position, even if the strategy's own flatten logic missed one.

**Integrator fee attribution:** orders placed by the bundled strategies are
attributed to the SDK's builder account by default (maker 0.5 bps / taker
2 bps), which is what funds these strategies. The rates and the integrator
index are printed to your terminal before the first order of every run.
Set `INTEGRATOR_ACCOUNT_INDEX=N` to attribute to your own account instead, or
`BUILDER_ATTRIBUTION=off` to turn it off entirely. The runner signs the
one-time approve for you at startup; to do it yourself, use
`INTEGRATOR_OP=approve npx tsx examples/integrator_integration.ts` and then
run with `INTEGRATOR_AUTO_APPROVE=0`. Full reference:
[ATTRIBUTION.md](./ATTRIBUTION.md).

**Sizing gotchas (live-verified on BTC market 1):** orders must clear BOTH
`min_base_amount` and `min_quote_amount` (BTC: ≥ $10 notional) or the
sequencer rejects with `[21706] invalid order base or quote amount`.
Robinhood BTC uses a 50% initial margin fraction (Core mainnet: 5%) —
size RH positions to ~2× your RH balance in notional at most. Use
`npx tsx examples/probe_both_venues.ts` for a read-only view of balances,
min sizes, and decimals on both venues before sizing.

Per-strategy dedicated runners also exist: `run_arb_live.ts`,
`run_perp_mm_live.ts`, and the dashboard variants (interactive UI).

### Quick start: maker MM on BTC (recommended for beginners)

```bash
# .env
LIGHTER_NETWORK=robinhood
API_PRIVATE_KEY=...        # Lighter API key, 80 hex chars
ACCOUNT_INDEX=76
API_KEY_INDEX=0

# Run the dashboard
npx tsx examples/mm_arb_dashboard.ts
```

The dashboard example reads env vars for config. To customize, edit
the `ArbitrageStrategy` constructor in `examples/mm_arb_dashboard.ts`
or use `examples/run_arb_live.ts` for a headless logging version.