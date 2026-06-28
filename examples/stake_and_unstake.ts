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

  const STAKING_POOL_INDEX = 281474976624800;

  console.log('Staking assets into pool...');
  const [stakeResult, stakeHash, stakeErr] = await client.stakeAssets(
    STAKING_POOL_INDEX,
    1000000
  );
  if (stakeErr) {
    console.error('Stake error:', stakeErr);
  } else {
    console.log('Assets staked, tx hash:', stakeHash);
  }

  console.log('Unstaking assets from pool...');
  const [unstakeResult, unstakeHash, unstakeErr] = await client.unstakeAssets(
    STAKING_POOL_INDEX,
    500000
  );
  if (unstakeErr) {
    console.error('Unstake error:', unstakeErr);
  } else {
    console.log('Assets unstaked, tx hash:', unstakeHash);
  }

  await client.close();
}

main().catch(console.error);