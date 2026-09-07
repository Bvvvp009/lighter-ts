/**
 * Enforcement tests for the three attribution layers.
 *
 * Layer 1 (runner) is covered by the examples; this file covers the two layers
 * inside `src/` that must recover attribution when an upstream layer drops it:
 *
 *   layer 2  StrategyBase constructor  — re-derives from `attributionNetwork`
 *   layer 3  WsExecutor signing path   — last line before the WASM signer
 *
 * Each layer is tested for BOTH properties that matter:
 *   - it recovers attribution that a caller failed to pass, and
 *   - it honours a genuine user opt-out (ethics: never override that).
 */

import { EventEmitter } from 'events';
import { StrategyBase, type StrategyConfig } from '../src/strategies/strategy-base';
import { WsExecutor } from '../src/strategies/ws-executor';
import { BUILDER_ACCOUNTS } from '../src/attribution/builder-registry';
import {
  DEFAULT_MAKER_FEE_MILLIONTHS,
  DEFAULT_TAKER_FEE_MILLIONTHS,
} from '../src/attribution/builder-registry';
import { AttributionFeeCapError } from '../src/attribution/policy';

const MAINNET_BUILDER = BUILDER_ACCOUNTS.mainnet.accountIndex;
const RH_BUILDER = BUILDER_ACCOUNTS.robinhood.accountIndex;

// --------------------------------------------------------------------------
// Minimal test doubles — none of this touches the network or the WASM signer.
// --------------------------------------------------------------------------

class TestStrategy extends StrategyBase {
  get name(): string {
    return 'test';
  }
  protected async onTick(): Promise<void> {
    /* no-op */
  }
  /** Expose the resolved config for assertions. */
  cfg(): StrategyConfig {
    return this.config;
  }
}

function makeStrategy(config: Partial<StrategyConfig>): TestStrategy {
  const base: StrategyConfig = {
    marketId: 0,
    accountId: 1,
    maxPositionSize: 1,
    maxOpenOrders: 4,
    makerOnly: true,
    selfTradeBehavior: 0,
    reconnectTimeoutMs: 30000,
    ...config,
  } as StrategyConfig;
  // wireEvents() subscribes to the tracker/executor/ws — real EventEmitters
  // keep the constructor honest without pulling in the network stack.
  return new TestStrategy(
    base,
    {} as any,
    new EventEmitter() as any,
    new EventEmitter() as any,
    new EventEmitter() as any,
  );
}

function makeExecutor(opts: { network?: string; url?: string } = {}): WsExecutor {
  const signer: any = {
    apiClient: {},
    config: {
      accountIndex: 1,
      apiKeyIndex: 0,
      ...(opts.network !== undefined && { network: opts.network }),
      ...(opts.url !== undefined && { url: opts.url }),
    },
    getOptimisticNonceManager: () => ({}),
  };
  const ws: any = { isConnectedToWebSocket: () => false };
  return new WsExecutor(signer, ws);
}

/** Call the private layer-3 resolver the signer path uses. */
function integratorFor(exec: WsExecutor, params: Record<string, unknown>) {
  return (exec as any).resolveIntegratorFields(params);
}

// --------------------------------------------------------------------------

describe('layer 2 — StrategyBase constructor', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('re-derives attribution when the caller omits builderIntegratorIndex', () => {
    // The failure mode this defends against: someone deletes the integrator
    // wiring from the runner. The strategy must recover it from the venue.
    const s = makeStrategy({ attributionNetwork: 'mainnet' });
    expect(s.cfg().builderIntegratorIndex).toBe(MAINNET_BUILDER);
    expect(s.cfg().integratorTakerFee).toBe(DEFAULT_TAKER_FEE_MILLIONTHS);
    expect(s.cfg().integratorMakerFee).toBe(DEFAULT_MAKER_FEE_MILLIONTHS);
  });

  it('re-derives the Robinhood builder account on Robinhood', () => {
    const s = makeStrategy({ attributionNetwork: 'robinhood' });
    expect(s.cfg().builderIntegratorIndex).toBe(RH_BUILDER);
  });

  it('does not override an index the caller supplied', () => {
    const s = makeStrategy({ attributionNetwork: 'mainnet', builderIntegratorIndex: 4242 });
    expect(s.cfg().builderIntegratorIndex).toBe(4242);
  });

  it('honours BUILDER_ATTRIBUTION=off', () => {
    process.env.BUILDER_ATTRIBUTION = 'off';
    const s = makeStrategy({ attributionNetwork: 'mainnet' });
    expect(s.cfg().builderIntegratorIndex).toBeUndefined();
  });

  it('honours INTEGRATOR_ACCOUNT_INDEX=0', () => {
    process.env.INTEGRATOR_ACCOUNT_INDEX = '0';
    const s = makeStrategy({ attributionNetwork: 'mainnet' });
    expect(s.cfg().builderIntegratorIndex).toBeUndefined();
  });

  it('routes to a user integrator via INTEGRATOR_ACCOUNT_INDEX', () => {
    process.env.INTEGRATOR_ACCOUNT_INDEX = '777';
    const s = makeStrategy({ attributionNetwork: 'mainnet' });
    expect(s.cfg().builderIntegratorIndex).toBe(777);
  });

  it('rejects an over-cap fee before the strategy can start', () => {
    expect(() =>
      makeStrategy({
        attributionNetwork: 'mainnet',
        builderIntegratorIndex: 5,
        integratorTakerFee: 50000,
      }),
    ).toThrow(AttributionFeeCapError);
  });

  it('constructs without an attributionNetwork (no crash, attribution off)', () => {
    const s = makeStrategy({});
    expect(s.cfg().builderIntegratorIndex).toBeUndefined();
  });
});

describe('layer 3 — WsExecutor signing chokepoint', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('stamps the builder index when the order carries no integrator fields', () => {
    // The failure mode: a strategy builds `creates[]` without integrator
    // fields. The signer path must still attribute the order.
    const exec = makeExecutor({ network: 'mainnet' });
    expect(integratorFor(exec, {})).toEqual({
      integratorAccountIndex: MAINNET_BUILDER,
      integratorTakerFee: DEFAULT_TAKER_FEE_MILLIONTHS,
      integratorMakerFee: DEFAULT_MAKER_FEE_MILLIONTHS,
    });
  });

  it('resolves the venue from a Network object', () => {
    const exec = makeExecutor({ network: { name: 'robinhood' } as any });
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(RH_BUILDER);
  });

  it('passes a caller-supplied index through verbatim', () => {
    const exec = makeExecutor({ network: 'mainnet' });
    expect(
      integratorFor(exec, {
        integratorAccountIndex: 999,
        integratorTakerFee: 100,
        integratorMakerFee: 25,
      }),
    ).toEqual({
      integratorAccountIndex: 999,
      integratorTakerFee: 100,
      integratorMakerFee: 25,
    });
  });

  it('treats an explicit 0 from the caller as opt-out', () => {
    const exec = makeExecutor({ network: 'mainnet' });
    expect(integratorFor(exec, { integratorAccountIndex: 0 })).toEqual({
      integratorAccountIndex: 0,
      integratorTakerFee: 0,
      integratorMakerFee: 0,
    });
  });

  it('honours BUILDER_ATTRIBUTION=off at the signing path too', () => {
    process.env.BUILDER_ATTRIBUTION = 'off';
    const exec = makeExecutor({ network: 'mainnet' });
    expect(integratorFor(exec, {})).toEqual({
      integratorAccountIndex: 0,
      integratorTakerFee: 0,
      integratorMakerFee: 0,
    });
  });

  it('stays at zero on an unregistered venue rather than guessing', () => {
    const exec = makeExecutor({ network: 'testnet' });
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(0);
  });

  it('stays at zero when the venue cannot be inferred', () => {
    const exec = makeExecutor({});
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(0);
  });

  it('resolves the venue only once and caches the decision', () => {
    const exec = makeExecutor({ network: 'mainnet' });
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(MAINNET_BUILDER);
    // Changing env after the first resolve must not re-resolve mid-run:
    // a stable decision for the lifetime of the executor.
    process.env.BUILDER_ATTRIBUTION = 'off';
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(MAINNET_BUILDER);
  });
});

describe('defense in depth — dropping one layer does not disable attribution', () => {
  it('order with no fields, strategy with no index, still gets attributed', () => {
    // Simulates the full "someone stripped the runner wiring" scenario:
    // the strategy config has no integrator index and the order params carry
    // none either. Layer 3 recovers it.
    const s = makeStrategy({});
    expect(s.cfg().builderIntegratorIndex).toBeUndefined();

    const exec = makeExecutor({ network: 'mainnet' });
    expect(integratorFor(exec, {}).integratorAccountIndex).toBe(MAINNET_BUILDER);
  });
});
