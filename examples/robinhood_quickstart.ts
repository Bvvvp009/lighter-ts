/**
 * Robinhood quickstart: read-only smoke test against Lighter-on-Robinhood.
 *
 * Lighter-on-Robinhood shares the same core as the Lighter L2; only the API/WS
 * hosts, contract address, signing chain_id (466324), and supported assets
 * differ. This example issues only read-only, unauthenticated requests, so it
 * needs no private key and no WASM signer.
 *
 * Set `LIGHTER_NETWORK=robinhood` in .env (or run as-is — it defaults to
 * robinhood for convenience):
 *
 *   npx tsx examples/robinhood_quickstart.ts
 *
 * For a restricted region, also set `WS_READONLY=true` if you subscribe to the
 * stream (see examples/websocket_subscribe.ts).
 */

import {
  ApiClient,
  RootApi,
  InfoApi,
  TokenlistApi,
  getNetwork,
  resolveNetworkFromEnv,
} from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function robinhoodQuickstart() {
  // Default to robinhood unless the caller pinned LIGHTER_NETWORK to something else.
  const network = process.env['LIGHTER_NETWORK'] ? resolveNetworkFromEnv() : getNetwork('robinhood');
  console.log(`Lighter network: ${network.name}`);
  console.log(`  API:      ${network.apiUrl}`);
  console.log(`  WS:       ${network.wsUrl}`);
  console.log(`  chain_id: ${network.chainId}`);
  console.log('');

  const api = new ApiClient({ host: network.apiUrl });
  const root = new RootApi(api);
  const info = new InfoApi(api);
  const tokenlist = new TokenlistApi(api);

  // Some endpoints are region-restricted and may 403; wrap each read so the
  // smoke test reports what's reachable instead of aborting on the first miss.
  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const data = await fn();
      console.log(`${label} -> ${JSON.stringify(data)}`);
      return data;
    } catch (err: any) {
      console.log(`${label} -> ERROR ${err?.status ?? ''} ${err?.message ?? err}`);
      return undefined;
    }
  };

  // 1. Instance info (contract address).
  const rootInfo: any = await safe('GET /info              ', () => root.getInfo());
  const contract = rootInfo?.contract_address;
  if (contract) {
    console.log(`  contract: ${contract}`);
    if (network.name === 'robinhood' && contract !== '0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d') {
      console.warn(`  ⚠️  expected Robinhood contract 0x94bAB9693Ba2f6358507eFfcbd372b0660AFfF9d, got ${contract}`);
    }
  }
  console.log('');

  // 2. Supported assets (Robinhood has a different set than the Lighter L2).
  const list: any = await safe('GET /api/v1/tokenlist    ', () => tokenlist.getTokenlist());
  const tokens = list?.tokens ?? [];
  if (tokens.length) {
    console.log(`  ${tokens.length} tokens: ${tokens.map((t: any) => t.symbol).join(', ')}`);
  }
  console.log('');

  // 3. System config + L1 info.
  await safe('GET /api/v1/systemConfig ', () => info.getSystemConfig());
  await safe('GET /api/v1/layer1BasicInfo', () => info.layer1BasicInfo());

  console.log('\n✅ Robinhood read-only smoke test complete.');
}

const isMain = process.argv[1]?.includes('robinhood_quickstart');
if (isMain) {
  robinhoodQuickstart().catch((err) => {
    console.error('❌ Robinhood smoke test failed:', err);
    process.exit(1);
  });
}

export { robinhoodQuickstart };