import { ApiClient, AccountApi, SignerClient, createApiKey } from '../src';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// This is a dummy private key which is registered on Testnet.
// It serves as a good example
const BASE_URL = "https://testnet.zklighter.elliot.ai";
const ETH_PRIVATE_KEY = process.env['PRIVATE_KEY'];
const API_KEY_INDEX = 1;

async function main(): Promise<void> {
  // Verify that the account exists & fetch account index
  const apiClient = new ApiClient({ host: BASE_URL });
  const ethAcc = new ethers.Wallet(ETH_PRIVATE_KEY || "");
  const ethAddress = ethAcc.address;

  try {
    const accountApi = new AccountApi(apiClient);
    const accountsdata = await accountApi.getAccountsByL1Address(ethAddress);
    // @ts-ignore
    const accounts = accountsdata["sub_accounts"]
   
    if (accounts.length > 1) {
      for (const account of accounts) {
        console.log(`found accountIndex: ${account.index}`);
      }
      throw new Error(`found multiple account indexes: ${accounts.length}`);
    } else if (accounts.length === 0) {
      throw new Error(`account not found for ${ethAddress}`);
    } else {
      
      const accountIndex = parseInt(accounts[0]?.index || "0");

      // Create a private/public key pair for the new API key
      // pass any string to be used as seed for createApiKey like
      // createApiKey("Hello world random seed to make things more secure")
      const [privateKey, publicKey, err] = createApiKey("Hello world random seed to make things more secure");
      if (err) {
        throw new Error(err);
      }

      const txClient = new SignerClient({
        url: BASE_URL,
        privateKey: privateKey,
        accountIndex: accountIndex,
        apiKeyIndex: API_KEY_INDEX,
      });

      // Change the API key
      const [, changeErr] = await txClient.changeApiKey({
        ethPrivateKey: ETH_PRIVATE_KEY || "",
        newPubkey: publicKey,
      });
      if (changeErr) {
        throw new Error(changeErr);
      }

      // Wait some time so that we receive the new API key in the response
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Check that the API key changed on the server
      const checkErr = txClient.checkClient();
      if (checkErr) {
        throw new Error(checkErr);
      }

      console.log(`
BASE_URL = '${BASE_URL}'
API_KEY_PRIVATE_KEY = '${privateKey}'
ACCOUNT_INDEX = ${accountIndex}
API_KEY_INDEX = ${API_KEY_INDEX}
      `);

      await txClient.close();
    }

  } catch (e: any) {
    if (e.message === "account not found") {
      console.error(`error: account not found for ${ethAddress}`);
      return;
    } else {
      throw e;
    }
  } finally {
    apiClient.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
} 