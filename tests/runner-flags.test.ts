/**
 * Source-level drift guards for examples/run_mm.ts.
 *
 * The runner's config surface is env vars; the CLI flags are sugar over them
 * (cmd.exe has no inline env-var prefix, so `MM_STRATEGY=grid tsx ...` cannot
 * work as an npm script on Windows). That only holds while the two stay in
 * sync, and nothing at runtime notices when they don't -- a knob with no flag
 * is simply unreachable from the documented launch commands.
 *
 * These parse the source rather than importing it: run_mm.ts calls
 * applyCliFlags() and main() at module scope, so importing it would try to
 * trade.
 */

import * as fs from 'fs';
import * as path from 'path';

const RUNNER = path.join(__dirname, '..', 'examples', 'run_mm.ts');
const SRC = fs.readFileSync(RUNNER, 'utf8');

/** The FLAG_ENV literal, as flag -> env var. */
function flagEnvMap(): Record<string, string> {
  const block = /const FLAG_ENV: Record<string, string> = \{([\s\S]*?)\n\};/.exec(SRC);
  if (!block) throw new Error('FLAG_ENV block not found in run_mm.ts');
  const map: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/^\s*'?([\w-]+)'?:\s*'([\w]+)',/gm)) {
    map[m[1]!] = m[2]!;
  }
  return map;
}

/** Every env var name the runner reads. */
function envVarsRead(): Set<string> {
  const names = new Set<string>();
  for (const m of SRC.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]!);
  for (const m of SRC.matchAll(/process\.env\['([A-Z][A-Z0-9_]*)'\]/g)) names.add(m[1]!);
  return names;
}

/** Knobs a user is expected to tune per run, as opposed to credentials. */
const TUNABLE = /^(MM_|RUN_MINUTES$|MARKET_ID$|LIGHTER_NETWORK$)/;

describe('run_mm.ts CLI flags', () => {
  it('gives every tunable env var a flag', () => {
    const mapped = new Set(Object.values(flagEnvMap()));
    const missing = [...envVarsRead()]
      .filter((v) => TUNABLE.test(v))
      .filter((v) => !mapped.has(v))
      .sort();
    expect(missing).toEqual([]);
  });

  it('documents every flag in the usage text', () => {
    const usage = /const USAGE = `([\s\S]*?)`;/.exec(SRC);
    expect(usage).not.toBeNull();
    const text = usage![1]!;
    // `-s` is the documented short alias for --strategy, listed as `[strategy]`.
    const undocumented = Object.keys(flagEnvMap())
      .filter((f) => f !== 's' && f !== 'strategy')
      .filter((f) => !text.includes(`--${f}`))
      .sort();
    expect(undocumented).toEqual([]);
  });

  it('maps every flag to a real env var name', () => {
    for (const [flag, envVar] of Object.entries(flagEnvMap())) {
      expect(envVar).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(flag).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe('run_mm.ts safety guards', () => {
  it('validates MM_STRATEGY and MM_VENUE from env, not just from flags', () => {
    // A typo in .env used to fall through to a default: `MM_STRATEGY=gird`
    // silently ran Avellaneda-Stoikov, `MM_VENUE=mainet` silently ran on
    // Robinhood. Both trade a model or an account the operator did not pick.
    expect(SRC).toContain('Unknown MM_STRATEGY');
    expect(SRC).toContain('Unknown MM_VENUE');
    expect(SRC).toMatch(/assertKnownSelectors\(\);/);
  });

  it('resolves the single-venue target in exactly one place', () => {
    // Three copies of `venue === 'mainnet' || venue === 'core'` is how the
    // setup path, the disclosure, and the flatten safety net drift apart --
    // and the flatten net picking the wrong venue leaves a position open.
    const decls = SRC.match(/function singleVenueNetworkName\(\)/g) ?? [];
    expect(decls).toHaveLength(1);
    // The raw env fallback is legitimate exactly once: inside the resolver.
    const raw = SRC.match(/process\.env\.MM_VENUE \|\| process\.env\.LIGHTER_NETWORK/g) ?? [];
    expect(raw).toHaveLength(1);
  });

  it('keys the attribution disclosure off network names, not venues', () => {
    // Testnets have no builder account. Mapping them onto a default venue made
    // the banner advertise an integrator the orders never carried.
    expect(SRC).toContain('printAttributionDisclosureForNetworks(...RUN_NETWORKS)');
    expect(SRC).not.toContain('venueForNetwork(singleVenueNetworkName()) ?? ');
  });

  it('still flattens every venue on shutdown', () => {
    expect(SRC).toContain('await flattenAllVenues()');
    expect(SRC).toMatch(/process\.on\('SIGINT'/);
  });

  it('exits before connecting when --print-config is passed', () => {
    const guard = SRC.indexOf('if (PRINT_CONFIG_ONLY)');
    const run = SRC.indexOf('main().catch(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(run);
  });
});
