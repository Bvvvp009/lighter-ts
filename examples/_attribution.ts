/**
 * Partner (builder) attribution + credential loading — enforcement layer 1 of 3.
 *
 * Every runnable example imports this module rather than reading the
 * attribution env vars itself, so there is exactly ONE place where layer 1
 * lives. All policy lives in `src/attribution`; this module only reads env and
 * renders it. Layers 2 and 3 (StrategyBase constructor, WsExecutor signing
 * path) independently re-derive the same decision, so attribution survives
 * edits to any single layer. See docs/ATTRIBUTION.md.
 *
 * User controls (documented, honoured at every layer):
 *   BUILDER_ATTRIBUTION=off       disable attribution entirely
 *   INTEGRATOR_ACCOUNT_INDEX=0    same, alternative spelling
 *   INTEGRATOR_ACCOUNT_INDEX=N    attribute to YOUR OWN integrator account
 *   INTEGRATOR_TAKER_FEE / INTEGRATOR_MAKER_FEE          millionths (200 = 2 bps)
 *   INTEGRATOR_TAKER_FEE_BPS / INTEGRATOR_MAKER_FEE_BPS  basis points
 *   INTEGRATOR_AUTO_APPROVE=0     skip the startup APPROVE_INTEGRATOR tx
 *
 * Fee units are MILLIONTHS (1e-6) of notional per the partner-attribution
 * spec. Defaults: maker 0.5 bps / taker 2 bps.
 *
 * This is also the ONLY place secret env vars are read; `src/` never touches
 * them (AGENTS.md security invariant).
 */

import {
  resolveAttributionFromEnv,
  formatAttributionDisclosure,
  formatSupportNotice,
  assertApiPrivateKey,
  DEFAULT_TAKER_FEE_MILLIONTHS,
  DEFAULT_MAKER_FEE_MILLIONTHS,
  type AttributionDecision,
} from '../src';

/** Venues that carry a builder account. */
export type Venue = 'mainnet' | 'robinhood';

/** Cached per-venue decision — resolved once so logs and orders agree. */
const attributionByVenue = new Map<Venue, AttributionDecision>();

export function attributionFor(venue: Venue): AttributionDecision {
  let d = attributionByVenue.get(venue);
  if (!d) {
    d = resolveAttributionFromEnv(venue);
    attributionByVenue.set(venue, d);
  }
  return d;
}

/** True only when the user opted out on BOTH venues. */
export function attributionDisabled(): boolean {
  return !attributionFor('mainnet').enabled && !attributionFor('robinhood').enabled;
}

/** Resolve the integrator index for a venue, or undefined when opted out. */
export function integratorIndexForVenue(venue: Venue): number | undefined {
  const d = attributionFor(venue);
  return d.enabled ? d.accountIndex : undefined;
}

export function takerFeeFor(venue: Venue): number {
  return attributionFor(venue).takerFee || DEFAULT_TAKER_FEE_MILLIONTHS;
}

export function makerFeeFor(venue: Venue): number {
  return attributionFor(venue).makerFee || DEFAULT_MAKER_FEE_MILLIONTHS;
}

/**
 * When true (default), a runner submits APPROVE_INTEGRATOR on each venue
 * before quoting (idempotent re-approve). Zero-fee or same-L1 approvals need
 * only the L2 signature; cross-L1 needs ETH_PRIVATE_KEY.
 */
export function autoApproveEnabled(): boolean {
  return !attributionDisabled() && (process.env.INTEGRATOR_AUTO_APPROVE || '1') === '1';
}

export function approvalExpirySeconds(): number {
  const raw = parseInt(process.env.INTEGRATOR_EXPIRY_SECONDS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 365 * 24 * 3600;
}

/**
 * Attribution fields for a strategy config.
 *
 * `attributionNetwork` is the important one: it lets StrategyBase re-derive
 * attribution on its own, so removing `builderIntegratorIndex` here does not
 * silently disable it.
 *
 * The explicit return type matters under `exactOptionalPropertyTypes`: the
 * fields are absent when opted out, never present-and-undefined.
 */
export interface StrategyAttributionFields {
  attributionNetwork: Venue;
  builderIntegratorIndex?: number;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
}

export function integratorFields(venue: Venue): StrategyAttributionFields {
  const d = attributionFor(venue);
  if (!d.enabled) return { attributionNetwork: venue };
  return {
    attributionNetwork: venue,
    builderIntegratorIndex: d.accountIndex,
    integratorTakerFee: d.takerFee,
    integratorMakerFee: d.makerFee,
  };
}

/**
 * Map a network name (any alias) to the venue whose builder account applies.
 * Unregistered venues (testnets) return undefined — attribution stays off
 * rather than guessing.
 */
export function venueForNetwork(name: string | undefined): Venue | undefined {
  const n = (name || '').toLowerCase();
  if (n === 'mainnet' || n === 'core') return 'mainnet';
  if (n === 'robinhood' || n === 'rh') return 'robinhood';
  return undefined;
}

// ---------------------------------------------------------------------------
// Credential loading — enforcement point for the "no key, no run" rule.
//
// Every key that reaches a SignerClient passes through `assertApiPrivateKey`,
// which rejects missing, placeholder, non-hex, and wrong-length values with an
// actionable message that never echoes the key material.
// ---------------------------------------------------------------------------

export function requireKey(
  value: string | undefined,
  envVar: string,
  context: string,
): string {
  return assertApiPrivateKey(value, { envVar, context });
}

/**
 * Resolve a key from an ordered list of env var names, requiring that at least
 * one is set and valid. The error names every candidate so the user knows
 * exactly which var to populate.
 */
export function requireKeyFrom(
  candidates: readonly string[],
  context: string,
): string {
  for (const name of candidates) {
    const raw = process.env[name];
    if (raw && raw.trim()) return assertApiPrivateKey(raw, { envVar: name, context });
  }
  // Nothing set: report against the first (preferred) name but list them all.
  return assertApiPrivateKey(undefined, {
    envVar: candidates.join(' or '),
    context,
  });
}

export function loadKeys(): { privateKey: string; apiPrivateKeys?: Record<number, string> } {
  const multi = process.env.API_PRIVATE_KEYS_JSON;
  if (multi) {
    try {
      const parsed = JSON.parse(multi) as Record<string, string>;
      const map: Record<number, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        map[Number(k)] = requireKey(v, `API_PRIVATE_KEYS_JSON[${k}]`, 'runner: multi-key load');
      }
      const first = Object.values(map)[0];
      if (first) return { privateKey: first, apiPrivateKeys: map };
      console.error('API_PRIVATE_KEYS_JSON is empty — falling back to API_PRIVATE_KEY');
    } catch (err) {
      if ((err as Error).name === 'MissingCredentialError') throw err;
      console.error('Failed to parse API_PRIVATE_KEYS_JSON — falling back to API_PRIVATE_KEY');
    }
  }
  return {
    privateKey: requireKey(process.env.API_PRIVATE_KEY, 'API_PRIVATE_KEY', 'runner: key load'),
  };
}

// ---------------------------------------------------------------------------
// Disclosure — printed at startup, and the support ask at the end of a run.
// ---------------------------------------------------------------------------

/** Print the attribution banner for the venues this run will touch. */
export function printAttributionDisclosure(...venues: Venue[]): void {
  const seen = new Set<Venue>(venues.length ? venues : ['mainnet']);
  for (const v of seen) {
    console.log(formatAttributionDisclosure(attributionFor(v)));
  }
}

/**
 * Print the closing thank-you / support request, one banner per venue.
 *
 * Mirrors printAttributionDisclosure above: a run that disclosed two
 * integrators at startup has to thank both at the end, or the closing notice
 * under-reports what the run was actually attributed to. Guarded per venue --
 * a shutdown-path banner must never mask the real exit reason, and one venue
 * failing to format must not swallow the banners after it.
 */
export function printSupportNotice(...venues: Venue[]): void {
  const seen = new Set<Venue>(venues.length ? venues : ['mainnet']);
  for (const v of seen) {
    try {
      console.log(formatSupportNotice(attributionFor(v)));
    } catch {
      /* keep going: the next venue's notice is still worth printing */
    }
  }
}

/**
 * Resolve attribution from a NETWORK NAME rather than a `Venue`.
 *
 * `venueForNetwork()` returns undefined for testnets, and callers that mapped
 * that back to a default venue printed a Robinhood banner on runs whose orders
 * carried no attribution at all. The disclosure has to describe what the orders
 * actually carry, so resolve straight from the network name: unregistered
 * networks come back off, with a label saying why.
 */
export function attributionForNetwork(network: string): AttributionDecision {
  return resolveAttributionFromEnv(network);
}

/** Startup disclosure, keyed by network name. See attributionForNetwork. */
export function printAttributionDisclosureForNetworks(...networks: string[]): void {
  const seen = new Set<string>(networks.length ? networks : ['mainnet']);
  for (const n of seen) {
    console.log(formatAttributionDisclosure(attributionForNetwork(n)));
  }
}

/** Closing support notice, keyed by network name. Never throws. */
export function printSupportNoticeForNetwork(network: string): void {
  try {
    console.log(formatSupportNotice(attributionForNetwork(network)));
  } catch {
    /* a shutdown-path banner must never mask the real exit reason */
  }
}

/**
 * Closing support notice for every network the run touched.
 *
 * The plural counterpart of printAttributionDisclosureForNetworks: a run that
 * disclosed two integrators at startup must name both at the end. Guarded per
 * network so one failing to format cannot swallow the notices after it.
 */
export function printSupportNoticeForNetworks(...networks: string[]): void {
  const seen = new Set<string>(networks.length ? networks : ['mainnet']);
  for (const n of seen) {
    printSupportNoticeForNetwork(n);
  }
}

/**
 * Attribution fields for a multi-venue strategy (CrossVenueMM).
 *
 * Builder accounts differ between Core and Robinhood, so the per-venue map is
 * the authoritative field; `builderIntegratorIndex` is the fallback the base
 * strategy uses when a venue tag is not in the map.
 */
export interface CrossVenueAttributionFields {
  attributionNetwork: Venue;
  builderIntegratorIndex?: number;
  builderIntegratorIndexPerVenue?: Record<string, number>;
  integratorTakerFee?: number;
  integratorMakerFee?: number;
}

export function crossVenueIntegratorFields(
  tagVenues: Record<string, Venue>,
  primary: Venue = 'mainnet',
): CrossVenueAttributionFields {
  const perVenue: Record<string, number> = {};
  for (const [tag, venue] of Object.entries(tagVenues)) {
    const idx = integratorIndexForVenue(venue);
    if (idx !== undefined) perVenue[tag] = idx;
  }
  const out: CrossVenueAttributionFields = { attributionNetwork: primary };
  const primaryIdx = integratorIndexForVenue(primary);
  if (primaryIdx !== undefined) out.builderIntegratorIndex = primaryIdx;
  if (Object.keys(perVenue).length > 0) out.builderIntegratorIndexPerVenue = perVenue;
  const d = attributionFor(primary);
  if (d.enabled) {
    out.integratorTakerFee = d.takerFee;
    out.integratorMakerFee = d.makerFee;
  }
  return out;
}
