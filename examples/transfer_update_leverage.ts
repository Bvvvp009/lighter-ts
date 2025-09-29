import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '10', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '10', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  const apiClient = new ApiClient({ host: BASE_URL });

  await client.initialize();
  await (client as any).ensureWasmClient();

  const [authToken] = await client.createAuthTokenWithExpiry();
  console.log('Auth token created:', authToken);

  const err = client.checkClient();
  if (err) {
    console.error('CheckClient error:', err);
    return;
  }

  const [levTx, levResponse, levErr] = await client.updateLeverage(4, SignerClient.CROSS_MARGIN_MODE, 3);
  console.log('Update Leverage:', { tx: levTx, response: levResponse, err: levErr });

  // Test transfer (requires proper fee calculation)
  const [transferTx, transferResponse, transferErr] = await client.transfer(9, 100);
  console.log('Transfer:', { tx: transferTx, response: transferResponse, err: transferErr });

  await client.close();
  await apiClient.close();
}

if (require.main === module) {
  main().catch(console.error);
}
