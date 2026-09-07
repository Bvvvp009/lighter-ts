import * as dotenv from 'dotenv';
import { TokenlistApi, ApiClient, resolveNetworkFromEnv } from '../src';

dotenv.config();

async function main() {
  const apiClient = new ApiClient({ host: resolveNetworkFromEnv().apiUrl });
  const tokenlistApi = new TokenlistApi(apiClient);

  console.log('Getting token list...');
  try {
    const result = await tokenlistApi.getTokenlist();
    console.log('Tokens:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error getting token list:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
