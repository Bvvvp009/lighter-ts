/**
 * skipNonce — supplying an explicit nonce instead of letting the SDK fetch one.
 *
 * By default every signed tx calls `next_nonce` first. Under a burst that
 * round-trip dominates latency, so the signer accepts `skipNonce: true` plus an
 * explicit `nonce`, letting the caller manage the sequence itself.
 *
 * This example PLACES REAL ORDERS. It quotes far from the touch as POST_ONLY
 * and cancels in a `finally` block, but it still needs a funded account, so it
 * is gated behind CONFIRM_LIVE_ORDERS=1.
 *
 *   npx tsx examples/create_order_skip_nonce.ts                    # dry run
 *   CONFIRM_LIVE_ORDERS=1 npx tsx examples/create_order_skip_nonce.ts
 *
 * Env: API_PRIVATE_KEY, ACCOUNT_INDEX, API_KEY_INDEX, LIGHTER_NETWORK,
 *      SKIP_NONCE_MARKET (default 0), SKIP_NONCE_PRICE (integer ticks).
 */

import * as dotenv from 'dotenv';
import {
  ApiClient,
  SignerClient,
  TransactionApi,
  assertAccountIndex,
  resolveNetworkFromEnv,
} from '../src';
import { printAttributionDisclosure, requireKeyFrom, venueForNetwork } from './_attribution';

dotenv.config();

const MARKET_INDEX = parseInt(process.env.SKIP_NONCE_MARKET || '0', 10);
const LIVE = process.env.CONFIRM_LIVE_ORDERS === '1';

async function main(): Promise<void> {
  const network = resolveNetworkFromEnv();
  // Layer 1 credential guard: no key, no client. Never echoes key material.
  const privateKey = requireKeyFrom(['API_PRIVATE_KEY'], 'skip-nonce example: key load');
  const accountIndex = assertAccountIndex(process.env.ACCOUNT_INDEX ?? 0);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);

  console.log(`Network: ${network.name} (${network.apiUrl}, chain_id ${network.chainId})`);
  console.log(`Account: ${accountIndex}  api key: ${apiKeyIndex}  market: ${MARKET_INDEX}`);

  const venue = venueForNetwork(network.name);
  if (venue) printAttributionDisclosure(venue);

  if (!LIVE) {
    console.log(`
DRY RUN — no orders sent. This example would:
  1. read next_nonce ONCE via TransactionApi,
  2. send a POST_ONLY order with skipNonce:true and nonce = n,
  3. send a second one with nonce = n + 1 (no extra round trip),
  4. cancel both.
Re-run with CONFIRM_LIVE_ORDERS=1 to execute against a funded account.`);
    return;
  }

  const client = new SignerClient({
    url: network.apiUrl,
    privateKey,
    accountIndex,
    apiKeyIndex,
  });

  await client.initialize();
  await client.ensureWasmClient();

  // The signer's own nonce cache is private; the public path is TransactionApi.
  const apiClient = new ApiClient({ host: network.apiUrl });
  const transactionApi = new TransactionApi(apiClient);
  const { nonce } = await transactionApi.getNextNonce(accountIndex, apiKeyIndex);
  console.log(`Starting nonce: ${nonce}`);

  // Quote far from the touch so POST_ONLY rests instead of filling. Override
  // with SKIP_NONCE_PRICE when running on a market other than the default.
  const price = parseInt(process.env.SKIP_NONCE_PRICE || '178000', 10);
  const placed: number[] = [];

  try {
    for (const [i, label] of ['auto-nonce', 'skip-nonce'].entries()) {
      const clientOrderIndex = Date.now() + i;
      console.log(`\nSending ${label} order (nonce ${nonce + i})...`);
      const [, txHash, err] = await client.createOrder({
        marketIndex: MARKET_INDEX,
        clientOrderIndex,
        baseAmount: 100,
        price,
        isAsk: true,
        orderType: SignerClient.ORDER_TYPE_LIMIT,
        timeInForce: SignerClient.ORDER_TIME_IN_FORCE_POST_ONLY,
        skipNonce: true,
        nonce: nonce + i,
      });
      if (err) {
        console.error(`${label} order error: ${err}`);
      } else {
        console.log(`${label} order created: ${txHash}`);
        placed.push(clientOrderIndex);
      }
    }
  } finally {
    // Never leave resting orders behind, even if a send above threw.
    for (const orderIndex of placed) {
      const [, , cancelErr] = await client.cancelOrder({ marketIndex: MARKET_INDEX, orderIndex });
      console.log(
        cancelErr ? `Cancel ${orderIndex} failed: ${cancelErr}` : `Cancelled ${orderIndex}`,
      );
    }
    await client.close();
    await apiClient.close?.();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
