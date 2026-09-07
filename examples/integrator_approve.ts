import * as dotenv from 'dotenv';
import { SignerClient, resolveNetworkFromEnv } from '../src';

dotenv.config();

async function main() {
  const API_PRIVATE_KEY = process.env.API_PRIVATE_KEY || '';
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }
  const client = new SignerClient({
    url: resolveNetworkFromEnv().apiUrl,
    privateKey: API_PRIVATE_KEY,
    accountIndex: Number(process.env.ACCOUNT_INDEX) || 0,
    apiKeyIndex: Number(process.env.API_KEY_INDEX) || 0,
  });

  await client.initialize();
  await client.ensureWasmClient();

  const integratorIndex = Number(process.env.INTEGRATOR_INDEX) || 2;
  const ethPrivateKey = process.env.ETH_PRIVATE_KEY || '';

  if (!ethPrivateKey || ethPrivateKey === 'your_ethereum_private_key_here') {
    console.error('ETH_PRIVATE_KEY is required for cross-account integrator approval.');
    console.error('Set it in your .env file.');
    process.exit(1);
  }

  const expiry = Date.now() + 86400 * 30 * 1000; // ApprovalExpiry is a millisecond timestamp

  console.log('Approving integrator (cross-account with L1 signature)...');
  console.log(`Integrator index: ${integratorIndex}`);
  console.log(`Approval expiry: ${expiry}`);

  const [result, txHash, err] = await client.approveIntegrator({
    integratorIndex,
    maxPerpsTakerFee: 1000, // 10 bps (fee units are 1e-6 of trade size)
    maxPerpsMakerFee: 500,  // 5 bps
    maxSpotTakerFee: 1000,
    maxSpotMakerFee: 500,
    approvalExpiry: expiry,
    ethPrivateKey,
  });

  if (err) {
    console.error('Error approving integrator:', err);
  } else {
    console.log('Integrator approved, tx hash:', txHash);
  }

  await client.close();
}

main().catch(console.error);