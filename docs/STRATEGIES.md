# Market-Making Strategies

Five strategies, one runner: [`examples/run_mm.ts`](../examples/run_mm.ts).
Pick one with `MM_STRATEGY`, tune it with env vars, launch it with `npx tsx`.

| `MM_STRATEGY` | Class | Model | Reference price | Spread control |
|---|---|---|---|---|
| `as_mm` *(default)* | `AvellanedaStoikovMM` | Avellaneda–Stoikov optimal MM | mid (or mark) | derived from γ, κ, σ |
| `perp_mm` | `PerpetualMMStrategy` | Fixed quote width | mid (or mark) | `MM_SPREAD_BPS` |
| `grid` | `GridStrategy` | N levels per side | mid | `MM_GRID_SPACING` |
| `arb_mm` | `ArbitrageStrategy` | Fair-price maker/taker | mark (or index/external) | `MM_HALF_SPREAD` |
| `cross_mm` | `CrossVenueMM` | Two-venue MM + hedge | weighted mid of both venues | `MM_SPREAD_BPS` |

> **Live money.** Every strategy here places real orders on a funded account.
> Read [Before your first live run](#before-your-first-live-run) first.

---

## Quick start

```bash
# 1. credentials (see .env.example)
cp .env.example .env && $EDITOR .env

# 2. see exactly what would run -- no connection, no orders
npx tsx examples/run_mm.ts --print-config

# 3. exercise the wiring on testnet for two minutes (this DOES place orders)
LIGHTER_NETWORK=testnet RUN_MINUTES=2 npx tsx examples/run_mm.ts

# 4. go live, small, short
LIGHTER_NETWORK=robinhood RUN_MINUTES=15 MM_ORDER_SIZE=50 npx tsx examples/run_mm.ts
```

Every run ends with `strategy.stop()` (cancels all resting orders) followed by
`flattenAllVenues()`, a REST-based safety net that closes any nonzero position
with a reduce-only market order. Ctrl-C triggers the same path.

---

## Credentials

| Variable | Required | Notes |
|---|---|---|
| `API_PRIVATE_KEY` | **yes** | Lighter API key, **80 hex chars** (40 bytes), `0x` optional |
| `ACCOUNT_INDEX` | **yes** | Your account index on the venue |
| `API_KEY_INDEX` | no (`0`) | Which registered API key slot to sign with |
| `LIGHTER_NETWORK` | no (`mainnet`) | `mainnet` \| `testnet` \| `robinhood` \| `robinhood-testnet` |
| `API_PRIVATE_KEYS_JSON` | no | `{"0":"<key>","1":"<key>"}` for multi-key rotation |
| `ETH_PRIVATE_KEY` | only for cross-L1 integrator approval | 64 hex chars (32 bytes) |

`cross_mm` needs both venues:

| Variable | Falls back to |
|---|---|
| `CORE_API_PRIVATE_KEY` | `LIGHTER_MAINNET_API_PRIVATE_KEY` → `API_PRIVATE_KEY` |
| `CORE_ACCOUNT_INDEX` | `LIGHTER_MAINNET_ACCOUNT_INDEX` → `ACCOUNT_INDEX` |
| `CORE_API_KEY_INDEX` | `LIGHTER_MAINNET_API_KEY_INDEX` → `API_KEY_INDEX` |
| `RH_API_PRIVATE_KEY` | `API_PRIVATE_KEY` |
| `RH_ACCOUNT_INDEX` | `ACCOUNT_INDEX` |
| `RH_API_KEY_INDEX` | `API_KEY_INDEX` |

A missing or malformed key aborts before any client is constructed, with a
message naming the exact variable. Keys are never echoed to logs.

---

## Shared knobs (all strategies)

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_STRATEGY` | — | `as_mm` | `as_mm` \| `perp_mm` \| `grid` \| `arb_mm` \| `cross_mm` |
| `RUN_MINUTES` | — | `15` | Run length, then stop + flatten |
| `MARKET_ID` | `marketId` | `1` | Market index (0 = ETH, 1 = BTC on Lighter) |
| `MM_ORDER_SIZE` | `orderSize` | `50` | Size per quote, in **base units** (venue-scaled integer) |
| `MM_MAX_POSITION` | `maxPositionSize` | `100` | Max absolute position, base units. Strategy halts past this |
| `MM_CYCLE_MS` | `cycleMs` | `12000` | Minimum ms between cancel/replace **batches** — the main rate-limit knob |
| `MM_REQUOTE_THRESHOLD` | `requoteThreshold` | `10` | $ of price drift before a requote is *due* on the next cycle |
| `MM_LEVERAGE` | `leverage` | *unset* | Leverage set on the venue at **every startup** (both venues for `cross_mm`). E.g. `3` → IMF 3333. Unset leaves the venue's current setting alone; a failed update aborts the start. Validated against the venue's cap first (BTC: core max 50x, RH max 5x) |
| `MM_LEVERAGE_A` / `MM_LEVERAGE_B` | `leverageA` / `leverageB` | *unset* | `cross_mm` only: per-venue leverage (core / robinhood), overriding `MM_LEVERAGE` for that venue — the venues cap leverage independently |
| `MM_LOG_FILE` | — | *off* | `1` → `logs/mm-<strategy>-<time>.log`, or an explicit path. OFF by default |
| `MM_HOT_CONFIG` | — | *off* | `1` → auto-filled `mm-config.json`, re-read **every cycle** (see below) |
| `MM_NO_DASHBOARD` | — | *off* | `1` → plain log output instead of the live dashboard |
| — | `tickIntervalMs` | `1000` | How often `onTick` runs (market data refresh + fill checks) |
| — | `makerOnly` | `true` | POST_ONLY quoting; crossing quotes are pulled back to the touch |
| — | `selfTradeBehavior` | `0` | `0` EXPIRE_MAKER, `1` EXPIRE_TAKER, `2` EXPIRE_BOTH, `3` REDUCE |
| — | `reconnectTimeoutMs` | `30000` | WS down longer than this trips the circuit breaker: cancel all, halt |

**`cycleMs` vs `tickIntervalMs`.** Ticks are cheap (they only read state).
Cycles are expensive (they cancel and replace). Raising `MM_CYCLE_MS` is the
first thing to try if you are hitting rate limits; lowering it tightens quotes
at the cost of API budget.

**Base units.** `orderSize` and `maxPositionSize` are integers in the market's
base scale, not dollars. With BTC at a `baseScale` of 1e5, `MM_ORDER_SIZE=50`
is 0.0005 BTC. Lighter enforces a **$10 minimum quote notional** — size below
that is rejected by the exchange, not by the SDK.

**Leverage.** `MM_LEVERAGE` is applied at the top of `start()` on every run,
so the venue's margin setting always matches the config before the first order
is signed. The update targets CROSS margin (marginMode 0). It is pre-validated
against the venue's reported minimum initial margin fraction — an over-cap
value fails at startup with the venue's max in the message instead of a
sequencer rejection mid-run. A venue rejection aborts the start — quoting with
an unverified margin setting is exactly the failure mode that makes orders get
rejected mid-run. A hot config change to `leverage` re-sends the update
mid-run. For `cross_mm`, `MM_LEVERAGE_A`/`MM_LEVERAGE_B` set each venue
independently (BTC: core max 50x, Robinhood max 5x — one shared number can
exceed the tighter cap). The `leverage` fields are always present in the config
menu and the hot config file, even when unset, so a run started without one
can be given a leverage live.

---

## Hot config — change config mid-run, no restart

Two ways, both OFF by default:

**1. The dashboard config menu** — press `Space` in the live dashboard. It
lists every changeable config (auto-filled with current values, showing the
matching config key), arrow keys (or `j`/`k`) to select, Enter to edit inline
(the editor pre-fills the current value — backspace and type over it), Enter
again to commit. Works for every strategy, including unset knobs like
`leverage` (shown as `(unset — type a value)`); a `leverage` edit re-sends the
venue update. A non-numeric input stays in the editor with an error — Esc
cancels without committing, Esc again closes the menu. Inside the menu `q`
only closes the menu; it never quits the run.

Applied changes take effect on the **next strategy cycle** — no stop, no
restart — and **force a requote**: every edit, even one that moves quotes by
less than `requoteThreshold`, cancels and re-places the resting orders with
the new value on the next cycle. (Without this, a sub-threshold edit would
leave the previous orders live indefinitely.) A `cycleMs` edit re-arms the
cycle timer's gate immediately.

**2. The hot config file** — `MM_HOT_CONFIG=1` (or `--hot-config`):

```bash
npx tsx examples/run_mm.ts grid --hot-config   # writes mm-config.json
```

The runner writes the file once with every editable knob auto-filled and
commented, then re-reads it every cycle (≤5 s). Edit a value, save — the event
log confirms `hot config applied: <key>=<value>` within seconds. Unset knobs
appear as commented placeholders — remove the `//` and set a value to
introduce them. Unknown keys are ignored; a malformed file is reported and
skipped, never fatal. Menu edits and file edits share one source of truth
(the strategy's live config), so they cannot fight or ping-pong.

Both paths go through `strategy.updateConfig()`, which validates and folds the
patch into the strategy's live config object on the next tick.
`marketId`/`accountId` are immutable mid-run (they are baked into the
subscriptions); everything else — spreads, sizes, thresholds, cycle, leverage,
grid geometry, A-S γ/κ/σ — is live-editable.

---

## Logs — default OFF, opt-in file storage

No files are written by default. `MM_LOG_FILE=1` (or `--log-file`) mirrors the
run into `logs/mm-<strategy>-<timestamp>.log`: SDK Logger entries (already
redacted), dashboard events (fills, cancels, config changes, errors), and the
runner's own banner/status lines. Pass an explicit path (`MM_LOG_FILE=path`)
to choose the file. The `logs/` directory is gitignored.

---

## `as_mm` — Avellaneda–Stoikov *(default)*

The real model, not a spread heuristic. Each tick it computes:

```
reservation price  r = s − q·γ·σ²·(T−t)
optimal spread     δ = γ·σ²·(T−t) + (2/γ)·ln(1 + γ/κ)
quotes             bid = r − δ/2,  ask = r + δ/2
```

where `s` is the fair price, `q` is inventory normalised to [−1, 1] against
`maxPositionSize`, and `σ` is estimated live from mid samples.

The reservation price is what makes this different from a fixed-width quoter:
holding a long pushes `r` *below* the mid, so the bid backs off and the ask
tightens — the model quotes its way out of inventory instead of doubling down.

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_AS_GAMMA` | `gamma` | `0.5` | Risk aversion. **The knob that matters.** Higher = wider quotes and harder inventory skew. `0` = risk-neutral (spread collapses to `2/κ`) |
| `MM_AS_KAPPA` | `kappa` | `1.5` | Order-arrival intensity. Higher = you expect to get filled easily = tighter quotes |
| `MM_AS_HORIZON_MS` | `timeHorizonMs` | `300000` | Session length driving `(T−t)`. Skew decays to zero as the session ends, then the session restarts |
| `MM_AS_INFINITE_HORIZON` | `infiniteHorizon` | off | `=1` pins `(T−t)=1` — for a maker with no session end. Recommended for continuous running |
| `MM_AS_SIGMA` | `sigma` | *estimated* | Pin volatility in **price units** instead of estimating it. Leave unset unless you know why |
| `MM_AS_MIN_HALF_SPREAD_BPS` | `minHalfSpreadBps` | `1` | Floor on the half-spread. Stops the model quoting inside the fee |
| `MM_AS_MAX_HALF_SPREAD_BPS` | `maxHalfSpreadBps` | `100` | Cap on the half-spread. Stops a volatility spike parking quotes at absurd prices |
| — | `volatilityHalfLifeMs` | `30000` | EWMA half-life for the σ estimator. Decays by **elapsed time**, so a stalled feed cannot freeze the estimate |
| — | `minVolatilitySamples` | `20` | Samples before the live estimate is trusted; until then `fallbackVolatilityBps` is used |
| — | `fallbackVolatilityBps` | `5` | Warm-up σ, and the permanent floor under the estimate |
| — | `maxInventoryFraction` | `0.5` | Past this fraction of `maxPositionSize`, the entry side stops being quoted |
| — | `inventoryTargetFraction` | `0` | Target inventory. `0.5` means "flat" is defined as half your max long |
| — | `priceSource` | `'mid'` | `'mid'` or `'mark'`. σ always tracks the mid regardless |

`gamma` and `kappa` are validated in the constructor: negative γ, non-positive
κ, or `NaN` for either throws before the strategy can place an order.

```bash
# conservative: wide, strongly inventory-averse, continuous
MM_STRATEGY=as_mm MM_AS_GAMMA=1.5 MM_AS_KAPPA=1.0 MM_AS_INFINITE_HORIZON=1 \
  MM_ORDER_SIZE=50 MM_MAX_POSITION=100 RUN_MINUTES=30 \
  npx tsx examples/run_mm.ts

# aggressive: tight, high assumed fill rate
MM_STRATEGY=as_mm MM_AS_GAMMA=0.2 MM_AS_KAPPA=3.0 MM_AS_MIN_HALF_SPREAD_BPS=0.5 \
  MM_CYCLE_MS=6000 npx tsx examples/run_mm.ts

# pinned volatility (backtest-style determinism)
MM_STRATEGY=as_mm MM_AS_SIGMA=25 MM_AS_INFINITE_HORIZON=1 npx tsx examples/run_mm.ts
```

**Tuning γ.** Start at `0.5`. If you end runs holding inventory you did not
want, raise it. If you are quoting so wide you never fill, lower it. Changing γ
on a funded account changes how hard the strategy leans against its position —
it is not a cosmetic setting.

---

## `perp_mm` — Fixed quote width

Symmetric bps quotes around the mid, shifted by a linear inventory skew.
The simplest thing that works, and the easiest to reason about.

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_SPREAD_BPS` | `bidSpreadBps` | `10` | Half-spread in bps: `bid = mid·(1 − bps/10000)` |
| — | `askSpreadBps` | = bid | Per-side override |
| `MM_SPREAD_BPS`×2 | `inventorySkewBps` | `20` | Bps of quote shift per unit of inventory ratio. Long 50% of max with skew 20 shifts both quotes down 10 bps |
| — | `maxInventoryFraction` | `0.5` | Past this, only the reducing side is quoted |
| — | `priceSource` | `'mid'` | `'mid'` or `'mark'` |
| — | `maxOpenOrders` | `4` | Two quotes plus headroom for in-flight cancels |

```bash
MM_STRATEGY=perp_mm MM_SPREAD_BPS=10 MM_ORDER_SIZE=50 MM_MAX_POSITION=100 \
  MM_CYCLE_MS=12000 RUN_MINUTES=15 npx tsx examples/run_mm.ts

# wider, slower, cheaper on API budget
MM_STRATEGY=perp_mm MM_SPREAD_BPS=25 MM_CYCLE_MS=30000 MM_REQUOTE_THRESHOLD=50 \
  npx tsx examples/run_mm.ts
```

---

## `grid` — Grid MM

`gridLevels` orders per side at fixed `$` spacing, re-centred on the mid when
it drifts past `relevelThreshold`.

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_GRID_LEVELS` | `gridLevels` | `4` | Levels **per side** (4 → 8 orders total) |
| `MM_GRID_SPACING` | `gridSpacing` | `25` | Spacing between levels, in **price units ($)** |
| `MM_ORDER_SIZE` | `orderSize` | `50` | Size per level — total exposure is `levels × size` per side |
| `MM_REQUOTE_THRESHOLD` | `relevelThreshold` | `10` | $ drift from centre before the whole grid re-levels |
| — | `autoRecenter` | `true` | Re-centre on the mid each tick |
| — | `centerPrice` | *auto* | Pin the grid centre instead of tracking the mid |
| — | `maxOpenOrders` | `2 × levels` | Set automatically by the runner |

Budget the total, not the per-level size: `MM_GRID_LEVELS=4` with
`MM_ORDER_SIZE=50` commits 200 base units per side, so `MM_MAX_POSITION`
should be at least that.

```bash
MM_STRATEGY=grid MM_GRID_LEVELS=4 MM_GRID_SPACING=25 MM_ORDER_SIZE=50 \
  MM_MAX_POSITION=400 RUN_MINUTES=20 npx tsx examples/run_mm.ts

# tight scalping grid
MM_STRATEGY=grid MM_GRID_LEVELS=6 MM_GRID_SPACING=10 MM_ORDER_SIZE=25 \
  MM_MAX_POSITION=300 MM_REQUOTE_THRESHOLD=5 npx tsx examples/run_mm.ts
```

---

## `arb_mm` — Fair-price maker

Quotes a fixed `$` edge around a fair price that is *not* the book mid —
by default the mark price. Useful when you trust the mark more than the top of
book, or when you have an external reference to plug in.

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_HALF_SPREAD` | `threshold` | `20` | Edge from fair in **$**. In maker mode this is the half-spread; in taker mode, the deviation that triggers a trade |
| — | `fairPriceSource` | `'mark'` | `'mid'` \| `'mark'` \| `'index'` \| `'external'` |
| — | `getExternalFairPrice` | — | Required when `fairPriceSource: 'external'` |
| — | `makerExecution` | `true` | `true` = POST_ONLY quotes. `false` = IOC market orders when deviation exceeds `threshold` (**taker — pays fees, can move against you**) |
| — | `maxSlippage` | `0.001` | Slippage cap for taker orders (0.1%) |
| — | `inventorySkew` | `1.0` | Fraction of `threshold` the quotes shift toward the exit side at full inventory |
| — | `maxInventoryFraction` | `0.5` | Past this, only the reducing side is quoted |

```bash
MM_STRATEGY=arb_mm MM_HALF_SPREAD=20 MM_ORDER_SIZE=50 MM_MAX_POSITION=100 \
  RUN_MINUTES=15 npx tsx examples/run_mm.ts
```

Setting `makerExecution: false` turns this into a taker strategy that crosses
the spread. That is a different risk profile — the runner does not expose it as
an env var on purpose.

---

## `cross_mm` — Cross-venue MM

Quotes the same market on **Lighter Core (mainnet)** and **Lighter on
Robinhood** simultaneously, and hedges on the opposite venue when a quote
fills. Needs credentials for both venues.

| Env | Config field | Default | Meaning |
|---|---|---|---|
| `MM_SPREAD_BPS` | `edgeBps` | `10` | Edge in bps from the blended fair price, applied on both venues |
| `MM_ORDER_SIZE` | `orderSize` | `50` | Size per quote per venue |
| `MM_MAX_POSITION` | `maxPositionPerVenue` | `100` | Per-venue cap |
| `MM_MAX_POSITION`×2 | `maxNetPosition` | `200` | Cap on **net** exposure across venues |
| — | `hedgeOnFill` | `true` | Fill on A immediately places an opposite market order on B |
| — | `hedgeSlippage` | `0.002` | Slippage cap on hedge orders (0.2%) |
| — | `maxOpenOrdersPerVenue` | `4` | |
| — | `builderIntegratorIndexPerVenue` | *auto* | `{ core: <idx>, rh: <idx> }` — builder accounts differ per venue |

Net position is **signed**: long 2.5 on Core against short 2.5 on Robinhood is
net flat, not net 5. (This is regression-tested in
[`tests/inventory-sign.test.ts`](../tests/inventory-sign.test.ts) — an earlier
version summed unsigned magnitudes and reported a hedged book as net long.)

```bash
MM_STRATEGY=cross_mm \
  CORE_API_PRIVATE_KEY=<80-hex> CORE_ACCOUNT_INDEX=<n> \
  RH_API_PRIVATE_KEY=<80-hex>   RH_ACCOUNT_INDEX=<n> \
  MM_SPREAD_BPS=10 MM_ORDER_SIZE=50 MM_MAX_POSITION=100 \
  RUN_MINUTES=20 npx tsx examples/run_mm.ts
```

Both venues must have the **same** `MARKET_ID` for the market you intend to
make. Verify before running — the runner cannot detect a mismatched pair.

---

## Dashboards

Three strategies also ship as standalone terminal dashboards. They are thin
wrappers around the same strategy classes, reading the same env vars and
applying the same attribution, with a live view of quotes, fills, position, and
PnL.

```bash
npx tsx examples/mm_grid_dashboard.ts          # grid
npx tsx examples/mm_arb_dashboard.ts           # fair-price maker
npx tsx examples/mm_cross_venue_dashboard.ts   # cross-venue (needs both venues)
```

`MM_RUN_MINUTES=<n>` bounds a run; without it the dashboard runs until you press
`Q` or send Ctrl-C. On a terminal the view redraws in place — press `Space`
for the config menu (live-edit any knob, applied next cycle), `P` pause, `E`
emergency stop, `R` reset stats. The dashboards also honor `MM_LEVERAGE`,
`MM_LOG_FILE`, and `MM_HOT_CONFIG` exactly like the runner. When stdout is a
pipe or a file the dashboard detects that and prints plain lines instead, so a
redirected run stays readable rather than filling with escape sequences.

**Exit codes.** Unlike `run_mm.ts`, a dashboard does **not** flatten on exit. It
cancels resting orders, then reports any remaining position and hands it back to
you:

| Exit code | Meaning |
|-----------|---------|
| `0` | Finished flat — nothing left open. |
| `1` | Finished holding inventory. The warning names the market, direction, and size. |

Exit `1` is not an error; the run may have gone exactly as configured. It means
risk is still on the book, and a script chaining off a bounded run should treat
it that way rather than reading it as a clean finish. Close the position before
the next run:

```bash
npx tsx examples/close_all_positions.ts
```

That command reads one venue's credentials from the environment, so a
cross-venue exit naming both venues needs one invocation per venue, each with
that venue's `LIGHTER_NETWORK` and credentials set. The dashboard prints this
reminder alongside the warning.

---

## Partner attribution

Every strategy stamps orders with a builder (integrator) account index, routing
a small share of the exchange fees you already pay to the account that funds
this SDK's development. Defaults: **0.5 bps maker, 2 bps taker**. Attribution is
disclosed at startup, fee-capped, and fully optional:

```bash
BUILDER_ATTRIBUTION=off npx tsx examples/run_mm.ts     # disable entirely
INTEGRATOR_ACCOUNT_INDEX=<your-idx> ...                # attribute to yourself
INTEGRATOR_MAKER_FEE_BPS=0.25 ...                      # lower the fee
```

Full policy, fee units, approval flow, and every opt-out: [ATTRIBUTION.md](./ATTRIBUTION.md).

---

## Before your first live run

1. **Print the config first.** `--print-config` (alias `--dry-run`) resolves
   flags, env vars, and defaults, prints what will be used and which
   attribution applies, then exits before opening a connection. Precedence is
   flag > env > default, so a stale `.env` value is only visible here.
2. **Testnet next.** `LIGHTER_NETWORK=testnet RUN_MINUTES=2` proves the
   credentials, WS, signer, and flatten path without risking anything.
3. **Smallest viable size.** Start at the $10 minimum notional. `MM_ORDER_SIZE`
   is a whole number of *scaled* base units: BTC has 5 size decimals, so `13`
   means 0.00013 BTC. A decimal is rejected at startup rather than truncated,
   and orders must clear both `min_base_amount` and the $10 `min_quote_amount`.
4. **Short first run.** `RUN_MINUTES=5`. Watch the dashboard: fills, position,
   and the flatten at the end.
5. **Check the position is actually flat** on the venue's UI after the run.
   The flatten net is a safety net, not a guarantee against a venue outage.
6. **Then extend.** Raise `RUN_MINUTES`, then size, then tighten spreads — one
   variable at a time.

**Circuit breaker.** If the WS stays down past `reconnectTimeoutMs` (30 s), the
strategy cancels everything and halts rather than quoting into a stale book.

**Rate limits.** `MM_CYCLE_MS` is the throttle. If you see rejected
cancel/replace batches, raise it before touching anything else.

---

## Related

- [MM_CONFIG_GUIDE.md](./MM_CONFIG_GUIDE.md) — deeper parameter tuning
- [ATTRIBUTION.md](./ATTRIBUTION.md) — builder-code policy and opt-out
- [GettingStarted.md](./GettingStarted.md) — SDK basics, first order
- [`examples/run_mm.ts`](../examples/run_mm.ts) — the runner itself
