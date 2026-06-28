# Changelog

All notable changes to the Lighter TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.12] - 2026-06-26

### Added
- `examples/quickstart.ts` — minimal end-to-end example (create → confirm → cancel a single order) for first-time setup, separate from the SL/TP-bundled `create_market_order.ts`.
- New examples covering previously-unported protocol features: integrator approval/revocation (`integrator_approve.ts`, `integrator_approve_same_master.ts`, `integrator_revoke.ts`, `integrator_create_modify_order.ts`), self-trade prevention (`self_trade_create_modify_order.ts`, `self_trade_grouped_orders.ts`), UTA and per-asset margin toggles (`enable_uta.ts`, `disable_uta.ts`, `enable_eth_as_margin.ts`, `disable_eth_as_margin.ts`), skip-nonce orders (`create_order_skip_nonce.ts`), staking (`stake_and_unstake.ts`), RFQ (`rfq_create_and_list.ts`), referrals (`referral_create.ts`), bridge intent addresses (`bridge_create_intent_address.ts`), token list (`tokenlist.ts`), and additional info endpoints (`info_api_new_endpoints.ts`).
- `src/api/tokenlist-api.ts` — token list API client.
- `from_is_spot_account` option on `transfer()`/`transferSameMasterAccount()`, allowing same-account spot↔perp transfers (previously the source and destination route were always forced equal).

### Fixed
- Rebuilt the WASM signer against `lighter-go` (was one commit behind, missing a validation fix for 0-fee integrator approval with non-zero expiry).
- `approveIntegrator()`'s `approvalExpiry` is a millisecond timestamp, consistent with order expiry elsewhere in the SDK; the integrator example scripts previously computed it in seconds, causing approvals to be rejected as already-expired.
- `AccountApi.getAccount()` and `getAccountsByL1Address()` now correctly unwrap the `{ accounts: [...] }` / `{ sub_accounts: [...] }` response wrappers instead of returning them as-is.
- `Account`, `AccountPosition`, and `ExchangeStats` types corrected to match actual API response fields (previous fields such as `side`/`entry_price`/`mark_price` did not exist on the live API).
- `InfoApi.getTransferFeeInfo()`, `NotificationApi.acknowledgeNotification()`/`acknowledgeNotificationWithResponse()`, and `ReferralApi.getReferralPoints()`/`getReferralPointsWithResponse()` were passing the auth headers object as the wrong argument to the underlying HTTP client, silently dropping the `Authorization` header.
- `close_position.ts`/`close_all_positions.ts` used the stale `avg_entry_price` as the market order's execution price cap, which could prevent the closing order from crossing the book; now uses live best bid/ask with a slippage buffer.
- `create_grouped_orders.ts`'s OCO example used two plain LIMIT legs; the protocol requires both legs to be reduce-only with one Stop-Loss and one Take-Profit type.
- All `examples/spot/*.ts` files used `import.meta.url === \`file://${process.argv[1]}\`` to detect direct execution, which never matches on Windows; switched to `process.argv[1]?.includes(...)`.
- `withdraw_fast.ts` referenced the wrong environment variable name in its error message and used `require()` under ESM.
- `system_setup.ts` and `onboarding.ts` could silently re-register (and invalidate) the API key index currently in active use; both now refuse to overwrite an already-registered key unless explicitly confirmed.
- `package.json` version and the `VERSION` constant in `src/index.ts` were out of sync (`1.0.11` vs `1.1.0`); both now track the same value.
- **`waitForTransaction()` could time out on already-committed transactions.** It checks the Explorer API first and only fell back to the authoritative core transaction API when the explorer returned a successful-but-ambiguous response; if the explorer request itself failed (e.g. a 404 because the explorer hadn't indexed the transaction yet), the code treated that as "not confirmed yet" and kept retrying the explorer exclusively, never checking the core API — even though the core API already showed the transaction committed. Every example that calls `waitForTransaction()` was affected; many worked around it with a try/catch that downgraded the eventual timeout to a warning, masking the real cause as "network latency." The core API fallback now runs on any explorer-lookup failure, not just on an ambiguous explorer response.
- `.env.example` was saved in UTF-16 encoding and rendered as garbled spaced-out text; rewritten as plain UTF-8 with corrected required/optional field guidance.

### Tested
- Full example suite (66 files, including `examples/spot/`) exercised against a live mainnet account: order lifecycle (perp + spot), grouped/OCO/OTO/OTOCO orders, integrator approve/order/revoke lifecycle, sub-accounts, transfers, margin/UTA toggles, referrals, account tier changes, and withdrawal signing.
- `npm run build` (CJS + ESM + browser + UMD), `npm run verify:wasm`, and `tsc --noEmit` all clean.

## [1.0.11] - 2026-04-06

### Added
- Added `timeInForce?: TimeInForce` to `OtocoProtectionOrderParams`.
- Added integrator and skip nonce support in signer order flows:
  - `integratorAccountIndex`, `integratorTakerFee`, `integratorMakerFee`
  - `skipNonce`
- Added `total_funding_paid_out?: string` to account position types.
- Added WebSocket `account_all` subscription helpers and exported types.

### Fixed
- Fixed `OrderApi.getOrderBookOrders()` to send `limit` (with `depth` kept as a backward-compatible alias).
- Improved local WASM resolution in development so local rebuilt assets are preferred over installed package assets.

### Tested
- CJS and ESM builds validated independently.
- Live create/cancel order flow validated through both built artifacts (`dist/cjs` and `dist/esm`).

## [1.0.10] - 2026-03-01

### Added
- Multi-format module support: ESM (`dist/esm`), CJS (`dist/cjs`), and a UMD browser bundle (`dist/umd`), with a modern `package.json` `exports` field for dual module resolution.
- Browser & Next.js support via `environment.ts`: `isBrowser()`, `isNodeJS()`, `isNextJS()`/`isNextJSClient()`/`isNextJSServer()`, `isReactNative()`, `isDeno()`, `detectEnvironment()`, `getWebSocketConstructor()`, `hasCryptoSupport()`, `hasLocalStorageSupport()`/`hasIndexedDBSupport()`.
- Expanded API method coverage: `AccountApi.getAccountLimits()`, `getAccountMetadata()`, `faucet()`, `getLiquidations()`, `getPositionFundings()`; `TransactionApi.getTransferHistory()`; `OrderApi.export()`; `RootApi.getStatus()`.
- New type definitions: `AccountLimits`, `AccountMetadata`, `Liquidation`, `LiquidationResponse`, `PositionFunding`, `PositionFundingResponse`, `SystemStatus`.
- `tsconfig.cjs.json` / `tsconfig.esm.json` and corresponding `build:cjs` / `build:esm` / `build:umd` scripts.

### Changed
- `package.json` `type` field changed from `"commonjs"` to `"module"`.
- Build output now split across `dist/cjs/`, `dist/esm/`, `dist/umd/`.

### Improved
- Better compatibility with modern bundlers (Webpack 5+, Vite, esbuild, Rollup) and tree-shaking via `sideEffects: false`.

### Fixed
- `package.json` exports field now correctly declares all module formats with matching type declarations.

## [1.0.9] - 2026-01-10

### Fixed
- WASM build/publish pipeline: standalone browser ESM bundle, `.cjs` WASM build scripts under `"type": "module"`, and runtime-compatibility fixes for the bundled `wasm_exec.js`.

## [1.0.8] - 2025-12-15

### Changed
- Repository URL updated.
- Removed Proxy support in favor of simpler, more predictable request handling; reduced default debug logging.

## [1.0.7] - 2025-11-27

### Added
- Spot market support with dedicated examples: `create_spot_limit_order.ts`, `create_market_spot_orders.ts`, `create_spot_twap_order.ts`, `cancel_spot_order.ts`.
- Grouped orders (OTO/OCO/OTOCO) via `createGroupedOrders()`, `createOcoOrder()`, `createOtocoOrder()`.
- Public pool operations (create, update, mint, burn shares), subaccount management, and account tier management.

### Changed
- Market index type extended from `uint8` to `uint16` to support larger market indices (spot markets).

### Fixed
- Position detection retry logic for API synchronization lag.
- Nonce handling to prevent spurious "invalid nonce" errors.

## [1.0.6] - 2025-12-01

### Added
- `createOcoOrder()` and `createOtocoOrder()` as explicit methods for OCO/OTOCO order patterns, plus `GroupingType` enum and `OcoOrderParams`/`OtocoOrderParams` types.
- `docs/MarketHelper.md` and `docs/Utilities.md`.

### Removed
- `createUnifiedOrder` — superseded by `createOtocoOrder()` (orders with SL/TP) and `createOrder()` (single orders).

### Fixed
- `TypeError: activeOrders is not iterable` — `getAccountActiveOrders()`/`getAccountInactiveOrders()` now correctly extract the `orders` array from the response.
- Order lookup now matches on `client_order_index` correctly.
- TWAP batches now exclude SL/TP orders to avoid invalid reduce-only-direction errors.
- `Order` type fields aligned with actual API response (`filled_base_amount`, `remaining_base_amount`, etc.).
- Removed dangerous default private key values from examples.
- Fixed repository URL placeholder in README.

## [1.0.5] - 2025-10-13

### Added
- `create_auth_token.ts`, `nonce_manager.ts`, `deposit_to_subaccounts.ts`, `withdraw.ts`, `market_order_with_sl_tp.ts` examples.
- `transaction-helper.ts` with reusable transaction-confirmation utilities.

### Fixed
- More consistent error handling/logging throughout the codebase.
- Removed verbose WebSocket connection/reconnection logs.

## [1.0.4] - 2025-01-29

### Added
- Standalone WASM signer — no local Go installation required.
- Automatic WASM path resolution; simplified configuration (no `wasmConfig` needed for basic usage).
- Cross-platform support (Windows, Linux, macOS) without a Go toolchain.

### Changed
- Uses the official Go `wasm_exec.js` runtime instead of a custom version.

### Fixed
- `mem.set is not a function` WASM initialization error.
- DataView initialization and Go-runtime module name mapping.

## [1.0.3] - 2025-01-26

### Fixed
- Removed an overly strict private key length validation that was breaking package functionality.

## [1.0.2] - 2025-01-26

### Fixed
- README examples updated to match actual method signatures and order-type constants.
- Corrected transfer and leverage-update method parameter order.

## [1.0.1] - 2025-01-26

### Added
- Stop Loss, Stop Loss Limit, Take Profit, and Take Profit Limit order types.
- TWAP orders.
- Performance monitoring/benchmarking utilities.

### Fixed
- WASM path resolution issues when consumed from npm (relative-path "Cannot find module" errors).
- Automatic `wasm_exec.js` detection in Node.js environments.

### Performance
- ~200ms improvement in WASM initialization via enhanced nonce caching and HTTP connection pooling.

## [1.0.0] - 2025-01-19

### Added
- Initial release: WASM-based signer client, full API client coverage, WebSocket client for real-time data, comprehensive TypeScript types.
- `SignerClient`, `ApiClient`, `WsClient`, account/order/transaction management.
- Limit and market order types, batch transactions, automatic WebSocket reconnection.
- 14 example scripts covering core functionality.
