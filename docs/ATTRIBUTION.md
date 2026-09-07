# Partner (Builder) Attribution

The market-making strategies in this SDK are free and open source. They are
funded by **optional partner fee attribution**: orders placed by the bundled
strategies reference an integrator account, which earns a small share of the
trading fees you already pay to the exchange.

This page documents exactly what is stamped on your orders, what it costs, how
it is enforced, and how to turn it off.

**Nothing here is hidden.** The integrator index and fee rates are printed to
your terminal before the first order of every run.

---

## What gets stamped

Lighter's [partner attribution program](https://apidocs.rh.lighter.xyz/docs/partner-attribution)
lets an order carry three extra fields:

| Field | Meaning |
|---|---|
| `integratorAccountIndex` | Account credited with the fee share |
| `integratorTakerFee` | Taker rate, in **millionths** of notional |
| `integratorMakerFee` | Maker rate, in **millionths** of notional |

**Fee units are millionths (1e-6), not basis points.**

| Millionths | Basis points |
|---|---|
| `50` | 0.5 bps |
| `200` | 2 bps |
| `1000` | 10 bps |

### Defaults

| | Millionths | Bps |
|---|---|---|
| Maker | `50` | **0.5 bps** |
| Taker | `200` | **2 bps** |

The rates are deliberately small relative to strategy economics. A market
maker's gross edge is typically 5–20 bps, so 0.5 bps of maker attribution is a
few percent of edge rather than a material drag on the strategy.

### Caps

The SDK refuses to sign orders above its own ceilings, which exist to protect
**you** from a units mix-up (`20000` instead of `200` would be 200 bps):

| | SDK cap | Protocol cap |
|---|---|---|
| Maker | `200` (2 bps) | 1000 Core / 10000 RH |
| Taker | `1000` (10 bps) | 1000 Core / 10000 RH |

Exceeding a cap throws `AttributionFeeCapError` **before any order is signed**.
The SDK refuses rather than silently clamping, so a bad config is visible
instead of quietly re-priced.

On top of that, the on-chain `APPROVE_INTEGRATOR` transaction you sign carries
its own explicit fee caps and expiry. **The protocol cannot charge more than
the caps you approved, whatever this code asks for.**

### Builder accounts

| Venue | Integrator index |
|---|---|
| Lighter Core (mainnet) | `692603` |
| Lighter on Robinhood | `76` |
| Testnets | none — attribution stays off |

Testnets have no registered builder account, so attribution resolves to
`unregistered` and orders carry zeros. Nothing to opt out of there.

---

## Opting out

All of these are honoured at **every** enforcement layer. None of them require
editing source.

```bash
# Off entirely
BUILDER_ATTRIBUTION=off npx tsx examples/run_mm.ts

# Off, alternative spelling
INTEGRATOR_ACCOUNT_INDEX=0 npx tsx examples/run_mm.ts

# Attribute to YOUR OWN integrator account instead
INTEGRATOR_ACCOUNT_INDEX=123456 npx tsx examples/run_mm.ts

# Keep attribution, pay less
INTEGRATOR_MAKER_FEE_BPS=0.25 INTEGRATOR_TAKER_FEE_BPS=1 npx tsx examples/run_mm.ts

# Skip the startup APPROVE_INTEGRATOR tx (already approved out of band)
INTEGRATOR_AUTO_APPROVE=0 npx tsx examples/run_mm.ts
```

### Every variable

| Variable | Default | Effect |
|---|---|---|
| `BUILDER_ATTRIBUTION` | on | `0`, `false`, `off`, `no` (case-insensitive) disable attribution |
| `INTEGRATOR_ACCOUNT_INDEX` | builder | `0` disables; a positive integer routes attribution to that account |
| `INTEGRATOR_MAKER_FEE` | `50` | Maker rate in **millionths** |
| `INTEGRATOR_TAKER_FEE` | `200` | Taker rate in **millionths** |
| `INTEGRATOR_MAKER_FEE_BPS` | `0.5` | Maker rate in **basis points** (ignored if the millionths form is set) |
| `INTEGRATOR_TAKER_FEE_BPS` | `2` | Taker rate in **basis points** (ignored if the millionths form is set) |
| `INTEGRATOR_AUTO_APPROVE` | `1` | `0` skips the startup approval transaction |
| `INTEGRATOR_EXPIRY_SECONDS` | `31536000` (365 d) | Expiry written into the approval |

A non-numeric fee or a negative/non-integer account index throws at startup
with a message naming the variable — it never falls back to a default you did
not ask for.

---

## The approval transaction

Attribution only takes effect once you sign an `APPROVE_INTEGRATOR` transaction
(tx type `45`) authorising that integrator, at those fee caps, until that
expiry. The runner does this for you at startup (idempotent — re-approving is
harmless), and it is the only moment you are asked to sign anything unusual.

Which signature is required depends on the accounts:

| Situation | Signature needed |
|---|---|
| Integrator shares your L1 address | L2 API-key only — no wallet |
| Fees are all zero | L2 API-key only — no wallet |
| Integrator on a **different** L1, nonzero fees | **L1 (Ethereum) signature** — one time |

The third case needs `ETH_PRIVATE_KEY` in `.env`. It is used **only** for that
one-time approval signature; trading itself is always L2 with your API key. If
you would rather not put an L1 key in a file, approve once through a wallet and
then skip the automatic path:

```bash
INTEGRATOR_OP=approve npx tsx examples/integrator_integration.ts   # once, via wallet
INTEGRATOR_AUTO_APPROVE=0 npx tsx examples/run_mm.ts               # every run after
```

Pre-flight checks run before the approval is attempted. If the key is missing,
malformed, or derives an address that does not match the trading account's L1,
the run **aborts before any order is placed** with an explanation.
Approvals carry the expiry you signed, and re-approving with zero fees (or
letting the expiry lapse) ends the attribution.

---

## What you will see

**At startup**, before any order:

```
--- Partner attribution -------------------------------------
  Integrator account : #692603 (lighter-ts-sdk (Core))
  Fee attribution    : maker 0.5 bps / taker 2 bps
  This funds development and maintenance of these strategies.
  Opt out any time: BUILDER_ATTRIBUTION=off
-------------------------------------------------------------
```

Opted out, the same banner says so plainly:

```
--- Partner attribution -------------------------------------
  Integrator account : none (attribution disabled by user)
  Orders will carry no fee attribution.
-------------------------------------------------------------
```

**At the end of a run**, a support notice. If you had attribution on, it is a
thank-you. If you had it off, it is a one-time ask — printed once, at shutdown,
never mid-run, and it never blocks or delays anything:

```
=============================================================
 Support lighter-ts-sdk

 These market-making strategies are free and open source. They are
 funded entirely by optional partner (builder) fee attribution.

 Attribution is currently OFF for this run. If these strategies are
 useful to you, please consider enabling it:

   BUILDER_ATTRIBUTION=on   (maker 0.5 bps / taker 2 bps)

 You will be asked to sign a one-time APPROVE_INTEGRATOR transaction
 with explicit fee caps and an expiry. You stay in control and can
 revoke it at any time.
=============================================================
```

---

## How it is enforced

Attribution is resolved at three layers. Each layer **re-derives** the decision
independently rather than inheriting it from the layer above, so a value that is
absent at one layer is still resolved at the next:

| Layer | Where | What it does |
|---|---|---|
| **1. Runner** | [`examples/_attribution.ts`](../examples/_attribution.ts) | Reads env, resolves the venue decision, builds strategy config, prints the disclosure |
| **2. Strategy** | `StrategyBase` constructor | If `builderIntegratorIndex` is absent but `attributionNetwork` is set, resolves it again from env. Enforces the fee caps. Logs a warning when attribution ends up off |
| **3. Signer** | `WsExecutor.resolveIntegratorFields` | The chokepoint every order passes through. Caller-supplied fields win; when absent, resolves the venue fallback again |

The layers are redundant by design. A configuration field omitted at layer 1 is
resolved again at layer 2, and code paths that call the executor directly,
bypassing the strategy, are resolved at layer 3. An explicit
`integratorAccountIndex: 0` supplied by the caller is respected verbatim at
layer 3, so opt-out remains available at every layer.

### Registry integrity check

`src/attribution/builder-registry.ts` is frozen and covered by an FNV-1a
checksum (`REGISTRY_CHECKSUM`). `verifyRegistryIntegrity()` recomputes it on
every attribution resolution, in the strategy constructor, and in the executor
constructor.

This is a **tripwire, not a security primitive**. It catches partial edits and
bad merges — changing an account index without updating the checksum, or vice
versa — which would otherwise reference an integrator that was never approved
on-chain, at which point the sequencer rejects every order and the run fails
with no obvious cause. Failing at startup is easier to diagnose.

If it trips, the error tells you the computed value to paste in.

### Scope and limitations

This package is MIT-licensed and ships as readable TypeScript. The layers above
are redundancy against **accidental** removal — a refactor, a merge, a copied
config, or a dropped field — not a technical barrier against deliberate
modification, and obfuscation would not make them one. A partial edit fails at
startup rather than trading with an integrator that was never approved on-chain.

Deliberate opt-out is supported and documented. `BUILDER_ATTRIBUTION=off`
disables attribution without modifying any source file, and remains supported
across upgrades.

---

## Forking for your own desk

Replace the builder accounts with your own integrator indexes, then update the
checksum:

1. Edit `BUILDER_ACCOUNTS` in [`src/attribution/builder-registry.ts`](../src/attribution/builder-registry.ts)
2. Run anything that resolves attribution — the `BuilderRegistryIntegrityError`
   prints the checksum to use
3. Set `REGISTRY_CHECKSUM` to that value
4. Verify: `npx jest tests/builder-attribution.test.ts`

To disable attribution without changing the builder accounts, set
`BUILDER_ATTRIBUTION=off` in your `.env` rather than editing this file; the
environment variable needs no source change and is unaffected by upgrades.

---

## Security notes

- **`src/` never reads secret env vars.** The attribution modules read only
  non-secret `BUILDER_ATTRIBUTION` / `INTEGRATOR_*` variables. API and ETH
  private keys are read in exactly one place, `examples/_attribution.ts`, and
  passed in as arguments. This is an invariant, enforced by
  [`tests/credential-guards.test.ts`](../tests/credential-guards.test.ts).
- **Keys are never logged.** Every key passes `assertApiPrivateKey`, which
  rejects missing, placeholder, non-hex, and wrong-length values with an
  actionable message that never echoes the material. The `Logger` also redacts
  secret-looking context keys automatically.
- **Key formats:** Lighter API key = **80 hex chars** (40 bytes). ETH key =
  **64 hex chars** (32 bytes). Both accept an optional `0x` prefix. A wrong
  length is the single most common setup error and is caught immediately.
- **`.env` is gitignored and npm-ignored.** Never commit credentials.

---

## Related tests

| Test | Covers |
|---|---|
| [`tests/builder-attribution.test.ts`](../tests/builder-attribution.test.ts) | Registry, checksum, fee conversion, caps, decision resolution |
| [`tests/attribution-enforcement.test.ts`](../tests/attribution-enforcement.test.ts) | All three layers, including that each re-derives independently |
| [`tests/credential-guards.test.ts`](../tests/credential-guards.test.ts) | Key validation, the `src/` no-secrets invariant |
| [`tests/logger-security.test.ts`](../tests/logger-security.test.ts) | Redaction of secret-looking values |

---

## Related

- [STRATEGIES.md](./STRATEGIES.md) — strategy configs and launch commands
- [`examples/_attribution.ts`](../examples/_attribution.ts) — layer 1
- [`examples/integrator_integration.ts`](../examples/integrator_integration.ts) — manual `info` / `approve` / `quote` operations
- [Lighter partner attribution docs](https://apidocs.rh.lighter.xyz/docs/partner-attribution)
