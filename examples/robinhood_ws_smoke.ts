/**
 * Robinhood read-only WebSocket smoke test (self-terminating).
 *
 * Connects to the Robinhood read-only stream, subscribes to an order book,
 * prints a few messages, and exits. The read-only stream (?readonly=true) is
 * for restricted regions. No key or auth needed.
 *
 *   LIGHTER_NETWORK=robinhood WS_READONLY=true npx tsx examples/robinhood_ws_smoke.ts
 */

import { WsClient, getNetwork, resolveNetworkFromEnv, resolveWsUrl } from '../src';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const network = process.env['LIGHTER_NETWORK'] ? resolveNetworkFromEnv() : getNetwork('robinhood');
  const readonly = (process.env['WS_READONLY'] ?? 'true').toLowerCase() === 'true';
  const wsUrl = resolveWsUrl(network, { readonly });
  console.log(`Connecting to ${wsUrl} (network=${network.name}, chain_id=${network.chainId}, readonly=${readonly})`);

  let count = 0;
  let done = false;
  const finish = (reason: string) => {
    if (done) return;
    done = true;
    console.log(`\nfinishing: ${reason} (messages received: ${count})`);
    try { ws.disconnect(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 200);
  };

  const ws = new WsClient({
    url: wsUrl,
    onOpen: () => {
      console.log('✅ WS open');
      ws.send({ type: 'subscribe', channel: 'order_book/0' });
      console.log('subscribed: order_book/0');
    },
    onMessage: (m: any) => {
      count++;
      console.log(`msg#${count}:`, JSON.stringify(m).slice(0, 220));
      if (count >= 3) finish('received 3 messages');
    },
    onError: (e: any) => console.log('WS error:', e?.message ?? String(e)),
    onClose: () => console.log('WS closed'),
    reconnectInterval: 5000,
    maxReconnectAttempts: 2,
  });

  try {
    await ws.connect();
  } catch (e: any) {
    console.error('connect failed:', e?.message ?? e);
    process.exit(1);
  }
  setTimeout(() => finish('6s timeout'), 6000);
}

main().catch((e) => {
  console.error('smoke failed:', e);
  process.exit(1);
});

export {};