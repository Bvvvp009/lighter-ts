import {
  BUILDER_ACCOUNTS,
  DEFAULT_MAKER_FEE_MILLIONTHS,
  DEFAULT_TAKER_FEE_MILLIONTHS,
  MAX_MAKER_FEE_MILLIONTHS,
  MAX_TAKER_FEE_MILLIONTHS,
  REGISTRY_CHECKSUM,
  computeRegistryChecksum,
  verifyRegistryIntegrity,
  builderAccountFor,
  normalizeNetwork,
  bpsToMillionths,
  millionthsToBps,
} from '../src/attribution/builder-registry';
import {
  AttributionFeeCapError,
  assertFeeWithinCap,
  formatAttributionDisclosure,
  formatSupportNotice,
  integratorFields,
  resolveAttribution,
  resolveAttributionFromEnv,
  type EnvLike,
} from '../src/attribution/policy';

describe('builder registry', () => {
  it('checksum matches the committed constants', () => {
    // Guards against a half-edit: changing an account index or fee policy
    // without updating REGISTRY_CHECKSUM.
    expect(computeRegistryChecksum()).toBe(REGISTRY_CHECKSUM);
    expect(() => verifyRegistryIntegrity()).not.toThrow();
  });

  it('registry is frozen at both levels', () => {
    expect(Object.isFrozen(BUILDER_ACCOUNTS)).toBe(true);
    expect(Object.isFrozen(BUILDER_ACCOUNTS.mainnet)).toBe(true);
    expect(() => {
      (BUILDER_ACCOUNTS as any).mainnet = { accountIndex: 1, label: 'x' };
    }).toThrow();
    expect(BUILDER_ACCOUNTS.mainnet.accountIndex).toBe(692603);
  });

  it('has distinct builder accounts for Core and Robinhood', () => {
    expect(BUILDER_ACCOUNTS.mainnet.accountIndex).toBe(692603);
    expect(BUILDER_ACCOUNTS.robinhood.accountIndex).toBe(76);
    expect(BUILDER_ACCOUNTS.mainnet.accountIndex).not.toBe(
      BUILDER_ACCOUNTS.robinhood.accountIndex,
    );
  });

  it('normalizes venue aliases', () => {
    expect(normalizeNetwork('core')).toBe('mainnet');
    expect(normalizeNetwork('MAINNET')).toBe('mainnet');
    expect(normalizeNetwork('rh')).toBe('robinhood');
    expect(normalizeNetwork('robinhood')).toBe('robinhood');
    expect(normalizeNetwork('rh-testnet')).toBe('robinhood-testnet');
    expect(normalizeNetwork('nope')).toBeUndefined();
  });

  it('returns no builder account for venues without one', () => {
    expect(builderAccountFor('testnet')).toBeUndefined();
    expect(builderAccountFor('robinhood-testnet')).toBeUndefined();
    expect(builderAccountFor('unknown-net')).toBeUndefined();
    expect(builderAccountFor('mainnet')?.accountIndex).toBe(692603);
  });

  it('converts between bps and millionths', () => {
    expect(bpsToMillionths(2)).toBe(200);
    expect(bpsToMillionths(0.5)).toBe(50);
    expect(millionthsToBps(200)).toBe(2);
    expect(millionthsToBps(50)).toBe(0.5);
  });
});

describe('fee caps', () => {
  it('accepts the shipped defaults', () => {
    expect(() => assertFeeWithinCap('taker', DEFAULT_TAKER_FEE_MILLIONTHS)).not.toThrow();
    expect(() => assertFeeWithinCap('maker', DEFAULT_MAKER_FEE_MILLIONTHS)).not.toThrow();
  });

  it('rejects fees above the SDK ceiling instead of clamping', () => {
    expect(() => assertFeeWithinCap('taker', MAX_TAKER_FEE_MILLIONTHS + 1)).toThrow(
      AttributionFeeCapError,
    );
    expect(() => assertFeeWithinCap('maker', MAX_MAKER_FEE_MILLIONTHS + 1)).toThrow(
      AttributionFeeCapError,
    );
  });

  it('rejects a bps/millionths unit mix-up', () => {
    // 20000 millionths = 200 bps - the classic typo this cap exists to catch.
    expect(() => assertFeeWithinCap('taker', 20000)).toThrow(/exceeds/i);
  });

  it('rejects negative and non-finite fees', () => {
    expect(() => assertFeeWithinCap('taker', -1)).toThrow(AttributionFeeCapError);
    expect(() => assertFeeWithinCap('maker', NaN)).toThrow(AttributionFeeCapError);
  });

  it('surfaces the cap through resolveAttribution', () => {
    expect(() =>
      resolveAttribution({ network: 'mainnet', takerFeeMillionths: 999999 }),
    ).toThrow(AttributionFeeCapError);
  });
});

describe('resolveAttribution', () => {
  it('defaults to the builder account for mainnet', () => {
    const d = resolveAttribution({ network: 'mainnet' });
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(692603);
    expect(d.takerFee).toBe(DEFAULT_TAKER_FEE_MILLIONTHS);
    expect(d.makerFee).toBe(DEFAULT_MAKER_FEE_MILLIONTHS);
    expect(d.source).toBe('builder');
  });

  it('defaults to the builder account for robinhood', () => {
    const d = resolveAttribution({ network: 'robinhood' });
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(76);
    expect(d.source).toBe('builder');
  });

  it('honours an explicit opt-out', () => {
    const d = resolveAttribution({ network: 'mainnet', disabled: true });
    expect(d.enabled).toBe(false);
    expect(d.accountIndex).toBe(0);
    expect(d.takerFee).toBe(0);
    expect(d.makerFee).toBe(0);
    expect(d.source).toBe('disabled');
  });

  it('treats override index 0 as opt-out', () => {
    const d = resolveAttribution({ network: 'mainnet', overrideAccountIndex: 0 });
    expect(d.enabled).toBe(false);
    expect(d.source).toBe('disabled');
  });

  it('routes to a user-supplied integrator account', () => {
    const d = resolveAttribution({ network: 'mainnet', overrideAccountIndex: 12345 });
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(12345);
    expect(d.source).toBe('user-override');
  });

  it('rejects a malformed override index', () => {
    expect(() => resolveAttribution({ network: 'mainnet', overrideAccountIndex: -5 })).toThrow();
    expect(() => resolveAttribution({ network: 'mainnet', overrideAccountIndex: 1.5 })).toThrow();
  });

  it('reports unregistered venues without throwing', () => {
    const d = resolveAttribution({ network: 'testnet' });
    expect(d.enabled).toBe(false);
    expect(d.source).toBe('unregistered');
  });
});

describe('resolveAttributionFromEnv', () => {
  const base: EnvLike = {};

  it('defaults to attribution on', () => {
    const d = resolveAttributionFromEnv('mainnet', base);
    expect(d.enabled).toBe(true);
    expect(d.accountIndex).toBe(692603);
  });

  it.each(['0', 'false', 'off', 'no', 'OFF', 'False'])(
    'BUILDER_ATTRIBUTION=%s disables attribution',
    (flag) => {
      const d = resolveAttributionFromEnv('mainnet', { BUILDER_ATTRIBUTION: flag });
      expect(d.enabled).toBe(false);
      expect(d.accountIndex).toBe(0);
    },
  );

  it.each(['1', 'true', 'on', 'yes'])('BUILDER_ATTRIBUTION=%s keeps it on', (flag) => {
    const d = resolveAttributionFromEnv('mainnet', { BUILDER_ATTRIBUTION: flag });
    expect(d.enabled).toBe(true);
  });

  it('INTEGRATOR_ACCOUNT_INDEX=0 disables attribution', () => {
    const d = resolveAttributionFromEnv('mainnet', { INTEGRATOR_ACCOUNT_INDEX: '0' });
    expect(d.enabled).toBe(false);
  });

  it('INTEGRATOR_ACCOUNT_INDEX overrides the builder account', () => {
    const d = resolveAttributionFromEnv('mainnet', { INTEGRATOR_ACCOUNT_INDEX: '999' });
    expect(d.accountIndex).toBe(999);
    expect(d.source).toBe('user-override');
  });

  it('reads fees in millionths', () => {
    const d = resolveAttributionFromEnv('mainnet', {
      INTEGRATOR_TAKER_FEE: '300',
      INTEGRATOR_MAKER_FEE: '100',
    });
    expect(d.takerFee).toBe(300);
    expect(d.makerFee).toBe(100);
  });

  it('reads fees in bps and converts', () => {
    const d = resolveAttributionFromEnv('mainnet', {
      INTEGRATOR_TAKER_FEE_BPS: '3',
      INTEGRATOR_MAKER_FEE_BPS: '1',
    });
    expect(d.takerFee).toBe(300);
    expect(d.makerFee).toBe(100);
  });

  it('prefers the millionths var over the bps var', () => {
    const d = resolveAttributionFromEnv('mainnet', {
      INTEGRATOR_TAKER_FEE: '250',
      INTEGRATOR_TAKER_FEE_BPS: '9',
    });
    expect(d.takerFee).toBe(250);
  });

  it('rejects a non-numeric account index', () => {
    expect(() => resolveAttributionFromEnv('mainnet', { INTEGRATOR_ACCOUNT_INDEX: 'abc' })).toThrow(
      /INTEGRATOR_ACCOUNT_INDEX/,
    );
  });

  it('ignores blank values', () => {
    const d = resolveAttributionFromEnv('mainnet', {
      INTEGRATOR_ACCOUNT_INDEX: '  ',
      INTEGRATOR_TAKER_FEE: '',
    });
    expect(d.accountIndex).toBe(692603);
    expect(d.takerFee).toBe(DEFAULT_TAKER_FEE_MILLIONTHS);
  });
});

describe('integratorFields', () => {
  it('emits the builder index when enabled', () => {
    const f = integratorFields(resolveAttribution({ network: 'robinhood' }));
    expect(f).toEqual({
      integratorAccountIndex: 76,
      integratorTakerFee: DEFAULT_TAKER_FEE_MILLIONTHS,
      integratorMakerFee: DEFAULT_MAKER_FEE_MILLIONTHS,
    });
  });

  it('emits all-zero fields when disabled', () => {
    const f = integratorFields(resolveAttribution({ network: 'mainnet', disabled: true }));
    expect(f).toEqual({
      integratorAccountIndex: 0,
      integratorTakerFee: 0,
      integratorMakerFee: 0,
    });
  });
});

describe('disclosure and support notice', () => {
  it('discloses the account index and exact fee rates when enabled', () => {
    const text = formatAttributionDisclosure(resolveAttribution({ network: 'mainnet' }));
    expect(text).toContain('692603');
    expect(text).toContain('0.5 bps');
    expect(text).toContain('2 bps');
    // The opt-out must always be discoverable from the banner.
    expect(text).toContain('BUILDER_ATTRIBUTION=off');
  });

  it('states plainly when attribution is off', () => {
    const text = formatAttributionDisclosure(
      resolveAttribution({ network: 'mainnet', disabled: true }),
    );
    expect(text).toContain('none');
    expect(text).toContain('no fee attribution');
  });

  it('thanks supporters at the end of a run', () => {
    const text = formatSupportNotice(resolveAttribution({ network: 'mainnet' }));
    expect(text).toMatch(/thank you/i);
    expect(text).toContain('692603');
  });

  it('politely asks opted-out users to support development', () => {
    const text = formatSupportNotice(resolveAttribution({ network: 'mainnet', disabled: true }));
    expect(text).toMatch(/support/i);
    expect(text).toContain('BUILDER_ATTRIBUTION=on');
    // Ethics: the ask must mention that approval is explicit and revocable.
    expect(text).toMatch(/revoke/i);
  });

  it('acknowledges users running their own integrator', () => {
    const text = formatSupportNotice(
      resolveAttribution({ network: 'mainnet', overrideAccountIndex: 4242 }),
    );
    expect(text).toContain('4242');
    expect(text).toMatch(/your own integrator/i);
  });
});
