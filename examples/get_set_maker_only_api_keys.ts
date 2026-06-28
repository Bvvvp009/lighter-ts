import * as dotenv from 'dotenv';
import { AccountApi, ApiClient, SignerClient } from '../src';

dotenv.config();

async function main() {
  const url = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const apiClient = new ApiClient({ host: url });
  const accountApi = new AccountApi(apiClient);

  const accountIndex = Number(process.env.ACCOUNT_INDEX) || 0;
  const apiKeyIndex = Number(process.env.API_KEY_INDEX) || 0;
  const privateKey = process.env.API_PRIVATE_KEY || '';

  const signer = new SignerClient({ url, privateKey, accountIndex, apiKeyIndex });
  await signer.initialize();
  await signer.ensureWasmClient();
  const auth = await signer.createAuthToken();

  console.log('Getting maker-only API keys...');
  try {
    const result = await accountApi.getMakerOnlyApiKeys(accountIndex, auth);
    console.log('Maker-only API keys:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting maker-only API keys:', error instanceof Error ? error.message : error);
  }

  console.log('Setting maker-only API keys...');
  try {
    const result = await accountApi.setMakerOnlyApiKeys({
      account_index: accountIndex,
      api_key_indices: '0',
      auth,
    });
    console.log('Set maker-only API keys response:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error setting maker-only API keys:', error instanceof Error ? error.message : error);
  }

  await signer.close();
}

main().catch(console.error);
