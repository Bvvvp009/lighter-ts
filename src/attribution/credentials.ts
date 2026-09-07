/**
 * Credential guards for the strategy runners.
 *
 * These are PURE validators: the value is passed in, never read from the
 * environment here. `src/` must never touch secret env vars (AGENTS.md
 * security invariant), so env reading stays in the runner, which then calls
 * these. Keeping validation here means every entry point — runner, strategy
 * constructor, signer bootstrap — enforces the same rules with the same
 * error messages.
 *
 * Nothing in this file logs, echoes, or stores key material. Errors quote at
 * most a length and a masked prefix.
 */

/** A Lighter API private key is 40 bytes = 80 hex chars (optional 0x). */
const API_KEY_HEX_LEN = 80;
/** An Ethereum private key is 32 bytes = 64 hex chars (optional 0x). */
const ETH_KEY_HEX_LEN = 64;

/** Thrown when a required credential is absent or malformed. */
export class MissingCredentialError extends Error {
  constructor(
    readonly envVar: string,
    message: string,
  ) {
    super(message);
    this.name = 'MissingCredentialError';
  }
}

/** Mask a key for diagnostics: never reveals more than 4 leading chars. */
function mask(value: string): string {
  const stripped = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (stripped.length <= 4) return '****';
  return `${stripped.slice(0, 4)}...${'*'.repeat(6)} (${stripped.length} chars)`;
}

function stripPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

/** Placeholder values shipped in .env.example that must not reach the signer. */
const PLACEHOLDERS = new Set([
  'your_lighter_api_private_key_here',
  'your_api_private_key_here',
  'your_private_key_here',
  'changeme',
  'todo',
  'xxx',
]);

export interface CredentialGuardOptions {
  /** Env var name to cite in the error (default API_PRIVATE_KEY). */
  envVar?: string;
  /** Where the check fired, e.g. 'strategy runner' — shown in the error. */
  context?: string;
}

/**
 * Assert an API private key is present and well-formed.
 *
 * Called at several independent layers before any order can be signed. Throws
 * `MissingCredentialError` with actionable, copy-pasteable guidance.
 *
 * @returns the normalised key (0x prefix stripped, lower-cased)
 */
export function assertApiPrivateKey(
  value: string | undefined | null,
  options: CredentialGuardOptions = {},
): string {
  const envVar = options.envVar ?? 'API_PRIVATE_KEY';
  const where = options.context ? ` [checked by: ${options.context}]` : '';

  if (value === undefined || value === null || String(value).trim() === '') {
    throw new MissingCredentialError(
      envVar,
      `Missing ${envVar}.${where}\n` +
        `\n` +
        `This strategy signs real transactions and cannot start without an API\n` +
        `private key. Nothing was sent to the network.\n` +
        `\n` +
        `Fix:\n` +
        `  1. Copy the template:   cp .env.example .env\n` +
        `  2. Set ${envVar}=<your 80-char hex key> in .env\n` +
        `  3. No key yet? Generate one:  npx tsx examples/system_setup.ts\n` +
        `\n` +
        `Your key stays local — it is never logged, transmitted to any third\n` +
        `party, or written to disk by this SDK.`,
    );
  }

  const raw = String(value).trim();

  if (PLACEHOLDERS.has(raw.toLowerCase())) {
    throw new MissingCredentialError(
      envVar,
      `${envVar} is still the placeholder value from .env.example.${where}\n` +
        `\n` +
        `Replace it with your real 80-character hex API private key, or generate\n` +
        `one with:  npx tsx examples/system_setup.ts`,
    );
  }

  const hex = stripPrefix(raw);

  if (!HEX_RE.test(hex)) {
    throw new MissingCredentialError(
      envVar,
      `${envVar} is not valid hexadecimal.${where}\n` +
        `\n` +
        `Got: ${mask(raw)}\n` +
        `Expected ${API_KEY_HEX_LEN} hex characters (0-9, a-f), optionally 0x-prefixed.\n` +
        `Check for stray quotes, spaces, or a truncated copy-paste in your .env.`,
    );
  }

  if (hex.length !== API_KEY_HEX_LEN) {
    throw new MissingCredentialError(
      envVar,
      `${envVar} has the wrong length.${where}\n` +
        `\n` +
        `Got ${hex.length} hex characters, expected ${API_KEY_HEX_LEN} (40 bytes).\n` +
        (hex.length === ETH_KEY_HEX_LEN
          ? `\nThat is the length of an ETHEREUM private key. Lighter API keys are\n` +
            `separate and longer — you may have pasted ETH_PRIVATE_KEY here by\n` +
            `mistake. Generate a Lighter API key with:\n` +
            `  npx tsx examples/system_setup.ts\n`
          : `\nCheck for a truncated copy-paste in your .env.\n`),
    );
  }

  return hex.toLowerCase();
}

/**
 * Assert an L1 (Ethereum) private key is present and well-formed.
 *
 * Only required for operations that need an L1 signature — notably approving
 * an integrator whose L1 address differs from yours.
 */
export function assertEthPrivateKey(
  value: string | undefined | null,
  options: CredentialGuardOptions = {},
): string {
  const envVar = options.envVar ?? 'ETH_PRIVATE_KEY';
  const where = options.context ? ` [checked by: ${options.context}]` : '';

  if (value === undefined || value === null || String(value).trim() === '') {
    throw new MissingCredentialError(
      envVar,
      `Missing ${envVar}.${where}\n` +
        `\n` +
        `This step needs an L1 (Ethereum) signature. Nothing was sent.\n` +
        `\n` +
        `Set ${envVar}=<your 64-char hex key> in .env, or skip the step that\n` +
        `requires it. Most day-to-day trading does not need an L1 key.`,
    );
  }

  const hex = stripPrefix(String(value).trim());

  if (!HEX_RE.test(hex) || hex.length !== ETH_KEY_HEX_LEN) {
    throw new MissingCredentialError(
      envVar,
      `${envVar} is malformed.${where}\n` +
        `\n` +
        `Got: ${mask(String(value).trim())}\n` +
        `Expected ${ETH_KEY_HEX_LEN} hex characters (32 bytes), optionally 0x-prefixed.`,
    );
  }

  return hex.toLowerCase();
}

/** Assert an account index is a usable non-negative integer. */
export function assertAccountIndex(
  value: number | string | undefined | null,
  options: CredentialGuardOptions = {},
): number {
  const envVar = options.envVar ?? 'ACCOUNT_INDEX';
  const where = options.context ? ` [checked by: ${options.context}]` : '';

  if (value === undefined || value === null || String(value).trim() === '') {
    throw new MissingCredentialError(
      envVar,
      `Missing ${envVar}.${where}\n` +
        `\n` +
        `Set ${envVar} in .env to the account index these strategies should trade.\n` +
        `Find it with:  npx tsx examples/get_account_by_l1_address.ts`,
    );
  }

  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new MissingCredentialError(
      envVar,
      `${envVar}='${String(value)}' is not a valid account index.${where}\n` +
        `Expected a non-negative integer.`,
    );
  }
  return n;
}
