import * as dotenv from 'dotenv';
import { BridgeApi, ApiClient, SignerClient } from '../src';

dotenv.config();

async function main() {
  const baseUrl = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const apiClient = new ApiClient({ host: baseUrl });
  const bridgeApi = new BridgeApi(apiClient);

  const accountIndex = Number(process.env.ACCOUNT_INDEX) || 0;
  const apiKeyIndex = Number(process.env.API_KEY_INDEX) || 0;
  const apiPrivateKey = process.env.API_PRIVATE_KEY || '';
  const ethAddress = process.env.PRIVATEKEY_ADDRESS || process.env.ETH_ADDRESS || '';

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

  console.log('Getting deposit networks...');
  try {
    const networks = await bridgeApi.depositNetworks();
    console.log('Supported deposit networks:', JSON.stringify(networks, null, 2));
  } catch (error) {
    console.error('Error getting deposit networks:', error instanceof Error ? error.message : error);
  }

  // Create intent address for Arbitrum (chain_id=42161) - requires account
  if (auth && ethAddress) {
    console.log('\nCreating intent address for Arbitrum...');
    try {
      const result = await bridgeApi.createIntentAddress({
        chain_id: 42161,
        from_addr: ethAddress,
        amount: '0',
        account_index: accountIndex,
        is_external_deposit: true,
        authorization: auth,
      });
      console.log('Intent address:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error creating intent address:', error instanceof Error ? error.message : error);
    }
  } else {
    console.log('\nSkipping intent address creation: requires AUTH_TOKEN and ETH_ADDRESS');
  }

  await apiClient.close?.();
}

main().catch(console.error);