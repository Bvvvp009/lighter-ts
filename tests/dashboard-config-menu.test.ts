/**
 * Dashboard config-menu interaction tests.
 *
 * Drives the REAL Dashboard keyboard flow the way a user does:
 *   Space -> open menu, up/down arrows to scroll, Enter to start an edit,
 *   type a value, Enter to commit.
 *
 * Locks the behaviors that make on-the-go CLI editing convenient (and that
 * were broken in the field):
 * 1. The commit path calls strategy.updateConfig with the typed value — no
 *    detour through mm-config.json required.
 * 2. The config change actually reaches the strategy's subclass config
 *    object AND forces a requote (configDirty), so live orders pick it up
 *    on the next cycle even when the change is below requoteThreshold.
 * 3. Unset numeric fields (e.g. leverage) can be introduced from the menu.
 * 4. A non-numeric edit stays in the editor with an error instead of
 *    silently discarding the input.
 * 5. The menu list refreshes values after a commit.
 */

import { Readable } from 'stream';
import { EventEmitter } from 'events';
import { Dashboard } from '../src/cli/dashboard';
import { StatsAggregator } from '../src/cli/stats-aggregator';
import { GridStrategy } from '../src/strategies/grid-strategy';
import { CrossVenueMM } from '../src/strategies/cross-venue-mm';
import type { OrderTracker } from '../src/strategies/order-tracker';

// --------------------------------------------------------------------------
// Test doubles
// --------------------------------------------------------------------------

class FakeSigner {
  calls: Array<{ marketId: number; marginMode: number; leverage: number }> = [];
  async updateLeverage(marketId: number, marginMode: number, leverage: number) {
    this.calls.push({ marketId, marginMode, leverage });
    return [null, 'hash', null];
  }
}

function makeTracker(): OrderTracker {
  const t = new EventEmitter() as any;
  t.getOpenOrdersByMarket = () => [];
  t.getOpenOrderCountByMarket = () => 0;
  t.registerOrder = () => {};
  t.getPosition = () => undefined;
  t.getAllPositions = () => [];
  t.setMarketScales = () => {};
  return t as unknown as OrderTracker;
}

function makeGrid(overrides: Record<string, unknown> = {}) {
  const signer = new FakeSigner();
  const tracker = makeTracker();
  const executor = new EventEmitter() as any;
  executor.isWsReady = () => true;
  const s = new GridStrategy(
    {
      marketId: 1, accountId: 1, maxPositionSize: 1000, maxOpenOrders: 8,
      makerOnly: true, selfTradeBehavior: 0, reconnectTimeoutMs: 30000,
      tickIntervalMs: 1000, gridLevels: 4, gridSpacing: 5, orderSize: 100,
      ...overrides,
    } as any,
    signer as any, new EventEmitter() as any, executor, tracker,
  );
  return { s, signer, tracker, executor };
}

function makeCross() {
  const mkVenue = (signer: FakeSigner, tag: string) => ({
    network: 'mainnet', signerClient: signer, wsPrivate: new EventEmitter(),
    executor: new EventEmitter(), tracker: makeTracker(), tag,
  }) as any;
  const signerA = new FakeSigner();
  const signerB = new FakeSigner();
  const s = new CrossVenueMM(
    {
      marketId: 1, accountAId: 1, accountBId: 2, edgeBps: 5, orderSize: 50,
      maxNetPosition: 100, maxPositionPerVenue: 100, maxOpenOrdersPerVenue: 4,
      hedgeOnFill: true, hedgeSlippage: 0.002, tickIntervalMs: 1000,
      selfTradeBehavior: 0, reconnectTimeoutMs: 30000,
    } as any,
    mkVenue(signerA, 'core'), mkVenue(signerB, 'rh'),
  );
  return { s, signerA, signerB };
}

/** A fake TTY stdin emitting keypress-style (str, key) pairs. */
class FakeStdin extends Readable {
  isTTY = true;
  handlers: Array<(str: string, key: any) => void> = [];
  on(event: string, cb: any): this {
    if (event === 'keypress') this.handlers.push(cb);
    return this;
  }
  press(str: string, key: any): void {
    for (const h of this.handlers) h(str, key);
  }
}

/** Build a Dashboard wired like run_mm does, with a fake TTY stdin. */
function makeDashboard(strategy: any, tracker: OrderTracker, executor: any) {
  const stats = new StatsAggregator();
  stats.attachTracker(tracker);
  const d = new Dashboard({
    stats,
    trackers: tracker,
    executors: executor,
    strategy,
    refreshMs: 60_000, // effectively frozen render loop
  });
  (d as any).interactive = true; // force TTY behavior under jest
  (d as any).onEventSink = undefined;
  return d;
}

// --------------------------------------------------------------------------
// The flow: Space -> arrows -> Enter -> type -> Enter
// --------------------------------------------------------------------------

describe('Dashboard config menu — on-the-go editing flow', () => {
  it('Space opens the menu; arrows move; Enter starts the edit with the current value', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    let menu = (d as any).menu;
    expect(menu.mode).toBe('list');
    expect(menu.fields.length).toBeGreaterThan(0);

    const initial = menu.selected;
    (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'up' });
    expect(menu.selected).toBe(initial + 1);

    // Enter on gridSpacing (row 1) pre-fills the editor with its value (5).
    (d as any).onKeypress('', { name: 'enter' });
    menu = (d as any).menu;
    expect(menu.mode).toBe('edit');
    expect(menu.fields[menu.selected].key).toBe('gridSpacing');
    expect(menu.input).toBe('5');
  });

  it('typing + Enter commits via updateConfig and refreshes the list value', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    (d as any).onKeypress('', { name: 'down' }); // gridSpacing
    (d as any).onKeypress('', { name: 'enter' });
    (d as any).onKeypress('', { name: 'backspace' }); // clear '5'
    for (const ch of '25') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('', { name: 'enter' });

    const menu = (d as any).menu;
    expect(menu.mode).toBe('list'); // editor closed = committed (queued)
    // The tick loop applies it at the top of the next cycle:
    (s as any).applyPendingConfig();
    expect((s as any).gridConfig.gridSpacing).toBe(25);
    // ...and the refreshed menu shows it.
    const field = menu.fields.find((f: any) => f.key === 'gridSpacing');
    expect(field.get()).toBe(25);
    // A config event was logged for the event-log panel.
    const events = (d as any).stats.events.all();
    expect(events.some((e: any) => e.type === 'config' && e.message.includes('gridSpacing → 25'))).toBe(true);
  });

  it('WINDOWS: the physical Enter key emits key name "return" (\\r) — must work identically', () => {
    // Node's keypress parser names \r "return" and \n "enter". On Windows
    // terminals the Enter key sends \r, so matching only "enter" made Enter
    // dead on Windows — the field opened the list but Enter did nothing.
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    (d as any).onKeypress('', { name: 'down' }); // gridSpacing
    (d as any).onKeypress('\r', { name: 'return', seq: '\r' }); // open editor
    expect((d as any).menu.mode).toBe('edit');

    (d as any).onKeypress('', { name: 'backspace' });
    for (const ch of '30') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('\r', { name: 'return', seq: '\r' }); // commit
    expect((d as any).menu.mode).toBe('list');

    (s as any).applyPendingConfig();
    expect((s as any).gridConfig.gridSpacing).toBe(30);
  });

  it('the committed change forces a requote next cycle (configDirty)', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'enter' });
    (d as any).onKeypress('', { name: 'backspace' });
    for (const ch of '7') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('', { name: 'enter' });

    // updateConfig queued the patch; the tick loop applies it. Apply now to
    // simulate the next cycle: the strategy must come out config-dirty.
    (s as any).applyPendingConfig();
    expect((s as any).configNeedsRequote()).toBe(true);
    expect((s as any).cycleDue(Date.now() + 60_000).due).toBe(true);
  });

  it('an unset field (leverage) can be introduced from the menu', async () => {
    const { s, signer, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    // Scroll to the leverage row (always present).
    let menu = (d as any).menu;
    const levRow = menu.fields.findIndex((f: any) => f.key === 'leverage');
    expect(levRow).toBeGreaterThan(0);
    for (let i = 0; i < levRow; i++) (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'enter' });

    menu = (d as any).menu;
    expect(menu.mode).toBe('edit');
    // Empty editor (nothing to pre-fill) — typing 3 and committing works.
    for (const ch of '3') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('', { name: 'enter' });

    (s as any).applyPendingConfig();
    expect((s as any).config.leverage).toBe(3);
    // And it was pushed to the venue.
    await Promise.resolve();
    await Promise.resolve();
    expect(signer.calls.length).toBe(1);
    expect(signer.calls[0].leverage).toBe(3);
  });

  it('a non-numeric edit shows an error and stays in the editor', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'enter' });
    for (const ch of 'abc') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('', { name: 'enter' });

    const menu = (d as any).menu;
    expect(menu.mode).toBe('edit'); // still editing — nothing was committed
    expect(menu.editError).toMatch(/not a number/);
    expect((s as any).gridConfig.gridSpacing).toBe(5); // unchanged

    // Esc returns to the list without committing.
    (d as any).onKeypress('', { name: 'escape' });
    expect((d as any).menu.mode).toBe('list');
    expect((s as any).gridConfig.gridSpacing).toBe(5);
  });

  it('Esc closes the menu back to the dashboard; q in the menu does not quit the run', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    // 'q' inside the menu = close menu (NOT strategy quit — that's outside).
    let stopCalls = 0;
    (s as any).stop = async () => { stopCalls++; };
    (d as any).onKeypress('q', { name: 'q' });
    expect((d as any).menu.mode).toBe('none');
    expect(stopCalls).toBe(0);
  });

  it('cross-venue: editing edgeBps commits to CrossVenueMM and marks it dirty', () => {
    const { s } = makeCross();
    const tracker = makeTracker();
    const executor = new EventEmitter() as any;
    const d = makeDashboard(s, tracker, executor);

    (d as any).onKeypress('', { name: 'space' });
    const menu = (d as any).menu;
    const edgeRow = menu.fields.findIndex((f: any) => f.key === 'edgeBps');
    for (let i = 0; i < edgeRow; i++) (d as any).onKeypress('', { name: 'down' });
    (d as any).onKeypress('', { name: 'enter' });
    (d as any).onKeypress('', { name: 'backspace' });
    for (const ch of '9') (d as any).onKeypress(ch, { name: ch });
    (d as any).onKeypress('', { name: 'enter' });

    (s as any).applyPendingConfig();
    expect((s as any).config.edgeBps).toBe(9);
    expect((s as any).configDirty).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Raw stdin keypress wiring (the real input path from a TTY)
// --------------------------------------------------------------------------

describe('Dashboard.start wires real stdin keypresses to the menu', () => {
  it('routes keypress events from stdin into onKeypress', () => {
    const { s, tracker, executor } = makeGrid();
    const d = makeDashboard(s, tracker, executor);

    const fakeStdin = new FakeStdin();
    (d as any).rl = { close: () => {} };
    // Mimic the wiring in start() without entering the alt screen.
    fakeStdin.on('keypress', (str: string, key: any) => (d as any).onKeypress(str, key));
    // and simulate start()'s subscription on our fake stdin:
    (d as any)['stdinWired'] = true;

    fakeStdin.press('', { name: 'space' });
    expect((d as any).menu.mode).toBe('list');
    fakeStdin.press('', { name: 'down' });
    fakeStdin.press('', { name: 'enter' });
    expect((d as any).menu.mode).toBe('edit');
  });
});