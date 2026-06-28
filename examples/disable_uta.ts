import * as dotenv from 'dotenv';
import { SignerClient } from '../src';

dotenv.config();

async function main() {
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const client = new SignerClient({
    url: process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai',
    privateKey: API_PRIVATE_KEY,
    accountIndex: Number(process.env.ACCOUNT_INDEX) || 0,
    apiKeyIndex: Number(process.env.API_KEY_INDEX) || 0,
  });

  await client.initialize();
  await client.ensureWasmClient();

  console.log('Disabling Universal Trading Account (UTA)...');
  const [result, txHash, err] = await client.updateAccountConfig(0);
  if (err) {
    console.error('Error disabling UTA:', err);
  } else {
    console.log('UTA disabled, tx hash:', txHash);
  }

  await client.close();
}

main().catch(console.error);
