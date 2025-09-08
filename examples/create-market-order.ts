import { SignerClient } from '../src';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// The API_KEY_PRIVATE_KEY provided belongs to a dummy account registered on Testnet.
// It was generated using the setup_system.py script, and serves as an example.
const BASE_URL = "https://testnet.zklighter.elliot.ai";
const API_KEY_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const ACCOUNT_INDEX = 1146;
const API_KEY_INDEX = 0;

// function trimException(e: any): string {
//   return e.toString().trim().split('\n').pop() || e.toString();
// }

async function main(): Promise<void> {
  if (!API_KEY_PRIVATE_KEY) {
    console.error('PRIVATE_KEY environment variable is required');
    return;
  }

  const client = new SignerClient({
    url: BASE_URL,
    privateKey: API_KEY_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX,
  });

  try {
    const tx = await client.createMarketOrder({
      marketIndex: 0,
      clientOrderIndex: 0,
      baseAmount: 1000, // 0.1 ETH
      avgExecutionPrice: 170000, // $1700
      isAsk: true,
    });

    console.log("Create Order Tx:", tx);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 