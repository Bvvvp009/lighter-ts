# Lighter TypeScript SDK Examples

Complete, working examples for trading on Lighter Protocol. Every file below has been run against a live mainnet account as part of this SDK's release validation, using minimal order/transfer sizes.

## 🚀 Quick Start

```bash
npm install

# Set up environment variables
cp .env.example .env
```

### Environment Variables

```bash
# Network: mainnet (default, L2 chain_id 304) | testnet (L2 chain_id 300) | robinhood (L2 chain_id 466324) | robinhood-testnet (L2 chain_id 300)
# Drives both the API/WS host and the L2 signing chain_id (the first element of every L2 tx hash).
# See the root README.md "Networks" table for the full host + L1/L2 chain_id breakdown.
LIGHTER_NETWORK=mainnet
# Optional overrides for a custom/local deployment (applied only when LIGHTER_NETWORK is unset):
# BASE_URL=https://mainnet.zklighter.elliot.ai
# WS_URL=wss://mainnet.zklighter.elliot.ai/stream
# CHAIN_ID=304
# WS_READONLY=true   # read-only stream for restricted regions (Robinhood)

API_PRIVATE_KEY=your_api_private_key_here
ACCOUNT_INDEX=your_account_index
API_KEY_INDEX=your_api_key_index

# Optional (used by specific examples)
ETH_PRIVATE_KEY=your_ethereum_wallet_private_key   # L1 signatures for transfers/withdrawals
L1_ADDRESS=0x...                                    # withdrawal destination
SUB_ACCOUNT_INDEX=...
TO_ACCOUNT_INDEX=...
INTEGRATOR_INDEX=...
```

### Running Examples

```bash
npx tsx examples/create_market_order.ts
```

Every example uses `import` (ESM). The SDK itself ships ESM, CJS, and UMD builds — see the root [README](../README.md#module-formats) for consuming it from a CommonJS project.

## 📋 Example Overview

### Start Here
- **quickstart.ts** — the smallest end-to-end flow: create a limit order, wait for confirmation, cancel it. Run this first to confirm your setup works.
- **robinhood_quickstart.ts** — read-only smoke test against Lighter-on-Robinhood (`LIGHTER_NETWORK=robinhood`): fetches the contract address, token list, system config, and L1 info. No key required.
- **robinhood_ws_smoke.ts** — read-only WebSocket smoke against `wss://api.rh.lighter.xyz/stream?readonly=true`: connects, subscribes to `order_book/0`, prints a few messages, and exits. No key required.
- **robinhood_authenticated_smoke.ts** — **authenticated signing smoke** against Robinhood (`LIGHTER_NETWORK=robinhood` + `API_PRIVATE_KEY`/`ACCOUNT_INDEX`/`API_KEY_INDEX`). The decisive chain_id test: it submits a signed L2 `cancelAllOrders` no-op tx (safe — skipped if you have open orders) and waits for on-chain confirmation. Auth-token/account reads do **not** bind the chain_id, so only a signed L2 tx can confirm it. Set `CHAIN_ID_OVERRIDE=4663` to A/B it — the L1 chainId `4663` is rejected with `invalid signature`, while the L2 signing chain_id `466324` is accepted and confirmed.
- **robinhood_funded_order.ts** — **the real funded trading round-trip** on Robinhood (`LIGHTER_NETWORK=robinhood` + a funded account). Places a signed L2 limit BUY on market 0 (ETH perp) priced at ~50% of the last trade (so it rests and never fills), waits for on-chain confirmation, verifies it's resting on the book, cancels it, and verifies the cancel — the full create → confirm → cancel loop with chain_id `466324`. Safe by design: far-from-market price (no fill), smallest legal notional (margin ~$0.5–2 reserved, then released), cancels only its own order (never `cancelAll`), refuses to guess a price, and retries the post-cancel read to absorb read-after-write lag. Margin is returned to the exact starting balance on cancel (zero net cost). Run `robinhood_authenticated_smoke.ts` first (it proves the chain_id without needing funds).

### Order Lifecycle (Perp)
- **create_market_order.ts** — Market order with integrated SL/TP (OTOCO)
- **create_market_order_max_slippage.ts** — Market order with max-slippage protection
- **create_market_order_quote_amount.ts** — Market order sized by quote (USD) amount
- **create_limit_order.ts** — Limit order with integrated SL/TP
- **create_twap_order.ts** — TWAP order with integrated SL/TP
- **create_order_skip_nonce.ts** — Order creation using the skip-nonce attribute
- **modify_order.ts** — Modify an existing order without cancel/recreate
- **cancel_order.ts** — Cancel a specific order
- **cancel_all_orders.ts** — Cancel all open orders
- **cancel_all_orders_single_market.ts** — Cancel all open orders on one market
- **close_position.ts** — Close a specific position
- **close_all_positions.ts** — Close every open position

### Grouped & Conditional Orders
- **create_grouped_orders.ts** — OTO / OCO / OTOCO grouped orders
- **create_grouped_ioc_with_attached_sl_tp.ts** — IOC entry with attached SL/TP via OTOCO
- **create_grouped_ioc_with_integrator.ts** — IOC grouped order with integrator fee routing
- **create_position_tied_sl_tp.ts** — Position-tied SL/TP via OCO
- **self_trade_create_modify_order.ts** — Self-trade-prevention modes on create/modify
- **self_trade_grouped_orders.ts** — Self-trade-prevention modes on grouped orders

### Spot Markets
See [`examples/spot/`](./spot) — market indices 2048+ (ETH SPOT, etc.):
- **create_spot_limit_order.ts** / **create_spot_limit_order_with_sltp.ts**
- **create_market_spot_orders.ts**
- **create_spot_twap_order.ts**
- **modify_spot_order.ts**
- **cancel_spot_order.ts**

### Integrator (Fee Routing)
A trading account can approve another account index ("the integrator" — a frontend, bot platform, or affiliate) to receive a share of taker/maker fees on routed orders:
- **integrator_approve.ts** — Cross-account approval with L1 signature
- **integrator_approve_same_master.ts** — Approve a sub-account under the same master (no L1 signature needed)
- **integrator_create_modify_order.ts** — Place/modify an order with integrator fees attached
- **integrator_revoke.ts** — Revoke a prior approval (re-approve with all fees and expiry set to 0)

### Account & Margin Configuration
- **update_margin_leverage.ts** — Update leverage and margin mode (CROSS/ISOLATED) per market
- **update_margin.ts** — Add/remove isolated-margin collateral
- **margin_eth_add_collateral_http.ts** / **margin_eth_remove_collateral_http.ts** — ETH-as-margin collateral management via HTTP endpoints
- **enable_eth_as_margin.ts** / **disable_eth_as_margin.ts** — Toggle ETH as usable margin collateral
- **enable_uta.ts** / **disable_uta.ts** — Toggle Unified Trading Account mode
- **change_account_tier.ts** — Upgrade to premium tier or revert to standard

### Sub-Accounts & Transfers
- **create_subaccount.ts** — Create a sub-account from the master account
- **deposit_to_subaccount.ts** — List existing sub-accounts and transfer USDC to one
- **transfer_same_master_account.ts** — Transfer between sub-accounts under the same master (no L1 signature)
- **transfer_spot_perp.ts** — Transfer USDC between the spot and perp routes of the same account
- **withdraw_fast.ts** — Fast withdrawal via the fast-bridge pool
- **withdraw_to_l1.ts** — Standard withdrawal to L1 (Ethereum mainnet)

### Public Pools & Staking
- **public_pool_info.ts** — Read pool metadata and share price
- **public_pool_deposit.ts** / **public_pool_withdraw.ts** — Mint/burn pool shares
- **public_pool_operations.ts** — Create, update, mint, and burn shares
- **stake_and_unstake.ts** — Stake and unstake assets

### RFQ & Referrals
- **rfq_create_and_list.ts** — Create and list RFQs (requires `can_rfq` enabled on your account)
- **referral_create.ts** — Create a referral code and check referral points

### Bridge
- **bridge_create_intent_address.ts** — Create an L1 bridge intent deposit address

### Keys, Auth & Multi-Key
- **system_setup.ts** — Full account/API-key health check and setup (registers a new API key — refuses to overwrite an in-use index unless `CONFIRM_OVERWRITE=1`)
- **onboarding.ts** — End-to-end onboarding: deposit, account creation, API key generation
- **create_auth_token.ts** — Generate a signed auth token for authenticated GET endpoints
- **create_with_multiple_keys.ts** — Place orders using multiple API keys
- **multi_client_advanced.ts** — Advanced operations across multiple `SignerClient` instances (needs a second funded account)
- **revoke_api_key.ts** — Revoke an API key index
- **get_set_maker_only_api_keys.ts** — Read/set maker-only API key restrictions

### Data, Info & System
- **market_data.ts** — Market data, order books, trades, candlesticks (HTTP + WebSocket)
- **spot_get_account_assets_http.ts** — Fetch account asset/margin breakdown via HTTP
- **info_api_new_endpoints.ts** — Additional `InfoApi` endpoints (transfer fee info, etc.)
- **tokenlist.ts** — Fetch the supported token list
- **send_tx_batch.ts** — Submit multiple transactions in a batch
- **live_smoke.ts** — End-to-end smoke test (probes-only by default; set `SMOKE_SUBMIT_TX=1` to also submit a real order)

### WebSocket
- **websocket_subscribe.ts** — Connect, subscribe to channels, and stream real-time data

## 🔧 Key Patterns

### Grouped Order Construction (OTOCO)

```typescript
const result = await signerClient.createOtocoOrder({
  mainOrder: {
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000,
    price: 4500,
    isAsk: false,
    orderType: OrderType.LIMIT
  },
  stopLoss: { triggerPrice: 4200, isLimit: false },
  takeProfit: { triggerPrice: 4800, isLimit: false }
});
```

Note: OCO legs must both be `reduceOnly`, with one Stop-Loss-type and one Take-Profit-type order — the protocol rejects two plain LIMIT legs.

### Transaction Status Monitoring

```typescript
await signerClient.waitForTransaction(txHash, 30000, 2000);
```

### Error Handling

```typescript
const [tx, hash, error] = await signerClient.createOrder(params);
if (error || !hash) {
  console.error('❌ Order failed:', error);
  return;
}
```

## 🔒 Security Notes

- Never commit `.env` or `api_key_config.json` — both contain real private keys and are gitignored by default.
- Test with small amounts first (minimum lot/exchange size).
- Examples that register or rotate API keys (`system_setup.ts`, `onboarding.ts`) refuse to overwrite the key index currently in active use unless explicitly confirmed — don't bypass that guard without understanding the consequences (it can invalidate your active trading credentials).

## 🆘 Troubleshooting

1. **"not enough asset balance" / "not enough margin"** — your account's real on-chain asset balance, not just its margin valuation, must cover the transfer/order. Check via `AccountApi.getAccount()`'s `assets[].balance` field.
2. **WASM build issues** — Go is only needed if rebuilding the WASM signer from `lighter-go` source; the published package ships a prebuilt binary.
3. **Order expiry errors** — `orderExpiry`/`approvalExpiry` fields are millisecond timestamps, not seconds.
4. **Windows path issues** — examples detect direct execution via `process.argv[1]?.includes('<name>')`, not `import.meta.url`, for cross-platform compatibility.
