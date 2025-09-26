import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const API_KEY_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('API_PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
    wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
  });

  await client.initialize();
  await (client as any).ensureWasmClient();

  // Create market order with maximum slippage limit
  const [tx, txHash, err] = await client.createMarketOrder_maxSlippage({
    marketIndex: 0,
    clientOrderIndex: Date.now(),
    baseAmount: 1000000, // 0.001 ETH (in wei scale)
    maxSlippage: 0.01, // 1% max slippage
    isAsk: true, // Sell order
  });

  console.log('Create Market Order with Price Limit:', { tx, txHash, err });
  await client.close();
}

if (require.main === module) {
  main().catch(console.error);
}
