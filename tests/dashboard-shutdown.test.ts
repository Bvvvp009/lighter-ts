/**
 * The dashboards' end-of-run decision: what is still open, and what to exit with.
 *
 * This is the branch that decides whether a finished run reports success. The
 * dashboards do not flatten on exit — they cancel resting orders and hand any
 * position back to the operator — so "ended flat" and "ended holding
 * inventory" have to be distinguishable by exit code, or a script that chains
 * off a bounded run will treat leftover risk as a clean finish.
 *
 * Reaching the open branch used to require ending a live run with an open
 * position, which is why it stayed unexercised on the dashboards. It is now a
 * pure function over plain data, so both branches are reachable here.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  formatShutdownReport,
  openLegs,
  shutdownExitCode,
  type ShutdownLeg,
} from '../examples/_shutdown';

const flat = (marketId = 1): ShutdownLeg => ({ marketId, position: { sign: 0, size: 0 } });
const long = (marketId = 1, size = 20): ShutdownLeg => ({ marketId, position: { sign: 1, size } });
const short = (marketId = 1, size = 20): ShutdownLeg => ({ marketId, position: { sign: -1, size } });

describe('openLegs', () => {
  it('treats a zero-size position as flat', () => {
    expect(openLegs([flat()])).toEqual([]);
  });

  it('treats an unknown position as flat, not as open', () => {
    // The tracker never heard about this market. Absence of evidence is not
    // evidence of a position, and exiting 1 here would make every quiet run
    // look like it leaked inventory.
    expect(openLegs([{ marketId: 1 }])).toEqual([]);
    expect(openLegs([{ marketId: 1, position: undefined }])).toEqual([]);
  });

  it('reports a leg carrying size regardless of direction', () => {
    expect(openLegs([long()])).toHaveLength(1);
    expect(openLegs([short()])).toHaveLength(1);
  });

  it('reports a stale sign with no size as flat', () => {
    // size is a magnitude; sign can lag it through a close.
    expect(openLegs([{ marketId: 1, position: { sign: 1, size: 0 } }])).toEqual([]);
  });

  it('does not treat dust as flat', () => {
    // Conservative on purpose: any residual size is the operator's to clear.
    expect(openLegs([{ marketId: 1, position: { sign: 1, size: 1 } }])).toHaveLength(1);
  });
});

describe('shutdownExitCode', () => {
  it('exits 0 only when every leg is flat', () => {
    expect(shutdownExitCode([flat()])).toBe(0);
    expect(shutdownExitCode([])).toBe(0);
    expect(
      shutdownExitCode([
        { venue: 'core', marketId: 1, position: { sign: 0, size: 0 } },
        { venue: 'rh', marketId: 1, position: { sign: 0, size: 0 } },
      ]),
    ).toBe(0);
  });

  it('exits 1 when any single leg is open', () => {
    expect(shutdownExitCode([long()])).toBe(1);
  });

  it('exits 1 when one venue of two is open', () => {
    // The case the cross-venue run exists to catch: a hedge that filled on one
    // side only is naked directional risk, not a flat book.
    expect(
      shutdownExitCode([
        { venue: 'core', marketId: 1, position: { sign: 1, size: 20 } },
        { venue: 'rh', marketId: 1, position: { sign: 0, size: 0 } },
      ]),
    ).toBe(1);
  });
});

describe('formatShutdownReport — single venue', () => {
  it('says flat and nothing else', () => {
    expect(formatShutdownReport('Final', [flat()])).toEqual(['Final: flat.']);
  });

  it('names the market, direction and size when open', () => {
    const lines = formatShutdownReport('Final', [long(1, 20)]);
    expect(lines[0]).toBe('Final: WARNING position still open mkt=1 sign=1 size=20.');
    expect(lines[1]).toContain('npx tsx examples/close_all_positions.ts');
  });

  it('carries the shutdown reason through', () => {
    expect(formatShutdownReport('Strategy stopped', [flat()])).toEqual([
      'Strategy stopped: flat.',
    ]);
  });

  it('gives a single close command, not a per-venue one', () => {
    const lines = formatShutdownReport('Final', [short()]);
    expect(lines.join('\n')).toContain('Close it before the next run');
    expect(lines.join('\n')).not.toContain('once for each venue');
  });
});

describe('formatShutdownReport — cross venue', () => {
  const legs = (core: ShutdownLeg['position'], rh: ShutdownLeg['position']): ShutdownLeg[] => [
    { venue: 'core', marketId: 1, position: core },
    { venue: 'rh', marketId: 1, position: rh },
  ];

  it('says all venues flat when neither holds inventory', () => {
    expect(formatShutdownReport('Final', legs({ sign: 0, size: 0 }, { sign: 0, size: 0 }))).toEqual([
      'Final: all venues flat.',
    ]);
  });

  it('names only the venue that is actually open', () => {
    const lines = formatShutdownReport('Final', legs({ sign: 1, size: 20 }, { sign: 0, size: 0 }));
    expect(lines[0]).toBe('Final: WARNING core position still open mkt=1 sign=1 size=20.');
    expect(lines.join('\n')).not.toContain('rh position still open');
  });

  it('lists both venues when both are open', () => {
    const lines = formatShutdownReport('Final', legs({ sign: 1, size: 20 }, { sign: -1, size: 20 }));
    expect(lines[0]).toContain('core position still open');
    expect(lines[1]).toContain('rh position still open');
    expect(lines[1]).toContain('sign=-1');
  });

  it('tells the operator the close command is per venue', () => {
    // close_all_positions.ts reads one venue's credentials from env, so two
    // open venues need two invocations, not one.
    const hint = formatShutdownReport('Final', legs({ sign: 1, size: 20 }, { sign: 1, size: 20 }))
      .join('\n');
    expect(hint).toContain('once for each venue listed above');
    expect(hint).toContain("that venue's LIGHTER_NETWORK");
  });
});

describe('every run that ends without flattening uses this decision', () => {
  // Drift guard. The point of extracting it was to stop five copies from
  // diverging; a reintroduced inline `process.exit(openPos ? 1 : 0)` would
  // pass every test above while being untested itself.
  //
  // run_mm.ts is deliberately absent: it flattens through a REST-verified
  // safety net instead of handing the position back, so it does not share
  // this decision.
  const CALLERS = [
    'mm_grid_dashboard.ts',
    'mm_arb_dashboard.ts',
    'mm_cross_venue_dashboard.ts',
    'run_arb_live.ts',
    'run_perp_mm_live.ts',
  ];

  for (const name of CALLERS) {
    it(`${name} exits through shutdownExitCode`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'examples', name), 'utf8');
      expect(src).toContain("from './_shutdown'");
      expect(src).toContain('process.exit(shutdownExitCode(legs))');
      // The label differs per caller ("Final", "Shutdown"); the call does not.
      expect(src).toMatch(/formatShutdownReport\([^)]+, legs\)/);
      // No caller may keep a second, inline copy of the same branch.
      expect(src).not.toContain('process.exit(openPos ? 1 : 0)');
    });
  }
});
