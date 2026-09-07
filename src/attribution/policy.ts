import {
  DEFAULT_MAKER_FEE_MILLIONTHS,
  DEFAULT_TAKER_FEE_MILLIONTHS,
  MAX_MAKER_FEE_MILLIONTHS,
  MAX_TAKER_FEE_MILLIONTHS,
  builderAccountFor,
  millionthsToBps,
  normalizeNetwork,
  verifyRegistryIntegrity,
  type BuilderNetwork,
} from './builder-registry';

/**
 * Attribution policy: turns a venue plus user preferences into the concrete
 * integrator fields stamped onto every order.
 *
 * This module reads only NON-SECRET environment variables
 * (`BUILDER_ATTRIBUTION`, `INTEGRATOR_*`). Secret material (API/ETH private
 * keys) is never read here — see `./credentials` for validators that take the
 * value as an argument, and the runner for the single place env secrets are
 * read. This keeps the `src/` security invariant in AGENTS.md intact.
 */

/** Where the resolved integrator index came from. */
export type AttributionSource =
  | 'builder' // the SDK maintainer's account for this venue
  | 'user-override' // user pointed INTEGRATOR_ACCOUNT_INDEX at their own account
  | 'disabled' // explicitly opted out
  | 'unregistered'; // no builder account exists for this venue

export interface AttributionDecision {
  /** True when orders will carry a nonzero integrator account index. */
  readonly enabled: boolean;
  /** Integrator account index to stamp (0 when disabled/unregistered). */
  readonly accountIndex: number;
  /** Taker fee in millionths of notional. */
  readonly takerFee: number;
  /** Maker fee in millionths of notional. */
  readonly makerFee: number;
  /** Canonical network key, when recognised. */
  readonly network: BuilderNetwork | undefined;
  /** Human label for logs. */
  readonly label: string;
  readonly source: AttributionSource;
}

export interface AttributionOptions {
  /** Venue: mainnet | testnet | robinhood | robinhood-testnet (aliases ok). */
  network: string;
  /** Explicit opt-out. */
  disabled?: boolean;
  /**
   * Override the integrator account index. 0 means "no attribution".
   * A positive value routes attribution to the caller's own account.
   */
  overrideAccountIndex?: number;
  /** Taker fee in millionths (default {@link DEFAULT_TAKER_FEE_MILLIONTHS}). */
  takerFeeMillionths?: number;
  /** Maker fee in millionths (default {@link DEFAULT_MAKER_FEE_MILLIONTHS}). */
  makerFeeMillionths?: number;
}

/** Raised when a configured fee exceeds the SDK's self-imposed ceiling. */
export class AttributionFeeCapError extends Error {
  constructor(kind: 'maker' | 'taker', requested: number, cap: number) {
    super(
      `Integrator ${kind} fee ${requested} millionths (${millionthsToBps(requested)} bps) exceeds ` +
        `the SDK cap of ${cap} millionths (${millionthsToBps(cap)} bps).\n` +
        `\n` +
        `Fees are expressed in MILLIONTHS of notional, not basis points:\n` +
        `  50 = 0.5 bps, 200 = 2 bps, 1000 = 10 bps.\n` +
        `A value like 20000 is almost always a unit mix-up. Refusing to sign\n` +
        `orders at this rate rather than silently clamping, so the mistake is\n` +
        `visible before it costs you money.\n` +
        `\n` +
        `Set INTEGRATOR_${kind.toUpperCase()}_FEE (millionths) or ` +
        `INTEGRATOR_${kind.toUpperCase()}_FEE_BPS (basis points) to a sane value.`,
    );
    this.name = 'AttributionFeeCapError';
  }
}

/**
 * Validate a fee against the SDK ceiling. Throws rather than clamping: a
 * silently-reduced fee hides a config error that is better caught before any
 * capital is at risk.
 */
export function assertFeeWithinCap(kind: 'maker' | 'taker', millionths: number): void {
  const cap = kind === 'maker' ? MAX_MAKER_FEE_MILLIONTHS : MAX_TAKER_FEE_MILLIONTHS;
  if (!Number.isFinite(millionths) || millionths < 0 || millionths > cap) {
    throw new AttributionFeeCapError(kind, millionths, cap);
  }
}

/**
 * Resolve the attribution decision for a venue.
 *
 * Pure: no env access, no I/O. Verifies registry integrity on every call so a
 * tampered registry cannot produce a valid-looking decision.
 */
export function resolveAttribution(options: AttributionOptions): AttributionDecision {
  verifyRegistryIntegrity();

  const key = normalizeNetwork(options.network);
  const takerFee = options.takerFeeMillionths ?? DEFAULT_TAKER_FEE_MILLIONTHS;
  const makerFee = options.makerFeeMillionths ?? DEFAULT_MAKER_FEE_MILLIONTHS;
  assertFeeWithinCap('taker', takerFee);
  assertFeeWithinCap('maker', makerFee);

  const off = (source: AttributionSource, label: string): AttributionDecision => ({
    enabled: false,
    accountIndex: 0,
    takerFee: 0,
    makerFee: 0,
    network: key,
    label,
    source,
  });

  if (options.disabled) {
    return off('disabled', 'attribution disabled by user');
  }

  if (options.overrideAccountIndex !== undefined) {
    if (!Number.isInteger(options.overrideAccountIndex) || options.overrideAccountIndex < 0) {
      throw new Error(
        `Invalid integrator account index: ${options.overrideAccountIndex}. ` +
          `Expected a non-negative integer (0 disables attribution).`,
      );
    }
    if (options.overrideAccountIndex === 0) {
      return off('disabled', 'attribution disabled (INTEGRATOR_ACCOUNT_INDEX=0)');
    }
    return {
      enabled: true,
      accountIndex: options.overrideAccountIndex,
      takerFee,
      makerFee,
      network: key,
      label: `custom integrator #${options.overrideAccountIndex}`,
      source: 'user-override',
    };
  }

  const builder = key ? builderAccountFor(key) : undefined;
  if (!builder) {
    return off('unregistered', `no builder account registered for '${options.network}'`);
  }

  return {
    enabled: true,
    accountIndex: builder.accountIndex,
    takerFee,
    makerFee,
    network: key,
    label: builder.label,
    source: 'builder',
  };
}

/** Minimal env shape, so tests can pass a plain object. */
export type EnvLike = Record<string, string | undefined>;

function parseFee(env: EnvLike, millionthsKey: string, bpsKey: string, fallback: number): number {
  const raw = env[millionthsKey];
  if (raw !== undefined && raw.trim() !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${millionthsKey} must be a number, got '${raw}'`);
    return n;
  }
  const bps = env[bpsKey];
  if (bps !== undefined && bps.trim() !== '') {
    const n = Number(bps);
    if (!Number.isFinite(n)) throw new Error(`${bpsKey} must be a number, got '${bps}'`);
    return Math.round(n * 100);
  }
  return fallback;
}

/**
 * Resolve attribution from non-secret env vars.
 *
 * - `BUILDER_ATTRIBUTION=0|false|off|no` — opt out
 * - `INTEGRATOR_ACCOUNT_INDEX=<n>` — override (0 = opt out)
 * - `INTEGRATOR_TAKER_FEE` / `INTEGRATOR_MAKER_FEE` (millionths), or the
 *   `_BPS` variants (basis points)
 */
export function resolveAttributionFromEnv(
  network: string,
  env: EnvLike = process.env as EnvLike,
): AttributionDecision {
  const flag = env['BUILDER_ATTRIBUTION'];
  const disabled = flag !== undefined && /^(0|false|off|no)$/i.test(flag.trim());

  const rawOverride = env['INTEGRATOR_ACCOUNT_INDEX'];
  let overrideAccountIndex: number | undefined;
  if (rawOverride !== undefined && rawOverride.trim() !== '') {
    const n = Number(rawOverride);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(
        `Invalid INTEGRATOR_ACCOUNT_INDEX='${rawOverride}'. ` +
          `Expected a non-negative integer (0 disables attribution).`,
      );
    }
    overrideAccountIndex = n;
  }

  return resolveAttribution({
    network,
    disabled,
    ...(overrideAccountIndex !== undefined && { overrideAccountIndex }),
    takerFeeMillionths: parseFee(
      env,
      'INTEGRATOR_TAKER_FEE',
      'INTEGRATOR_TAKER_FEE_BPS',
      DEFAULT_TAKER_FEE_MILLIONTHS,
    ),
    makerFeeMillionths: parseFee(
      env,
      'INTEGRATOR_MAKER_FEE',
      'INTEGRATOR_MAKER_FEE_BPS',
      DEFAULT_MAKER_FEE_MILLIONTHS,
    ),
  });
}

/** Order-parameter fields the protocol uses for attribution. */
export interface IntegratorFields {
  integratorAccountIndex: number;
  integratorTakerFee: number;
  integratorMakerFee: number;
}

/** Concrete integrator fields for an order, from a decision. */
export function integratorFields(decision: AttributionDecision): IntegratorFields {
  return {
    integratorAccountIndex: decision.enabled ? decision.accountIndex : 0,
    integratorTakerFee: decision.enabled ? decision.takerFee : 0,
    integratorMakerFee: decision.enabled ? decision.makerFee : 0,
  };
}

/**
 * Startup disclosure. Printed before any order is placed, so the user always
 * knows what their orders carry and how to change it.
 */
export function formatAttributionDisclosure(decision: AttributionDecision): string {
  const lines: string[] = [];
  lines.push('--- Partner attribution -------------------------------------');
  if (decision.enabled) {
    lines.push(`  Integrator account : #${decision.accountIndex} (${decision.label})`);
    lines.push(
      `  Fee attribution    : maker ${millionthsToBps(decision.makerFee)} bps / ` +
        `taker ${millionthsToBps(decision.takerFee)} bps`,
    );
    if (decision.source === 'builder') {
      lines.push('  This funds development and maintenance of these strategies.');
      lines.push('  Opt out any time: BUILDER_ATTRIBUTION=off');
    } else {
      lines.push('  Routed to YOUR integrator account (INTEGRATOR_ACCOUNT_INDEX).');
    }
  } else {
    lines.push(`  Integrator account : none (${decision.label})`);
    lines.push('  Orders will carry no fee attribution.');
  }
  lines.push('-------------------------------------------------------------');
  return lines.join('\n');
}

/**
 * End-of-run notice. Thanks supporters, and politely asks opted-out users to
 * consider enabling attribution. Never blocks, never nags mid-run.
 */
export function formatSupportNotice(decision: AttributionDecision): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('=============================================================');
  if (decision.enabled && decision.source === 'builder') {
    lines.push(' Thank you for supporting lighter-ts-sdk.');
    lines.push('');
    lines.push(` This run was attributed to integrator #${decision.accountIndex}, which`);
    lines.push(' funds ongoing development and maintenance of these strategies.');
  } else {
    lines.push(' Support lighter-ts-sdk');
    lines.push('');
    lines.push(' These market-making strategies are free and open source. They are');
    lines.push(' funded entirely by optional partner (builder) fee attribution.');
    lines.push('');
    if (decision.source === 'user-override') {
      lines.push(` This run was attributed to your own integrator #${decision.accountIndex}.`);
      lines.push(' If these strategies are useful to you, consider running some of');
      lines.push(' your volume with BUILDER_ATTRIBUTION=on to support maintenance.');
    } else {
      lines.push(' Attribution is currently OFF for this run. If these strategies are');
      lines.push(' useful to you, please consider enabling it:');
      lines.push('');
      lines.push('   BUILDER_ATTRIBUTION=on   (maker 0.5 bps / taker 2 bps)');
      lines.push('');
      lines.push(' You will be asked to sign a one-time APPROVE_INTEGRATOR transaction');
      lines.push(' with explicit fee caps and an expiry. You stay in control and can');
      lines.push(' revoke it at any time.');
    }
  }
  lines.push('=============================================================');
  return lines.join('\n');
}
