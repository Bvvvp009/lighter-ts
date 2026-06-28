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

  const integratorIndex = Number(process.env.INTEGRATOR_INDEX) || 2;

  console.log(`Revoking integrator ${integratorIndex} by setting fees to 0 and expiry to 0...`);
  console.log('Note: You must have previously approved this integrator index. Use INTEGRATOR_INDEX env var.');
  const [result, txHash, err] = await client.approveIntegrator(
    integratorIndex,
    0,
    0,
    0,
    0,
    0
  );

  if (err) {
    console.error('Error revoking integrator:', err);
  } else {
    console.log('Integrator revoked, tx hash:', txHash);
  }

  await client.close();
}

main().catch(console.error);