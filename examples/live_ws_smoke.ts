/**
 * Live WS smoke test — verifies WsPrivateClient works against BOTH
 * Lighter Core (mainnet) and Lighter-on-Robinhood (robinhood).
 *
 * Phase 1: Read-only public channels on both venues (no key needed)
 * Phase 2: Authenticated private channels on the venue with credentials
 *
 * Run: npx tsx examples/live_ws_smoke.ts
 */

import * as dotenv from 'dotenv';
import {
  WsPrivateClient,
  SignerClient,
  SignerAuthTokenProvider,
  resolveWsUrl,
  NETWORKS,
  type WsOrderBookMessage,
  type WsTickerMessage,
  type WsMarketStatsMessage,
  type WsAccountOrdersMessage,
  type WsAccountAllPositionsMessage,
} from '../src';

dotenv.config();

interface VenueResult {
  tag: string;
  wsConnected: boolean;
  orderBookReceived: boolean;
  tickerReceived: boolean;
  marketStatsReceived: boolean;
  authWorks?: boolean;
  accountOrdersReceived?: boolean;
  positionsReceived?: boolean;
  errors: string[];
  sampleMessages: Record<string, any>;
}

function newResult(tag: string): VenueResult {
  return {
    tag,
    wsConnected: false,
    orderBookReceived: false,
    tickerReceived: false,
    marketStatsReceived: false,
    errors: [],
    sampleMessages: {},
  };
}

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function testPublicChannels(
  tag: string,
  wsUrl: string,
  marketId: number,
): Promise<VenueResult> {
  const result = newResult(tag);
  const client = new WsPrivateClient({ url: wsUrl });

  try {
    await client.connect();
    result.wsConnected = true;
    console.log(`  [${tag}] WS connected to ${wsUrl}`);

    // Subscribe to order book
    const obSub = await client.subscribeOrderBook(marketId);
    obSub.on('update', (msg: WsOrderBookMessage) => {
      if (!result.orderBookReceived) {
        result.orderBookReceived = true;
        result.sampleMessages.orderBook = {
          channel: msg.channel,
          type: msg.type,
          asksLen: msg.order_book?.asks?.length,
          bidsLen: msg.order_book?.bids?.length,
          nonce: msg.order_book?.nonce,
        };
        console.log(`  [${tag}] order_book received: ${msg.order_book?.asks?.length || 0} asks, ${msg.order_book?.bids?.length || 0} bids`);
      }
    });

    // Subscribe to ticker (BBO)
    const tickerSub = await client.subscribeTicker(marketId);
    tickerSub.on('update', (msg: WsTickerMessage) => {
      if (!result.tickerReceived) {
        result.tickerReceived = true;
        result.sampleMessages.ticker = {
          channel: msg.channel,
          type: msg.type,
          bestBid: msg.ticker?.b?.price,
          bestAsk: msg.ticker?.a?.price,
          symbol: msg.ticker?.s,
        };
        console.log(`  [${tag}] ticker received: bid=${msg.ticker?.b?.price} ask=${msg.ticker?.a?.price} (${msg.ticker?.s})`);
      }
    });

    // Subscribe to market stats
    const statsSub = await client.subscribeMarketStats(marketId);
    statsSub.on('update', (msg: WsMarketStatsMessage) => {
      if (!result.marketStatsReceived) {
        result.marketStatsReceived = true;
        result.sampleMessages.marketStats = {
          channel: msg.channel,
          type: msg.type,
          markPrice: msg.market_stats?.mark_price,
          indexPrice: msg.market_stats?.index_price,
          bestAsk: msg.market_stats?.best_ask_price,
          bestBid: msg.market_stats?.best_bid_price,
          symbol: msg.market_stats?.symbol,
        };
        console.log(`  [${tag}] market_stats received: mark=${msg.market_stats?.mark_price} index=${msg.market_stats?.index_price} bid=${msg.market_stats?.best_bid_price} ask=${msg.market_stats?.best_ask_price}`);
      }
    });

    // Wait for messages
    console.log(`  [${tag}] waiting 8s for public channel messages...`);
    await wait(8000);

    await client.destroy();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

async function testPrivateChannels(
  tag: string,
  wsUrl: string,
  signer: SignerClient,
  accountId: number,
  marketId: number,
): Promise<VenueResult> {
  const result = newResult(tag);
  const authProvider = new SignerAuthTokenProvider(signer);

  // First verify auth token generation
  try {
    const token = await authProvider.getToken();
    if (token && token.length > 10) {
      result.authWorks = true;
      console.log(`  [${tag}] auth token generated (${token.length} chars)`);
    } else {
      result.errors.push('auth token empty');
      return result;
    }
  } catch (e) {
    result.errors.push(`auth token failed: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }

  const client = new WsPrivateClient({ url: wsUrl, auth: authProvider, accountId });

  try {
    await client.connect();
    result.wsConnected = true;
    console.log(`  [${tag}] WS connected (auth)`);

    // Subscribe to account orders (private)
    const ordersSub = await client.subscribeAccountOrders(marketId, accountId);
    ordersSub.on('update', (msg: WsAccountOrdersMessage) => {
      if (!result.accountOrdersReceived) {
        result.accountOrdersReceived = true;
        const marketKeys = Object.keys(msg.orders || {});
        result.sampleMessages.accountOrders = {
          channel: msg.channel,
          type: msg.type,
          marketCount: marketKeys.length,
          firstMarket: marketKeys[0],
          orderCount: marketKeys[0] ? msg.orders[marketKeys[0]]?.length : 0,
        };
        console.log(`  [${tag}] account_orders received: ${marketKeys.length} markets, ${marketKeys[0] ? msg.orders[marketKeys[0]]?.length : 0} orders`);
      }
    });

    // Subscribe to account positions (private)
    const posSub = await client.subscribeAccountAllPositions(accountId);
    posSub.on('update', (msg: WsAccountAllPositionsMessage) => {
      if (!result.positionsReceived) {
        result.positionsReceived = true;
        const posKeys = Object.keys(msg.positions || {});
        result.sampleMessages.positions = {
          channel: msg.channel,
          type: msg.type,
          positionCount: posKeys.length,
          markets: posKeys,
        };
        const positions = posKeys.map((k) => {
          const p = msg.positions[k];
          return `${p?.symbol}: ${p?.position || '0'}`;
        });
        console.log(`  [${tag}] positions received: ${posKeys.length} markets [${positions.join(', ')}]`);
      }
    });

    console.log(`  [${tag}] waiting 8s for private channel messages...`);
    await wait(8000);

    await client.destroy();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

async function main() {
  console.log('=== Live WS Smoke Test ===\n');

  const marketId = parseInt(process.env.MARKET_ID || '0', 10);

  // ── Phase 1: Public channels on both venues ───────────────────────────
  console.log(`Phase 1: Public channels (market ${marketId}) on both venues\n`);

  console.log('--- Core (mainnet) ---');
  const coreResult = await testPublicChannels('core', resolveWsUrl(NETWORKS.mainnet), marketId);

  console.log('\n--- Robinhood ---');
  const rhResult = await testPublicChannels('rh', resolveWsUrl(NETWORKS.robinhood), marketId);

  // ── Phase 2: Authenticated private channels ───────────────────────────
  console.log('\nPhase 2: Authenticated private channels\n');

  // Use the credentials from .env (currently set to robinhood)
  const network = process.env.LIGHTER_NETWORK || 'robinhood';
  const privateKey = process.env.API_PRIVATE_KEY!;
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);

  if (privateKey && privateKey.length >= 80) {
    console.log(`--- ${network} (authenticated, account ${accountIndex}) ---`);
    try {
      const signer = new SignerClient({
        network: network as any,
        privateKey,
        accountIndex,
        apiKeyIndex,
      });
      await signer.initialize();
      await signer.ensureWasmClient();
      console.log('  SignerClient initialized');

      const wsUrl = resolveWsUrl(
        network === 'robinhood' ? NETWORKS.robinhood :
        network === 'testnet' ? NETWORKS.testnet :
        network === 'robinhood-testnet' ? NETWORKS['robinhood-testnet'] :
        NETWORKS.mainnet
      );

      const authResult = await testPrivateChannels(network, wsUrl, signer, accountIndex, marketId);

      // Merge into the rh result
      // exactOptionalPropertyTypes: copy only the flags the auth run actually
      // set, so "not attempted" stays distinct from "attempted and failed".
      if (authResult.authWorks !== undefined) rhResult.authWorks = authResult.authWorks;
      if (authResult.accountOrdersReceived !== undefined) {
        rhResult.accountOrdersReceived = authResult.accountOrdersReceived;
      }
      if (authResult.positionsReceived !== undefined) {
        rhResult.positionsReceived = authResult.positionsReceived;
      }
      rhResult.errors.push(...authResult.errors);
      rhResult.sampleMessages = { ...rhResult.sampleMessages, ...authResult.sampleMessages };

      await signer.close();
    } catch (e) {
      rhResult.errors.push(`SignerClient: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    console.log('  No valid API_PRIVATE_KEY in .env — skipping authenticated test');
  }

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n=== Summary ===\n');

  const allResults = [
    { tag: 'Core (mainnet)', result: coreResult },
    { tag: 'Robinhood', result: rhResult },
  ];

  for (const { tag, result } of allResults) {
    const checks = [
      ['WS connected', result.wsConnected],
      ['order_book', result.orderBookReceived],
      ['ticker (BBO)', result.tickerReceived],
      ['market_stats', result.marketStatsReceived],
    ] as Array<[string, boolean]>;

    if (result.authWorks !== undefined) {
      checks.push(['auth token', result.authWorks]);
      checks.push(['account_orders', result.accountOrdersReceived ?? false]);
      checks.push(['positions', result.positionsReceived ?? false]);
    }

    const passed = checks.filter(([, v]) => v).length;
    const total = checks.length;
    const status = passed === total ? 'PASS' : passed > 0 ? 'PARTIAL' : 'FAIL';

    console.log(`${tag}: ${status} (${passed}/${total})`);
    for (const [name, ok] of checks) {
      console.log(`  ${ok ? '\u2713' : '\u2717'} ${name}`);
    }
    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
    console.log();
  }

  // Exit code
  const allOk =
    coreResult.wsConnected && coreResult.orderBookReceived && coreResult.tickerReceived &&
    rhResult.wsConnected && rhResult.orderBookReceived && rhResult.tickerReceived;

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});