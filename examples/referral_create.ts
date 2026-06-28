import * as dotenv from 'dotenv';
import { ReferralApi, ApiClient, SignerClient } from '../src';

dotenv.config();

async function main() {
  const baseUrl = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const apiClient = new ApiClient({ host: baseUrl });
  const referralApi = new ReferralApi(apiClient);

  const accountIndex = Number(process.env.ACCOUNT_INDEX) || 0;
  const apiKeyIndex = Number(process.env.API_KEY_INDEX) || 0;
  const apiPrivateKey = process.env.API_PRIVATE_KEY || '';

  // Generate auth token if API key is available
  let auth = '';
  if (apiPrivateKey) {
    try {
      const signerClient = new SignerClient({
        url: baseUrl,
        privateKey: apiPrivateKey,
        accountIndex,
        apiKeyIndex,
      });
      await signerClient.initialize();
      await signerClient.ensureWasmClient();
      auth = await signerClient.createAuthTokenWithExpiry(8 * 60 * 60);
      console.log('Auth token generated');
      await signerClient.close();
    } catch (error) {
      console.error('Error generating auth token:', error instanceof Error ? error.message : error);
    }
  }

  console.log('Creating referral code...');
  try {
    const result = await referralApi.referralCreate({
      account_index: accountIndex,
      authorization: auth,
    });
    console.log('Referral created:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error creating referral:', error instanceof Error ? error.message : error);
  }

  console.log('Getting referral info...');
  try {
    const result = await referralApi.referralGet({
      account_index: accountIndex,
      authorization: auth,
    });
    console.log('Referral info:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting referral:', error instanceof Error ? error.message : error);
  }

  await apiClient.close?.();
}

main().catch(console.error);