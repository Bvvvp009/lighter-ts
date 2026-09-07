import {
  MissingCredentialError,
  assertAccountIndex,
  assertApiPrivateKey,
  assertEthPrivateKey,
} from '../src/attribution/credentials';

const VALID_API_KEY = 'a'.repeat(80);
const VALID_ETH_KEY = 'b'.repeat(64);

describe('assertApiPrivateKey', () => {
  it('accepts an 80-char hex key and normalises it', () => {
    expect(assertApiPrivateKey(VALID_API_KEY)).toBe(VALID_API_KEY);
    expect(assertApiPrivateKey(`0x${VALID_API_KEY.toUpperCase()}`)).toBe(VALID_API_KEY);
    expect(assertApiPrivateKey(`  ${VALID_API_KEY}  `)).toBe(VALID_API_KEY);
  });

  it.each([undefined, null, '', '   '])('rejects empty value %p', (v) => {
    expect(() => assertApiPrivateKey(v as any)).toThrow(MissingCredentialError);
  });

  it('names the env var on the error so it can be handled programmatically', () => {
    try {
      assertApiPrivateKey(undefined, { envVar: 'MM_API_KEY' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MissingCredentialError);
      expect((e as MissingCredentialError).envVar).toBe('MM_API_KEY');
      expect((e as Error).message).toContain('MM_API_KEY');
    }
  });

  it('reports which layer caught it', () => {
    expect(() => assertApiPrivateKey(undefined, { context: 'strategy runner' })).toThrow(
      /checked by: strategy runner/,
    );
  });

  it('rejects the .env.example placeholder', () => {
    expect(() => assertApiPrivateKey('your_api_private_key_here')).toThrow(/placeholder/i);
    expect(() => assertApiPrivateKey('CHANGEME')).toThrow(/placeholder/i);
  });

  it('rejects non-hex input', () => {
    expect(() => assertApiPrivateKey('z'.repeat(80))).toThrow(/hexadecimal/i);
    expect(() => assertApiPrivateKey(`"${VALID_API_KEY}"`)).toThrow(/hexadecimal/i);
  });

  it('rejects a wrong-length key', () => {
    expect(() => assertApiPrivateKey('a'.repeat(79))).toThrow(/wrong length/i);
    expect(() => assertApiPrivateKey('a'.repeat(81))).toThrow(/wrong length/i);
  });

  it('specifically diagnoses an ETH key pasted into the API key slot', () => {
    expect(() => assertApiPrivateKey(VALID_ETH_KEY)).toThrow(/ETHEREUM private key/);
  });

  it('never echoes the key material in an error', () => {
    const secret = `deadbeef${'c'.repeat(75)}`; // 83 chars - wrong length
    try {
      assertApiPrivateKey(secret);
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain(secret);
      expect(msg).not.toContain(secret.slice(0, 8));
    }
  });

  it('masks at most 4 leading chars for a non-hex value', () => {
    const secret = `abcdefghij${'z'.repeat(70)}`;
    const msg = (() => {
      try {
        assertApiPrivateKey(secret);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(msg).toContain('abcd');
    expect(msg).not.toContain('abcde');
    expect(msg).not.toContain(secret);
  });
});

describe('assertEthPrivateKey', () => {
  it('accepts a 64-char hex key with or without 0x', () => {
    expect(assertEthPrivateKey(VALID_ETH_KEY)).toBe(VALID_ETH_KEY);
    expect(assertEthPrivateKey(`0x${VALID_ETH_KEY}`)).toBe(VALID_ETH_KEY);
  });

  it('rejects missing and malformed keys', () => {
    expect(() => assertEthPrivateKey(undefined)).toThrow(MissingCredentialError);
    expect(() => assertEthPrivateKey('0xnope')).toThrow(/malformed/i);
    expect(() => assertEthPrivateKey(VALID_API_KEY)).toThrow(/malformed/i);
  });

  it('defaults the env var name to ETH_PRIVATE_KEY', () => {
    try {
      assertEthPrivateKey(undefined);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as MissingCredentialError).envVar).toBe('ETH_PRIVATE_KEY');
    }
  });

  it('never echoes key material', () => {
    const secret = 'f'.repeat(70);
    try {
      assertEthPrivateKey(secret);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

describe('assertAccountIndex', () => {
  it('accepts numeric and string indexes, including 0', () => {
    expect(assertAccountIndex(0)).toBe(0);
    expect(assertAccountIndex('42')).toBe(42);
    expect(assertAccountIndex(692603)).toBe(692603);
  });

  it('rejects missing values', () => {
    expect(() => assertAccountIndex(undefined)).toThrow(MissingCredentialError);
    expect(() => assertAccountIndex('')).toThrow(MissingCredentialError);
  });

  it('rejects negative, fractional, and non-numeric values', () => {
    expect(() => assertAccountIndex(-1)).toThrow(/not a valid account index/);
    expect(() => assertAccountIndex(1.5)).toThrow(/not a valid account index/);
    expect(() => assertAccountIndex('abc')).toThrow(/not a valid account index/);
  });
});
