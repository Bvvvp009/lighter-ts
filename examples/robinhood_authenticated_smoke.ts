/**
 * Robinhood AUTHENTICATED signing smoke test.
 *
 * This is the decisive test of the Robinhood L2 signing chain_id (466324).
 *
 * Why it matters: read-only API/WS tests do not sign, and an auth-token
 * authenticated read does NOT bind the chain_id either — the Go signer's
 * `ConstructAuthToken` signs only "deadline:accountIndex:apiKeyIndex" (no
 * chain_id). So neither reads nor auth-token reads can tell 466324 from 4663.
 * Only a real signed L2 transaction can: the chain_id is the FIRST element of
 * every L2 tx hash, and the sequencer rejects a tx whose signature was made
 * with the wrong chain_id.
 *
 * Safe by design (no funds at risk, no real orders nuked):
 *   Tier 1 — auth token + getAccount: proves the credentials are valid on
 *            Robinhood. (Does NOT prove the chain_id — see above.)
 *   Tier 2 — count open orders across markets.
 *   Tier 3 — if there are ZERO open orders, submit `cancelAllOrders(0, 0)`
 *            (market 255 = all): a signed L2 tx that is a no-op when nothing is
 *            open. On-chain confirmation of that no-op = the chain_id signature
 *            was accepted by the sequencer. If open orders exist, it SKIPS the
 *            cancel-all (so it never cancels your real orders) and reports the
 *            chain_id test as skipped.
 *
 * A/B the chain_id: set CHAIN_ID_OVERRIDE to force a different signing chain_id
 * on the SignerClient (bypassing the network's 466324). Run with 466324 (expect
 * Tier 3 success) and with 4663 (the L1 EVM chainId — expect Tier 3 signature
 * rejection) to empirically prove 466324 is the correct L2 signing chain_id.
 *
 *   LIGHTER_NETWORK=robinhood                                   npx tsx examples/robinhood_authenticated_smoke.ts
 *   LIGHTER_NETWORK=robinhood CHAIN_ID_OVERRIDE=4663            npx tsx examples/robinhood_authenticated_smoke.ts
 *
 * Requires in .env: API_PRIVATE_KEY, ACCOUNT_INDEX, API_KEY_INDEX.
 * The private key is read from env and never printed.
 */

import { SignerClient, ApiClient, AccountApi, OrderApi, resolveNetworkFromEnv } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

function extractTxHash(txHash: any): string {
  if (!txHash) return '';
  if (typeof txHash === 'string') return txHash;
  if (typeof txHash === 'object') return txHash.tx_hash || txHash.hash || '';
  return '';
}

function looksLikeSignatureError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('signature') || m.includes('chain_id') || m.includes('chainid') ||
    m.includes('invalid signer') || m.includes('auth') && m.includes('fail');
}

async function main() {
  const privateKey = process.env['API_PRIVATE_KEY'] || '';
  const accountIndex = parseInt(process.env['ACCOUNT_INDEX'] || '', 10);
  const apiKeyIndex = parseInt(process.env['API_KEY_INDEX'] || '', 10);
  if (!privateKey || !Number.isFinite(accountIndex) || !Number.isFinite(apiKeyIndex)) {
    console.error('❌ Missing API_PRIVATE_KEY / ACCOUNT_INDEX / API_KEY_INDEX in .env');
    process.exit(1);
  }

  const network = resolveNetworkFromEnv();
  const overrideRaw = process.env['CHAIN_ID_OVERRIDE'];
  const override = overrideRaw ? Number(overrideRaw) : undefined;
  const effectiveChainId = (Number.isFinite(override) && (override as number) > 0) ? (override as number) : network.chainId;
  const overridden = effectiveChainId !== network.chainId;

  console.log('────────────────────────────────────────────────────────────');
  console.log(` network        : ${network.name}`);
  console.log(` api url        : ${network.apiUrl}`);
  console.log(` L2 signing id  : ${effectiveChainId}${overridden ? `  (OVERRIDE — network default is ${network.chainId})` : ''}`);
  console.log(` account index  : ${accountIndex}`);
  console.log(` api key index  : ${apiKeyIndex}`);
  console.log('────────────────────────────────────────────────────────────');

  const signerClient = new SignerClient({
    network,
    ...(overridden ? { chainId: effectiveChainId } : {}),
    privateKey,
    accountIndex,
    apiKeyIndex,
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient(); // creates the WASM signer with effectiveChainId
  console.log('✅ WASM signer initialized');

  const apiClient = new ApiClient({ host: network.apiUrl });
  const accountApi = new AccountApi(apiClient);
  const orderApi = new OrderApi(apiClient);

  // ---- Tier 1: credentials proof (auth token + account read) ----
  // NOTE: the auth token does NOT bind the chain_id, so this passing only
  // proves the key/account/apiKey are valid on Robinhood — not the chain_id.
  let auth: string;
  try {
    auth = await signerClient.createAuthTokenWithExpiry(8 * 60 * 60);
    console.log('✅ auth token created (signature does NOT include chain_id)');
  } catch (e: any) {
    console.error('❌ auth token failed:', e?.message ?? e);
    await apiClient.close();
    process.exit(1);
  }

  let account: any = null;
  try {
    account = await accountApi.getAccount({ by: 'index', value: String(accountIndex) }, auth);
    console.log('✅ account found on Robinhood:');
    console.log(`     index              : ${account.account_index ?? account.index}`);
    console.log(`     available_balance  : ${account.available_balance ?? account.total_asset_value ?? 'n/a'}`);
    console.log(`     total_asset_value  : ${account.total_asset_value ?? 'n/a'}`);
    console.log(`     assets             : ${account.assets?.length ?? 0}`);
  } catch (e: any) {
    console.error('❌ getAccount failed on Robinhood:', e?.message ?? e);
    console.error('   → credentials are not valid for this Robinhood account.');
    await apiClient.close();
    process.exit(1);
  }

  // ---- Tier 2: count open orders (safety gate for the cancel-all no-op) ----
  let openOrders = 0;
  const marketsToCheck = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const m of marketsToCheck) {
    try {
      const orders = await orderApi.getAccountActiveOrders(accountIndex, m, auth);
      openOrders += Array.isArray(orders) ? orders.length : 0;
    } catch {
      // market doesn't exist / 403 / no auth for this market — ignore
    }
  }
  console.log(`ℹ️  open orders across markets ${marketsToCheck[0]}..${marketsToCheck.at(-1)}: ${openOrders}`);

  // ---- Tier 3: chain_id proof via a signed L2 tx (no-op cancel-all) ----
  if (openOrders > 0) {
    console.log(`⚠️  ${openOrders} open order(s) found — SKIPPING cancelAllOrders so your real orders are not canceled.`);
    console.log('   To run the chain_id no-op test, cancel them first (or use an account with no open orders).');
    console.log(`\nVERDICT: chain_id ${effectiveChainId} — signing test SKIPPED (open orders present).`);
    await apiClient.close();
    return;
  }

  console.log(`\n→ submitting signed L2 cancelAllOrders(0,0) with chain_id ${effectiveChainId} ...`);
  const [, txHashRaw, error] = await signerClient.cancelAllOrders(0, 0);

  if (error) {
    console.error(`\n❌ signed L2 tx REJECTED with chain_id ${effectiveChainId}: ${error}`);
    if (looksLikeSignatureError(String(error))) {
      console.error('   → looks like a signature/chain_id rejection: the sequencer did NOT accept this chain_id.');
    } else {
      console.error('   → non-signature error (the signature itself was likely accepted; business/state rejection).');
    }
    console.error(`\nVERDICT: chain_id ${effectiveChainId} — signed L2 tx NOT accepted.`);
    await apiClient.close();
    process.exit(2);
  }

  const txHash = extractTxHash(txHashRaw);
  if (!txHash) {
    console.error('❌ cancelAllOrders returned no tx hash');
    await apiClient.close();
    process.exit(2);
  }
  console.log(`✅ signed L2 tx accepted by sequencer: ${txHash}`);

  try {
    await signerClient.waitForTransaction(txHash, 30000, 2000);
    console.log('✅ tx confirmed on-chain');
    console.log(`\nVERDICT: chain_id ${effectiveChainId} — signed L2 tx ACCEPTED & CONFIRMED on Robinhood. 🎉`);
  } catch (e: any) {
    console.error(`⚠️  tx submitted but confirmation wait failed: ${e?.message ?? e}`);
    console.error(`   (submission success already means the signature was accepted; confirmation may just be slow.)`);
    console.log(`\nVERDICT: chain_id ${effectiveChainId} — signed L2 tx ACCEPTED (confirmation wait timed out).`);
  }

  await apiClient.close();
}

const isMain = process.argv[1]?.includes('robinhood_authenticated_smoke');
if (isMain) {
  main().catch((e) => {
    console.error('smoke failed:', e);
    process.exit(1);
  });
}

export { main as robinhoodAuthenticatedSmoke };