import * as dotenv from 'dotenv';
import { AccountApi, ApiClient, SignerClient } from '../src';

dotenv.config();

async function main() {
  const baseUrl = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const apiClient = new ApiClient({ host: baseUrl });
  const accountApi = new AccountApi(apiClient);

  const accountIndex = Number(process.env.ACCOUNT_INDEX) || 0;
  const apiKeyIndex = Number(process.env.API_KEY_INDEX) || 0;
  const apiPrivateKey = process.env.API_PRIVATE_KEY || '';

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

  console.log('Creating RFQ...');
  try {
    const result = await accountApi.rfqCreate({
      account_index: accountIndex,
      market_id: 0,
      side: 'buy',
      size: '1000000',
      authorization: auth,
    });
    console.log('RFQ created:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error creating RFQ:', error instanceof Error ? error.message : error);
  }

  console.log('Listing RFQs...');
  try {
    const result = await accountApi.rfqList({
      account_index: accountIndex,
      limit: 10,
      authorization: auth,
    });
    console.log('RFQ list:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error listing RFQs:', error instanceof Error ? error.message : error);
  }

  await apiClient.close?.();
}

main().catch(console.error);