/**
 * Layer-1 attribution disclosure tests (examples/_attribution.ts).
 *
 * The funding model is "attribution is disclosed and optional, never covert",
 * so the banner is not cosmetic -- it is the promise. These tests pin that the
 * printed disclosure matches what orders actually carry.
 *
 * Regression: the runner used to map a network to a `Venue` and fall back to
 * 'robinhood' when the map missed. Testnets have no builder account, so a
 * testnet run printed "Integrator account : #76" while its orders carried no
 * attribution at all -- the disclosure advertised a fee the user was not
 * paying, on an account that was never approved.
 */

import {
  attributionForNetwork,
  printAttributionDisclosureForNetworks,
  printSupportNoticeForNetwork,
} from '../examples/_attribution';
import { BUILDER_ACCOUNTS } from '../src/attribution/builder-registry';

const ATTRIBUTION_VARS = [
  'BUILDER_ATTRIBUTION',
  'INTEGRATOR_ACCOUNT_INDEX',
  'INTEGRATOR_MAKER_FEE',
  'INTEGRATOR_TAKER_FEE',
  'INTEGRATOR_MAKER_FEE_BPS',
  'INTEGRATOR_TAKER_FEE_BPS',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ATTRIBUTION_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ATTRIBUTION_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Capture everything the disclosure printers write. */
function capture(fn: () => void): string {
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join('\n');
}

describe('attributionForNetwork', () => {
  it('resolves the Core builder account on mainnet', () => {
    const d = attributionForNetwork('mainnet');
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(BUILDER_ACCOUNTS.mainnet.accountIndex);
  });

  it('resolves the Robinhood builder account on robinhood', () => {
    const d = attributionForNetwork('robinhood');
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(BUILDER_ACCOUNTS.robinhood.accountIndex);
  });

  it('reports testnets as unregistered rather than borrowing a venue', () => {
    for (const net of ['testnet', 'robinhood-testnet']) {
      const d = attributionForNetwork(net);
      expect(d.enabled).toBe(false);
      expect(d.source).toBe('unregistered');
      expect(d.accountIndex).toBe(0);
    }
  });

  it('honours BUILDER_ATTRIBUTION=off on every network', () => {
    process.env.BUILDER_ATTRIBUTION = 'off';
    for (const net of ['mainnet', 'robinhood', 'testnet']) {
      expect(attributionForNetwork(net).enabled).toBe(false);
    }
  });

  it('routes to the user own integrator when they set one', () => {
    process.env.INTEGRATOR_ACCOUNT_INDEX = '123456';
    const d = attributionForNetwork('mainnet');
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(123456);
    expect(d.source).toBe('user-override');
  });

  it('re-reads env on every call so opt-out is never cached away', () => {
    expect(attributionForNetwork('mainnet').enabled).toBe(true);
    process.env.BUILDER_ATTRIBUTION = 'off';
    expect(attributionForNetwork('mainnet').enabled).toBe(false);
    delete process.env.BUILDER_ATTRIBUTION;
    expect(attributionForNetwork('mainnet').enabled).toBe(true);
  });
});

describe('printAttributionDisclosureForNetworks', () => {
  it('names the integrator and both fee rates when attribution is on', () => {
    const out = capture(() => printAttributionDisclosureForNetworks('mainnet'));
    expect(out).toContain(`#${BUILDER_ACCOUNTS.mainnet.accountIndex}`);
    expect(out).toMatch(/maker .* bps/);
    expect(out).toMatch(/taker .* bps/);
  });

  it('never advertises a builder account on an unregistered network', () => {
    // The regression. A testnet banner must not name ANY builder index.
    const out = capture(() => printAttributionDisclosureForNetworks('testnet'));
    for (const acct of Object.values(BUILDER_ACCOUNTS)) {
      expect(out).not.toContain(`#${acct.accountIndex}`);
    }
    expect(out).toContain('no fee attribution');
  });

  it('says so plainly when the user opted out', () => {
    process.env.BUILDER_ATTRIBUTION = 'off';
    const out = capture(() => printAttributionDisclosureForNetworks('mainnet'));
    expect(out).toContain('none');
    expect(out).toContain('no fee attribution');
    expect(out).not.toContain(`#${BUILDER_ACCOUNTS.mainnet.accountIndex}`);
  });

  it('prints one banner per venue for a cross-venue run', () => {
    const out = capture(() => printAttributionDisclosureForNetworks('mainnet', 'robinhood'));
    expect(out).toContain(`#${BUILDER_ACCOUNTS.mainnet.accountIndex}`);
    expect(out).toContain(`#${BUILDER_ACCOUNTS.robinhood.accountIndex}`);
  });

  it('always prints something -- disclosure is never silent', () => {
    for (const net of ['mainnet', 'robinhood', 'testnet', 'nonsense']) {
      expect(capture(() => printAttributionDisclosureForNetworks(net)).trim()).not.toBe('');
    }
  });

  it('deduplicates repeated networks', () => {
    const out = capture(() => printAttributionDisclosureForNetworks('mainnet', 'mainnet'));
    const banners = out.split('--- Partner attribution').length - 1;
    expect(banners).toBe(1);
  });
});

describe('printSupportNoticeForNetwork', () => {
  it('thanks the user when the run was attributed to the builder', () => {
    const out = capture(() => printSupportNoticeForNetwork('mainnet'));
    expect(out).toContain('Thank you');
  });

  it('asks for support -- without thanking -- when attribution was off', () => {
    process.env.BUILDER_ATTRIBUTION = 'off';
    const out = capture(() => printSupportNoticeForNetwork('mainnet'));
    expect(out).toContain('BUILDER_ATTRIBUTION=on');
    expect(out).not.toContain('Thank you for supporting');
  });

  it('does not thank the user for a testnet run that paid nothing', () => {
    const out = capture(() => printSupportNoticeForNetwork('testnet'));
    expect(out).not.toContain('Thank you for supporting');
  });

  it('never throws on the shutdown path', () => {
    process.env.INTEGRATOR_ACCOUNT_INDEX = 'not-a-number';
    expect(() => capture(() => printSupportNoticeForNetwork('mainnet'))).not.toThrow();
  });
});
