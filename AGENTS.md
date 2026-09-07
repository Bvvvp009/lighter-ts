# AGENTS.md

Compact guide for OpenCode agents working in `lighter-ts` (the TypeScript SDK for Lighter Protocol). Read this before editing.

## Commands

```bash
npm run verify          # typecheck (src) + typecheck (examples) + jest — the gate before shipping
npm test                # jest — all tests are offline, mock-based (no credentials needed)
npm run typecheck       # tsc -p tsconfig.esm.json --noEmit   (src/)
npm run typecheck:examples  # tsc -p tsconfig.examples.json --noEmit
npm run build           # full build: cjs -> esm -> fix-esm -> browser -> umd (runs in order)
npm run build:wasm      # rebuild WASM signer (requires Go + git; clones lighter-go from GitHub)
npm run verify:wasm     # checks wasm/lighter-signer.wasm + wasm_exec.js exist (runs in prepublishOnly)
npm run smoke:live      # tsx examples/live_smoke.ts — hits a LIVE network (needs .env credentials)
npm run mm:help         # MM runner flags; mm:as | mm:perp | mm:grid | mm:arb | mm:cross launch one
```

Run a single test file: `npx jest tests/network.test.ts`
Run a single test: `npx jest -t "honors LIGHTER_NETWORK"`

There is **no lint script**. `npm run verify` is the gate: it typechecks `src/` and `examples/` and then runs jest. Both typechecks matter separately — tests use `ts-jest` with `isolatedModules: true`, so type errors in `src/` **do not** surface from `npm test`, and `examples/` is not in the `src/` project at all.

## Build pipeline (non-obvious)

`npm run build` is an ordered chain — do not run the sub-steps out of order:
1. `build:cjs` — `tsc -p tsconfig.cjs.json` -> `dist/cjs/`
2. `build:esm` — `tsc -p tsconfig.esm.json` -> `dist/esm/`
3. `fix:esm` — `scripts/fix-esm-imports.cjs` rewrites relative ESM imports to add `.js` extensions (Node ESM requires explicit extensions; tsc doesn't emit them). **If you add a new source file with relative imports, this script handles it — don't add `.js` extensions in `src/`.**
   - It resolves each specifier against the **filesystem**: `./foo` becomes `./foo.js` or `./foo/index.js` depending on which exists. Appending `.js` unconditionally silently breaks every directory import (`src/attribution/` shipped that way in v1.0.13). An unresolvable specifier now **fails the build** rather than warning, because the alternative is a consumer discovering it at import time.
4. `build:browser:esm` — esbuild bundles `dist/esm/index.js` -> `dist/browser/`
5. `build:umd` — esbuild IIFE bundle -> `dist/umd/` (also copies `wasm/*.wasm` + `wasm_exec.js`)

`prepublishOnly` runs `verify` + `build` + `verify:wasm`.

**Dual-package invariant.** The root `package.json` sets `"type": "module"`, which applies to *every* `.js` in the package — including `dist/cjs/`. `build:cjs` therefore chains `scripts/write-cjs-package.cjs`, which drops a `{"type":"commonjs"}` marker into `dist/cjs/`. Without it Node parses the CJS build as ESM and `require('lighter-ts-sdk')` fails for every CJS consumer. The marker is **generated, not committed** — `rm -rf dist` must not be able to remove it permanently. `tests/packaging.test.ts` guards this, the specifier resolution above, and the per-condition `exports` types.

**Exports are a whitelist.** Once `exports` exists, any subpath not listed is unreachable from outside the package even when `files` ships it — the consumer gets `ERR_PACKAGE_PATH_NOT_EXPORTED` while `npm pack` shows the file present. `wasm/` is the case that matters: it is not part of the JS entry graph, so browser and bundler users can only reach the signer binary by subpath (`lighter-ts-sdk/wasm/lighter-signer.wasm`). `./package.json` is exported too, because bundlers and test resolvers routinely resolve it. If you add anything to `files` that consumers must reach directly, add a matching `exports` entry in the same edit. Internal loading is unaffected — `resolveWasmPath`/`findPackageRoot` walk the filesystem rather than resolving subpaths.

### WASM signer

- `wasm/lighter-signer.wasm` + `wasm/wasm_exec.js` are **committed** and shipped in the npm package. You do not need Go installed to build/test the TS.
- `npm run build:wasm` clones `github.com/elliottech/lighter-go` into `lighter-go/` (gitignored), runs `go mod vendor` + `GOOS=js GOARCH=wasm go build`. Requires a local Go toolchain.
- `.wasm-commit` pins the lighter-go commit (`c26ac34`). The comment says CI auto-updates it.
- `lighter-go/` and `lighter-python/` in the repo root are **reference repos / gitignored** — not part of this package. Don't edit them as part of changes here.

## Architecture

Entry point: `src/index.ts` — re-exports the entire public surface. When adding a new public export, add it here.

- `src/signer/` — `wasm-signer.ts` (low-level WASM wrapper) + `wasm-signer-client.ts` (`SignerClient`, the high-level signed-tx client). `SignerClient` requires `await client.initialize()` + `await client.ensureWasmClient()` before use.
- `src/api/` — REST API wrappers over `ApiClient` (`account-api`, `order-api`, `bridge-api`, `ws-client`, `ws-order-client`, explorer APIs, etc.). Pure HTTP, no signing.
- `src/bridge/` — `L1BridgeClient` (L1 ethers-based operations).
- `src/network.ts` — **network registry** (see below). Single source of truth for hosts + chain ids.
- `src/utils/` — `configuration`, `environment` (browser/Node/Next.js detection), `nonce-manager`, `price-utils`, `request-batcher`, `logger`, `exceptions`.
- `src/types/` — shared type definitions.

Package ships three module formats resolved via `package.json` `exports`: ESM (`dist/esm`), CJS (`dist/cjs`), browser UMD (`dist/umd`). `types` points to `dist/esm/index.d.ts`.

## Networks — the highest-risk gotcha

Lighter runs on 4 instances. The **L2 signing chain_id** (first element of every L2 tx hash, what the WASM signer signs with) is **not** the L1 EVM chainId and **cannot** be auto-detected from the URL for Robinhood.

| `LIGHTER_NETWORK` | API host | L2 signing chain_id |
|---|---|---|
| `mainnet` (default) | `mainnet.zklighter.elliot.ai` | 304 |
| `testnet` | `testnet.zklighter.elliot.ai` | 300 |
| `robinhood` | `api.rh.lighter.xyz` | **466324** |
| `robinhood-testnet` | `api.rh-testnet.lighter.xyz` | 300 |

- `src/network.ts` `NETWORKS` is the registry. `resolveNetworkFromEnv()` reads `LIGHTER_NETWORK` (default `mainnet`). An explicit `LIGHTER_NETWORK` is **authoritative** — a leftover `BASE_URL` from another instance is ignored to avoid host/chain_id decoupling.
- `robinhood-testnet` shares chain_id `300` with `testnet` — only the **host** disambiguates them.
- `BASE_URL` / `WS_URL` / `CHAIN_ID` env overrides apply **only when `LIGHTER_NETWORK` is unset** (except `CHAIN_ID`, which always overrides, for rare deliberate cases).
- Tests in `tests/network.test.ts` lock these invariants down. If you touch `network.ts`, run that test file.

## Tests

- All test files are **unit tests with mocked HTTP/WS clients** — no network, no credentials, no `.env` needed. Safe to run anytime.
- `tests/setup.ts` polyfills `TextEncoder`/`TextDecoder`/`WebSocket` for the Node test env.
- `network.test.ts` saves/restores `LIGHTER_NETWORK`/`BASE_URL`/`WS_URL`/`CHAIN_ID` per test to avoid env leakage.
- `logger-security.test.ts` locks the Logger's secret-redaction + buffer-cap behavior — keep it passing when touching `src/utils/logger.ts`.
- Jest config: `jest.config.cjs`, `ts-jest` preset, `isolatedModules: true`, 10s timeout, roots in `tests/`.

## Strategies & the MM runner

- `src/strategies/` — MM strategies (`StrategyBase` subclasses + `CrossVenueMM` standalone). All support integrator fee attribution via `builderIntegratorIndex` / `integratorTakerFee` / `integratorMakerFee` in the strategy config.
- `examples/run_mm.ts` — unified runner (`MM_STRATEGY=as_mm|perp_mm|grid|arb_mm|cross_mm`). Single-venue venue selection via `MM_VENUE`; cross_mm reads `LIGHTER_MAINNET_*` (or `CORE_*`) for Core + defaults (or `RH_*`) for Robinhood. It ends every run with a REST-based flatten safety net (`flattenAllVenues`) — never leave positions open in tests.
- The runner has a **CLI-flag front end** (`applyCliFlags`) that writes flags into `process.env` before the module-level consts read it, so env stays the single source of truth and flags are sugar over it. Flags exist because `cmd.exe` has no inline env-var prefix, so `MM_STRATEGY=grid tsx ...` cannot be an npm script on Windows. **If you add an `MM_*` env var, add it to `FLAG_ENV` and to `USAGE` in the same edit**, or the flag and the env var drift apart. `tests/runner-flags.test.ts` parses `run_mm.ts` as source text and fails when they drift; it also pins the `--print-config` early exit ahead of `main()`, so the config echo can never start placing orders.
- `docs/STRATEGIES.md` is the runner-level reference (env vars, flags, launch commands); `docs/MM_CONFIG_GUIDE.md` is the class-level one (constructor config fields). Keep both in sync when a knob changes.
- Live sizing rules (BTC mkt 1): orders must clear **`min_quote_amount` ($10)** as well as `min_base_amount` or get rejected `[21706]`; RH initial margin is 50% vs Core 5%.

## Security invariants (do not regress)

- `src/` must **never** read secret env vars or log keys/tokens. The `Logger` redacts secret-looking context keys automatically — new log call sites don't need to pre-redact, but don't bypass the Logger to `console.log` raw objects containing credentials.
- `.env` stays out of git AND npm (`.npmignore`).
- Integrator approvals must keep explicit fee caps + expiry (`signer.approveIntegrator`).
- **Partner attribution is the SDK's funding model and is enforced in three independent layers** — `examples/_attribution.ts` (reads env), `StrategyBase.applyAttributionPolicy()`, and `WsExecutor.resolveIntegratorFields()`. Each **re-derives** the decision rather than trusting its caller; do not "simplify" that into a single pass-through. Equally: the opt-out (`BUILDER_ATTRIBUTION=off`, `INTEGRATOR_ACCOUNT_INDEX=0`) must keep working at **every** layer, and the startup disclosure must keep printing before the first order. Attribution is disclosed and optional, never covert.
- `src/attribution/builder-registry.ts` is frozen and checksummed (`REGISTRY_CHECKSUM`, FNV-1a). Editing an account index or a fee cap without updating the checksum makes `verifyRegistryIntegrity()` throw at startup — that is deliberate. Update both, then run `npx jest tests/builder-attribution.test.ts`.
- Fee units are **millionths**, not bps (50 = 0.5 bps). The SDK caps what it will sign at maker 200 / taker 1000 and **throws rather than clamping** — keep it that way so a units mix-up is loud.

## Examples

`examples/` contains 60+ runnable scripts run via `npx tsx examples/<name>.ts`. **Most hit a live network and need real `.env` credentials** — they are not part of `npm test`. `smoke:live` is the live smoke. Read `examples/README.md` for which examples require account-specific state (balances, whitelist, second funded account).

## Style / conventions

- TypeScript `strict: true` + `exactOptionalPropertyTypes: true` + `noImplicitOverride: true`. Be careful with optional properties — use `undefined` explicitly, not omission, when the type is `T | undefined`.
- `noUnusedLocals`/`noUnusedParameters` are **off**.
- Source uses **extensionless relative imports** (`./foo`); the `fix:esm` post-build step adds `.js`. Do not add `.js` in `src/`.
- `tsconfig.json` has a `@/*` path alias to `src/*` but the source does **not** use it — keep using relative imports.
- `src/ws.d.ts` is a hand-written ambient declaration for the `ws` module.
- `.env` is gitignored; never commit credentials. `.env.example` is the template.