import * as dotenv from 'dotenv';
import { SignerClient, InfoApi, ApiClient } from '../src';

dotenv.config();

async function main() {
  const BASE_URL = process.env.BASE_URL || 'https://mainnet.zklighter.elliot.ai';
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  const apiClient = new ApiClient({ host: BASE_URL });
  const infoApi = new InfoApi(apiClient);

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: Number(process.env.ACCOUNT_INDEX) || 0,
    apiKeyIndex: Number(process.env.API_KEY_INDEX) || 0,
  });

  await client.initialize();
  await client.ensureWasmClient();

  const toAccountIndex = Number(process.env.TO_ACCOUNT_INDEX) || 1;
  const usdcAmount = 10;
  const ROUTE_PERP = 0;
  const ROUTE_SPOT = 1;

  const authToken = await client.createAuthTokenWithExpiry(8 * 60 * 60);

  console.log('Checking transfer fee...');
  try {
    const feeInfo = await infoApi.getTransferFeeInfo(
      Number(process.env.ACCOUNT_INDEX) || 0,
      toAccountIndex,
      authToken
    );
    console.log('Transfer fee info:', JSON.stringify(feeInfo, null, 2));
  } catch (error) {
    console.error('Error getting transfer fee:', error instanceof Error ? error.message : error);
  }

  console.log(`Transferring ${usdcAmount} USDC to account ${toAccountIndex} (same master account)...`);
  const [result, txHash, err] = await client.transferSameMasterAccount({
    toAccountIndex,
    usdcAmount,
    fee: 0,
    memo: '00000000000000000000000000000000',
  });

  if (err) {
    console.error('Transfer error:', err);
  } else {
    console.log('Transfer successful, tx hash:', txHash);
  }

  await client.close();
}

main().catch(console.error);