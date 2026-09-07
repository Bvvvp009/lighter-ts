/**
 * Referral integration example — covers the full referral lifecycle on the
 * active network (LIGHTER_NETWORK):
 *
 *   1. referralGet      — fetch (or lazily create) your referral record
 *   2. referralUpdate   — set a custom referral code
 *   3. referralUse      — bind a code to an account (join someone's referral)
 *   4. referralUseWithSignature — RHC-instance bind with the base64 salt sig
 *   5. referralKickbackUpdate — set the kickback rate (fee share to referees)
 *   6. getReferralPoints / getUserReferrals — read points and referral lists
 *
 * Sub-commands (REFERRAL_OP env var, default "status"):
 *   status | create | update-code | use-code | kickback | points | referrals
 *
 * Relevant env:
 *   REFERRAL_CODE=xxx       custom code (update-code)
 *   REFERRAL_KICKBACK=0.5   kickback fraction 0..1 (kickback)
 *   REFERRAL_BIND_CODE=xxx  code to bind (use-code)
 *
 * Run: npx tsx examples/referral_integration.ts
 */
import * as dotenv from 'dotenv';
import {
  SignerClient,
  ApiClient,
  ReferralApi,
  AccountApi,
  resolveNetworkFromEnv,
} from '../src';

dotenv.config();

const OP = (process.env.REFERRAL_OP || 'status').toLowerCase();

function fmt(x: unknown): string {
  return JSON.stringify(x, null, 2);
}

async function main(): Promise<void> {
  const network = resolveNetworkFromEnv();
  const accountIndex = parseInt(process.env.ACCOUNT_INDEX || '0', 10);
  const apiKeyIndex = parseInt(process.env.API_KEY_INDEX || '0', 10);
  const privateKey = process.env.API_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('API_PRIVATE_KEY is required');
  }

  console.log(`=== Referral Integration — network=${network.name} account=${accountIndex} op=${OP} ===`);

  const signer = new SignerClient({
    network: network.name as any,
    privateKey,
    accountIndex,
    apiKeyIndex,
  });
  await signer.initialize();
  await signer.ensureWasmClient();
  const auth = await signer.createAuthToken();

  const api = new ApiClient({ host: network.apiUrl });
  const referral = new ReferralApi(api);
  const accountApi = new AccountApi(api);

  // L1 address (needed for the signature bind + user referrals listing)
  let l1Address = process.env.PRIVATEKEY_ADDRESS || process.env.L1_ADDRESS || '';
  if (!l1Address) {
    try {
      const acct = await accountApi.getAccount({ by: 'index', value: String(accountIndex) }, auth);
      l1Address = acct?.l1_address || '';
    } catch {
      // leave empty; only signature-bind needs it
    }
  }

  switch (OP) {
    case 'status': {
      const record = await referral.referralGet({ account_index: accountIndex, authorization: auth });
      console.log('Referral record:\n', fmt(record));
      break;
    }

    case 'create': {
      const res = await referral.referralCreate({ account_index: accountIndex, authorization: auth });
      console.log('Referral created:\n', fmt(res));
      break;
    }

    case 'update-code': {
      const code = process.env.REFERRAL_CODE;
      if (!code) throw new Error('REFERRAL_CODE is required for update-code');
      const res = await referral.referralUpdate({ account_index: accountIndex, code, authorization: auth });
      console.log('Referral code updated:\n', fmt(res));
      break;
    }

    case 'use-code': {
      const code = process.env.REFERRAL_BIND_CODE || process.env.REFERRAL_CODE;
      if (!code) throw new Error('REFERRAL_BIND_CODE (or REFERRAL_CODE) is required for use-code');
      let res: any;
      try {
        res = await referral.referralUse({ account_index: accountIndex, code, authorization: auth });
      } catch (e) {
        // Some instances (RHC) require the salted signature variant
        if (!l1Address) throw e;
        console.log('Plain bind failed, trying signature bind...');
        res = await referral.referralUseWithSignature({
          l1Address,
          referralCode: code,
          accountIndex,
          authorization: auth,
        });
      }
      console.log('Referral code bound:\n', fmt(res));
      break;
    }

    case 'kickback': {
      const kickback = process.env.REFERRAL_KICKBACK;
      if (!kickback) throw new Error('REFERRAL_KICKBACK is required for kickback (fraction 0..1, e.g. 0.5)');
      const res = await referral.referralKickbackUpdate({
        account_index: accountIndex,
        kickback_rate: kickback,
        authorization: auth,
      });
      console.log('Kickback rate updated:\n', fmt(res));
      break;
    }

    case 'points': {
      const points = await referral.getReferralPoints(accountIndex, auth);
      console.log('Referral points:\n', fmt(points));
      break;
    }

    case 'referrals': {
      if (!l1Address) throw new Error('Could not resolve your L1 address (set PRIVATEKEY_ADDRESS or L1_ADDRESS)');
      const refs = await referral.getUserReferrals({ l1Address, authorization: auth });
      console.log('User referrals:\n', fmt(refs));
      break;
    }

    default:
      throw new Error(`Unknown REFERRAL_OP "${OP}". Valid: status | create | update-code | use-code | kickback | points | referrals`);
  }

  await api.close();
  await signer.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});