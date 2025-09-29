import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  // Initialize signer (standalone WASM) to create an auth token
  const signer = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signer.initialize();
  await (signer as any).ensureWasmClient();

  // Create short-lived auth token (default ~10 minutes if not provided)
  const authToken = await signer.createAuthTokenWithExpiry();

  // Prepare API client and set authorization header
  const api = new ApiClient({ host: BASE_URL });
  // Some servers treat header name case-insensitively; set common variants
  api.setDefaultHeader('authorization', authToken);
  api.setDefaultHeader('Authorization', authToken);

  // Hitting referral points endpoint
  // Docs: https://apibetadocs.lighter.xyz/reference/referral_points
  // Query params: account_index (required); auth (optional for header-auth clients)
  const params = {
    account_index: ACCOUNT_INDEX,
    auth: authToken
  } as any;

  try {
    const res = await api.get('/api/v1/referral/points', params);
    console.log('✅ Referral points response:');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error('❌ Failed to fetch referral points:', e?.message || String(e));
  } finally {
    await signer.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}


