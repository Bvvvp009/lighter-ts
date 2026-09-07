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
  const expiry = Date.now() + 86400 * 1000; // ApprovalExpiry is a millisecond timestamp

  console.log('Approving integrator (same master account)...');
  const [result, txHash, err] = await client.approveIntegrator({
    integratorIndex,
    maxPerpsTakerFee: 1000, // 10 bps (fee units are 1e-6 of trade size)
    maxPerpsMakerFee: 500,
    maxSpotTakerFee: 1000,
    maxSpotMakerFee: 500,
    approvalExpiry: expiry,
    // Same L1 address -> L2 signature only, no ethPrivateKey needed
  });
  if (err) {
    console.error('Error approving integrator:', err);
  } else {
    console.log('Integrator approved, tx hash:', txHash);
  }

  await client.close();
}

main().catch(console.error);
