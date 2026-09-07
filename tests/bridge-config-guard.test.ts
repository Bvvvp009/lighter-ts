/**
 * L1 bridge address guards.
 *
 * `L1BridgeClient` is exported from the package root, and `getMainnetConfig()`
 * used to return placeholder addresses marked "Replace with actual": a ZERO
 * bridge address and a hand-typed, malformed USDC address. The zero address is
 * the dangerous half. It is a valid address, so ethers accepts it, USDC will
 * `approve` it for real, and an EVM call to an address with no code SUCCEEDS as
 * a no-op rather than reverting -- so a deposit routed there returns a green
 * receipt while the USDC never leaves the wallet.
 *
 * Real funds ride on this path, so the guards below are the point: a
 * placeholder must fail loudly, before any gas is spent.
 */

import * as fs from 'fs';
import { ethers } from 'ethers';
import { L1BridgeClient, BridgeConfigError } from '../src/bridge/l1-bridge-client';
import type { L1BridgeConfig, L1DepositParams } from '../src/types/api';

const ZERO = '0x0000000000000000000000000000000000000000';
/** The real mainnet USDC contract, for a config that should be accepted. */
const REAL_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
/** A stand-in bridge address: valid and non-zero, so only a code check rejects it. */
const PLAUSIBLE_BRIDGE = '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7';
/** Exactly what used to ship as `getMainnetConfig().usdcContract` -- 41 hex chars. */
const SHIPPED_MALFORMED_USDC = '0xA0b86a33E6441b8c4C8C0E4A8c4c4c4c4c4c4c4c4';

/** A throwaway key; never funded, used only so `new ethers.Wallet` succeeds. */
const THROWAWAY_KEY = '0x' + '11'.repeat(32);

function config(overrides: Partial<L1BridgeConfig> = {}): L1BridgeConfig {
  return {
    l1BridgeContract: PLAUSIBLE_BRIDGE,
    usdcContract: REAL_USDC,
    rpcUrl: 'http://127.0.0.1:0/unused',
    chainId: 1,
    ...overrides,
  };
}

describe('L1BridgeClient address validation', () => {
  it('rejects a zero bridge address', () => {
    expect(() => new L1BridgeClient(config({ l1BridgeContract: ZERO }))).toThrow(BridgeConfigError);
    expect(() => new L1BridgeClient(config({ l1BridgeContract: ZERO }))).toThrow(
      /zero address is a placeholder/,
    );
  });

  it('rejects a zero USDC address', () => {
    expect(() => new L1BridgeClient(config({ usdcContract: ZERO }))).toThrow(BridgeConfigError);
  });

  it('names the offending field in the error', () => {
    expect(() => new L1BridgeClient(config({ l1BridgeContract: ZERO }))).toThrow(
      /'l1BridgeContract'/,
    );
    expect(() => new L1BridgeClient(config({ usdcContract: ZERO }))).toThrow(/'usdcContract'/);
  });

  it('rejects the malformed USDC address that used to ship', () => {
    // 41 hex chars. ethers rejects it too, but with a bare "invalid address";
    // this asserts the caller gets told which field and why.
    expect(ethers.isAddress(SHIPPED_MALFORMED_USDC)).toBe(false);
    expect(() => new L1BridgeClient(config({ usdcContract: SHIPPED_MALFORMED_USDC }))).toThrow(
      /not a valid Ethereum address/,
    );
  });

  it('accepts a well-formed config and normalises both addresses to checksum form', () => {
    const client = new L1BridgeClient(
      config({ usdcContract: REAL_USDC.toLowerCase(), l1BridgeContract: PLAUSIBLE_BRIDGE }),
    );
    const stored = (client as unknown as { config: L1BridgeConfig }).config;
    expect(stored.usdcContract).toBe(REAL_USDC);
    expect(stored.l1BridgeContract).toBe(PLAUSIBLE_BRIDGE);
  });

  it('does not mutate the config object the caller passed in', () => {
    const supplied = config({ usdcContract: REAL_USDC.toLowerCase() });
    new L1BridgeClient(supplied);
    expect(supplied.usdcContract).toBe(REAL_USDC.toLowerCase());
  });
});

describe('L1BridgeClient bridge code check', () => {
  /** Stub only `getCode`; the provider stays real so `new ethers.Wallet` works. */
  function clientWithCode(code: string): L1BridgeClient {
    const client = new L1BridgeClient(config());
    const provider = (client as unknown as { provider: ethers.Provider }).provider;
    (provider as unknown as { getCode: () => Promise<string> }).getCode = async () => code;
    return client;
  }

  const params: L1DepositParams = {
    ethPrivateKey: THROWAWAY_KEY,
    usdcAmount: 100,
    l2AccountIndex: 1,
  };

  it('refuses to deposit when the bridge address holds no contract', async () => {
    // The silent-failure guard. Without it, `approve` and `deposit` both
    // succeed against a codeless address and this method reports success.
    // Nothing here touches the network: the check runs before the first RPC.
    await expect(clientWithCode('0x').depositToL2(params)).rejects.toThrow(BridgeConfigError);
    await expect(clientWithCode('0x').depositToL2(params)).rejects.toThrow(/no contract code/);
  });

  it('treats "0x0" as no code as well', async () => {
    await expect(clientWithCode('0x0').depositToL2(params)).rejects.toThrow(/no contract code/);
  });

  it('passes the check when a contract is present', async () => {
    const client = clientWithCode('0x60806040');
    const check = (client as unknown as { assertBridgeHasCode(): Promise<void> })
      .assertBridgeHasCode;
    await expect(check.call(client)).resolves.toBeUndefined();
  });

  it('runs the check before spending any gas', async () => {
    // Ordering is the whole value of the guard: an approve that fires first
    // would already have cost gas and left a live allowance behind.
    const client = clientWithCode('0x');
    const usdc = (client as unknown as { usdcContract: Record<string, unknown> }).usdcContract;
    const forbidden = jest.fn(() => {
      throw new Error('touched the USDC contract before the code check');
    });
    usdc['connect'] = jest.fn(() => ({ decimals: forbidden, approve: forbidden }));

    await expect(client.depositToL2(params)).rejects.toThrow(/no contract code/);
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe('the static placeholder configs', () => {
  it('getMainnetConfig no longer hands back placeholder addresses', () => {
    expect(() => L1BridgeClient.getMainnetConfig()).toThrow(BridgeConfigError);
  });

  it('getTestnetConfig no longer hands back placeholder addresses', () => {
    expect(() => L1BridgeClient.getTestnetConfig()).toThrow(BridgeConfigError);
  });

  it('explains that no bridge address ships with the SDK', () => {
    expect(() => L1BridgeClient.getMainnetConfig()).toThrow(/no built-in mainnet bridge address/);
    expect(() => L1BridgeClient.getTestnetConfig()).toThrow(/no built-in testnet bridge address/);
  });
});

describe('no placeholder address survives in the bridge source', () => {
  it('has no zero-address or fake-USDC literal left in l1-bridge-client.ts', () => {
    const src = fs.readFileSync('src/bridge/l1-bridge-client.ts', 'utf8');
    expect(src).not.toContain("'0x0000000000000000000000000000000000000000'");
    expect(src).not.toContain(SHIPPED_MALFORMED_USDC);
  });
});
