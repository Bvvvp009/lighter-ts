/**
 * Read-only probe of BOTH venues (Core mainnet + Robinhood):
 * account summary, margin balances, open positions, open orders, and
 * market config (scales/min size) for MARKET_ID. No orders placed.
 *
 * Env: uses same vars as run_mm.ts (LIGHTER_MAINNET_* for Core, plain for RH).
 */
import * as dotenv from 'dotenv';
import {
  ApiClient,
  AccountApi,
  OrderApi,
  SignerClient,
  NETWORKS,
} from '../src';

dotenv.config();

const MARKET_ID = parseInt(process.env.MARKET_ID || '1', 10);

function fmtUsd(x: number | undefined | null): string {
  if (x === undefined || x === null) return 'n/a';
  return `$${x.toFixed(4)}`;
}

async function probeVenue(
  label: string,
  networkName: 'mainnet' | 'robinhood',
  accountIndex: number,
  apiKeyIndex: number,
  privateKey: string,
): Promise<void> {
  const net = NETWORKS[networkName];
  console.log(`\n=== ${label} (${networkName}) — host=${net.apiUrl} account=${accountIndex} keyIdx=${apiKeyIndex} ===`);

  const signer = new SignerClient({
    network: networkName,
    privateKey,
    accountIndex,
    apiKeyIndex,
  });
  await signer.initialize();
  await signer.ensureWasmClient();
  const auth = await signer.createAuthToken();

  const api = new ApiClient({ host: net.apiUrl });
  const accountApi = new AccountApi(api);
  const orderApi = new OrderApi(api);

  // Full account record (margin + positions)
  try {
    const acct = await accountApi.getAccount({ by: 'index', value: String(accountIndex) }, auth);
    const avail = parseFloat(acct?.available_balance ?? '0');
    const total = parseFloat(acct?.total_asset_value ?? '0');
    const margin = parseFloat((acct as any)?.margin_balance ?? '0');
    console.log(`  account ${acct?.index}: avail=${fmtUsd(avail)} total_assets=${fmtUsd(total)} margin=${fmtUsd(margin)} status=${acct?.status ?? 'n/a'}`);
    const positions = (acct?.positions || []).filter((p: any) => parseFloat(p.position) !== 0);
    if (positions.length) {
      for (const p of positions) {
        console.log(`  POS mkt=${p.market_id} ${p.symbol} sign=${p.sign} size=${p.position} entry=${p.avg_entry_price} uPnL=${p.unrealized_pnl}`);
      }
    } else {
      console.log('  positions: flat');
    }
  } catch (e) {
    console.log(`  getAccount FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Active orders
  try {
    const active = await orderApi.getAccountActiveOrders(accountIndex, MARKET_ID, auth);
    console.log(`  active orders (mkt ${MARKET_ID}): ${active.length}${active.length ? ' -> ' + active.map((o: any) => `#${o.order_index} ${o.is_ask ? 'ASK' : 'BID'} ${o.base_amount} @ ${o.price}`).join(' | ') : ''}`);
  } catch (e) {
    console.log(`  active orders FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Market config for sizing
  try {
    const details = await orderApi.getOrderBookDetailsRaw(MARKET_ID);
    const d = details.order_book_details?.[0];
    if (d) {
      console.log(`  market ${MARKET_ID}: ${d.symbol} size_decimals=${d.size_decimals} price_decimals=${d.price_decimals} min_base=${d.min_base_amount} last=${d.last_trade_price}`);
    }
  } catch (e) {
    console.log(`  market config FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }

  await api.close();
}

async function main(): Promise<void> {
  const rhKey = process.env.API_PRIVATE_KEY!;
  const coreKey = process.env.LIGHTER_MAINNET_API_PRIVATE_KEY || process.env.CORE_API_PRIVATE_KEY;
  const coreAcct = parseInt(process.env.LIGHTER_MAINNET_ACCOUNT_INDEX || process.env.CORE_ACCOUNT_INDEX || '0', 10);
  const coreKeyIdx = parseInt(process.env.LIGHTER_MAINNET_API_KEY_INDEX || process.env.CORE_API_KEY_INDEX || '0', 10);
  const rhAcct = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const rhKeyIdx = parseInt(process.env.API_KEY_INDEX || '0', 10);

  if (!rhKey) throw new Error('Missing API_PRIVATE_KEY (RH)');
  if (!coreKey) throw new Error('Missing LIGHTER_MAINNET_API_PRIVATE_KEY (Core)');

  console.log(`Probing market ${MARKET_ID} on both venues (read-only)`);
  await probeVenue('CORE', 'mainnet', coreAcct, coreKeyIdx, coreKey);
  await probeVenue('ROBINHOOD', 'robinhood', rhAcct, rhKeyIdx, rhKey);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});