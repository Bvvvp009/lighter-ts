import { SignerClient } from '../src/signer/wasm-signer-client';
import { ApiClient } from '../src/api/api-client';
import { AccountApi } from '../src/api/account-api';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || '1234567812345678123456781234567812345678123456781234567812345678';
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '3', 10);

async function main(): Promise<void> {

  // Verify that the account exists & fetch account index
  const apiClient = new ApiClient({ host: BASE_URL });
  const wallet = new ethers.Wallet(ETH_PRIVATE_KEY);
  const ethAddress = wallet.address;

  try {
    const accountApi = new AccountApi(apiClient);
    const response = await accountApi.getAccountsByL1Address(ethAddress);
    
    let accountIndex: number;
    if (response && response.length > 1) {
      for (const account of response) {
        console.log(`Found accountIndex: ${account.index}`);
      }
      console.log('Multiple accounts found, using the first one');
      accountIndex = parseInt(response[0]!.index, 10);
    } else if (response && response.length === 1) {
      accountIndex = parseInt(response[0]!.index, 10);
    } else {
      throw new Error('No accounts found for this L1 address');
    }

    // Create a SignerClient first
    const txClient = new SignerClient({
      url: BASE_URL,
      privateKey: ETH_PRIVATE_KEY,
      accountIndex: accountIndex,
      apiKeyIndex: API_KEY_INDEX    
      });

    await txClient.initialize();
    await (txClient as any).ensureWasmClient();

    // Create a private/public key pair for the new API key
    const apiKeyResult = await txClient.generateAPIKey();
    if (!apiKeyResult) {
      throw new Error('Failed to generate API key');
    }
    const { privateKey, publicKey } = apiKeyResult;

    // Change the API key
    const [, err] = await txClient.changeApiKey({
      ethPrivateKey: ETH_PRIVATE_KEY,
      newPubkey: publicKey,
    });

    if (err) {
      throw new Error(err);
    }

    // Wait some time so that we receive the new API key in the response
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check that the API key changed on the server
    const checkErr = txClient.checkClient();
    if (checkErr) {
      throw new Error(checkErr);
    }
    
    await txClient.close();
    await apiClient.close();

  } catch (error: any) {
    if (error.message === 'account not found') {
      console.error(`Error: account not found for ${ethAddress}`);
      return;
    } else {
      throw error;
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}