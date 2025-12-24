/**
 * COMPLETE ONBOARDING FLOW - NEW USER ONBOARDING
 * 
 * ⚠️  WARNING: This script uses REAL FUNDS. Test carefully!
 * 
 * Complete onboarding flow for a NEW address:
 * 1. Get intent address (works without account - no auth needed)
 * 2. Deposit via direct (Ethereum) or indirect (external chain using intent address)
 * 3. Wait for deposit confirmation and account creation
 * 4. Fetch account details (index, balance)
 * 5. Generate and optionally register API keys
 * 6. Get intent addresses for all supported chains
 * 7. Save complete configuration to JSON file
 * 
 * Supports two deposit methods:
 * - DIRECT: Deposit USDC via Ethereum mainnet (creates account automatically)
 * - INDIRECT: Get intent address, deposit USDC on external chain (Arbitrum/Base/etc)
 * 
 * Required .env variables:
 * - ETH_PRIVATE_KEY: Your Ethereum private key
 * - DEPOSIT_METHOD: "direct" or "indirect" (default: "direct")
 * 
 * For DIRECT deposit:
 * - L1_RPC_URL: Ethereum mainnet RPC
 * - DEPOSIT_AMOUNT: USDC amount (default: 6)
 * 
 * For INDIRECT deposit:
 * - CHAIN_ID: Chain ID (42161=Arbitrum, 8453=Base, 43114=Avalanche, 999=HyperEVM, 101=Solana)
 * 
 * For API Keys (optional):
 * - API_KEY_INDEX: Starting index (default: 4)
 * - NUM_API_KEYS: Number to generate (default: 1)
 * - API_PRIVATE_KEY: Optional - existing API key for auto-registering new keys
 * - AUTH_API_KEY_INDEX: Index of API key used for auth (default: 0)
 * 
 * Output:
 * - Saves configuration to api_key_config.json with account details, API keys, and intent addresses
 * 
 * Usage:
 *   npx ts-node examples/onboarding.ts
 */

import { SignerClient, ApiClient, AccountApi } from '../src';
import { createWasmSignerClient } from '../src/signer/wasm-signer';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const ETH_PRIVATE_KEY = process.env['ETH_PRIVATE_KEY'] || '';
const DEPOSIT_METHOD = (process.env['DEPOSIT_METHOD'] || 'direct').toLowerCase();
const DEPOSIT_AMOUNT = parseFloat(process.env['DEPOSIT_AMOUNT'] || '6');
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '4', 10);
const NUM_API_KEYS = parseInt(process.env['NUM_API_KEYS'] || '1', 10);
const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || ''; // Optional: only needed for registering new keys
const AUTH_API_KEY_INDEX = parseInt(process.env['AUTH_API_KEY_INDEX'] || '0', 10); // Index of API key used for auth
const CHAIN_ID = process.env['CHAIN_ID'] ? parseInt(process.env['CHAIN_ID'], 10) : 42161;
const OUTPUT_FILE = process.env['OUTPUT_FILE'] || 'api_key_config.json';

const ZKLIGHTER_CONTRACT = '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7';
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const L1_RPC_URL = process.env['L1_RPC_URL'] || '';

const ZKLIGHTER_ABI = ['function deposit(address, uint16, uint8, uint256) external'] as const;
const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function allowance(address owner, address spender) external view returns (uint256)'
] as const;

const ASSET_INDEX_USDC = 3;
const ROUTE_TYPE_PERP = 0;

const SUPPORTED_CHAINS: Record<number, string> = {
  42161: 'Arbitrum',
  8453: 'Base',
  43114: 'Avalanche',
  999: 'HyperEVM',
  101: 'Solana'
};

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
}

function saveConfig(
  accountIndex: number,
  l1Address: string,
  l2Address: string,
  privateKeys: Record<number, string>,
  intentAddresses?: Record<number, string>
): void {
  const config = {
    base_url: BASE_URL,
    account_index: accountIndex,
    l1_address: l1Address,
    l2_address: l2Address,
    api_keys: Object.fromEntries(
      Object.entries(privateKeys).map(([idx, key]) => [idx, { private_key: key, api_key_index: parseInt(idx, 10) }])
    ),
    ...(intentAddresses && { intent_addresses: intentAddresses }),
    created_at: new Date().toISOString()
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(config, null, 2));
}

async function getAccount(l1Address: string): Promise<{ accountIndex: number; l2Address: string; availableBalance: string } | null> {
  try {
    const apiClient = new ApiClient({ host: BASE_URL });
    const accountApi = new AccountApi(apiClient);
    const checksummed = ethers.getAddress(l1Address);
    
    const response = await (await import('axios')).default.get(
      `${BASE_URL}/api/v1/account?by=l1_address&value=${checksummed}`,
      { headers: { 'accept': 'application/json' } }
    );
    
    await apiClient.close();
    
    if (response.data?.code === 200 && response.data.accounts?.length > 0) {
      const acc = response.data.accounts.reduce((min: any, a: any) => {
        const minIdx = parseInt(min.index || min.account_index || '0', 10);
        const aIdx = parseInt(a.index || a.account_index || '0', 10);
        return aIdx < minIdx ? a : min;
      });
      
      const idx = parseInt(acc.index || acc.account_index || '0', 10);
      if (idx === 0) return null;
      
      return {
        accountIndex: idx,
        l2Address: acc.l2_address || checksummed,
        availableBalance: acc.available_balance || '0'
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function depositDirect(l1Address: string): Promise<{ success: boolean; txHash?: string }> {
  if (!L1_RPC_URL) {
    console.error('❌ L1_RPC_URL required');
    return { success: false };
  }

  try {
    const provider = new ethers.JsonRpcProvider(L1_RPC_URL);
    const wallet = new ethers.Wallet(ETH_PRIVATE_KEY, provider);
    const usdc = new ethers.Contract(USDC_CONTRACT, USDC_ABI, provider);
    const zkLighter = new ethers.Contract(ZKLIGHTER_CONTRACT, ZKLIGHTER_ABI, provider);
    const usdcWithSigner = usdc.connect(wallet);
    const zkLighterWithSigner = zkLighter.connect(wallet);

    const decimals = await (usdcWithSigner as any).decimals();
    const amountInUnits = ethers.parseUnits(DEPOSIT_AMOUNT.toString(), decimals);
    const balance = await (usdcWithSigner as any).balanceOf(wallet.address);

    if (balance < amountInUnits) {
      console.error(`❌ Insufficient balance`);
      return { success: false };
    }

    const allowance = await (usdcWithSigner as any).allowance(wallet.address, ZKLIGHTER_CONTRACT);
    if (allowance < amountInUnits) {
      const approveTx = await (usdcWithSigner as any).approve(ZKLIGHTER_CONTRACT, amountInUnits);
      await approveTx.wait();
    }

    const confirm = await askQuestion(`Deposit ${DEPOSIT_AMOUNT} USDC? Type "CONFIRM": `);
    if (confirm !== 'CONFIRM') {
      return { success: false };
    }

    const tx = await (zkLighterWithSigner as any).deposit(
      l1Address,
      ASSET_INDEX_USDC,
      ROUTE_TYPE_PERP,
      amountInUnits
    );
    
    await tx.wait();
    return { success: true, txHash: tx.hash };
  } catch (error: any) {
    console.error(`❌ Deposit failed: ${error.message}`);
    return { success: false };
  }
}

async function getIntentAddress(l1Address: string, chainId: number, accountIndex?: number): Promise<string | null> {
  try {
    const axios = (await import('axios')).default;
    const params = new URLSearchParams({
      chain_id: chainId.toString(),
      from_addr: l1Address,
      amount: '0',
      is_external_deposit: 'true'
    }).toString();
    
    // Try without auth first (works even without account)
    try {
      const response = await axios.post(
        `${BASE_URL}/api/v1/createIntentAddress`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
          }
        }
      );
      
      if (response.data?.intent_address) {
        return response.data.intent_address;
      }
    } catch (error: any) {
      // If no-auth fails and we have API key, try with auth
      if (API_PRIVATE_KEY && accountIndex !== undefined) {
        const signer = new SignerClient({
          url: BASE_URL,
          privateKey: API_PRIVATE_KEY,
          accountIndex,
          apiKeyIndex: AUTH_API_KEY_INDEX
        });
        
        await signer.initialize();
        await signer.ensureWasmClient();
        const authToken = await signer.createAuthTokenWithExpiry();
        
        const authResponse = await axios.post(
          `${BASE_URL}/api/v1/createIntentAddress`,
          params,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              'Authorization': authToken,
              'auth': authToken
            }
          }
        );
        
        if (signer.close) await signer.close();
        
        if (authResponse.data?.intent_address) {
          return authResponse.data.intent_address;
        }
      }
      
      throw error;
    }
    
    return null;
  } catch (error: any) {
    console.error(`❌ Failed: ${error.message}`);
    return null;
  }
}

async function getAllIntentAddresses(l1Address: string, accountIndex?: number): Promise<Record<number, string>> {
  const addresses: Record<number, string> = {};

  for (const [chainIdStr] of Object.entries(SUPPORTED_CHAINS)) {
    const chainId = parseInt(chainIdStr, 10);
    const addr = await getIntentAddress(l1Address, chainId, accountIndex);
    if (addr) {
      addresses[chainId] = addr;
    }
  }
  
  return addresses;
}

async function generateAPIKeys(accountIndex: number): Promise<Record<number, string>> {
  const configPath = OUTPUT_FILE;
  if (fs.existsSync(configPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (existing.api_keys && Object.keys(existing.api_keys).length > 0) {
        return Object.fromEntries(
          Object.entries(existing.api_keys).map(([idx, key]: [string, any]) => [idx, key.private_key])
        );
      }
    } catch {}
  }

  const wasm = await createWasmSignerClient({ wasmPath: 'wasm/lighter-signer.wasm' });
  await wasm.initialize();

  const privateKeys: Record<number, string> = {};
  const publicKeys: string[] = [];

  for (let i = 0; i < NUM_API_KEYS; i++) {
    const idx = API_KEY_INDEX + i;
    const pair = await wasm.generateAPIKey(idx.toString());
    privateKeys[idx] = pair.privateKey;
    publicKeys.push(pair.publicKey);
  }

  // If no API key provided, just generate and return (user can register via frontend later)
  if (!API_PRIVATE_KEY) {
    return privateKeys;
  }

  // Register API keys using existing API key
  const signer = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex,
    apiKeyIndex: AUTH_API_KEY_INDEX
  });

  await signer.initialize();
  await signer.ensureWasmClient();

  for (let i = 0; i < NUM_API_KEYS; i++) {
    const idx = API_KEY_INDEX + i;
    const [result, txHash, error] = await signer.changeApiKey({
      ethPrivateKey: ETH_PRIVATE_KEY,
      newPubkey: publicKeys[i],
      newPrivateKey: privateKeys[idx],
      newApiKeyIndex: idx
    });

    if (error) {
      if (error.includes('already')) {
        // Key already exists - this is fine, skip
        continue;
      }
      console.error(`❌ Key ${idx}: ${error}`);
    }
  }

  if (signer.close) await signer.close();

  return privateKeys;
}

async function main() {
  if (!ETH_PRIVATE_KEY) {
    console.error('❌ ETH_PRIVATE_KEY required');
    return;
  }

  if (DEPOSIT_METHOD !== 'direct' && DEPOSIT_METHOD !== 'indirect') {
    console.error('❌ DEPOSIT_METHOD must be "direct" or "indirect"');
    return;
  }

  try {
    const wallet = new ethers.Wallet(ETH_PRIVATE_KEY);
    const l1Address = wallet.address;
    
    let account = await getAccount(l1Address);

    if (DEPOSIT_METHOD === 'direct') {
      // DIRECT: Deposit via Ethereum, wait for account creation
      if (!account) {
        const result = await depositDirect(l1Address);
        if (!result.success) {
          console.error('❌ Deposit failed');
          return;
        }

        console.log('Waiting for account creation...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        for (let i = 0; i < 10; i++) {
          account = await getAccount(l1Address);
          if (account) break;
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        if (!account) {
          console.error('❌ Account not found after deposit');
          return;
        }
      }
    } else {
      // INDIRECT: Get intent address first (no account needed), then wait for deposit
      const chainName = SUPPORTED_CHAINS[CHAIN_ID] || `Chain ${CHAIN_ID}`;
      const intentAddr = await getIntentAddress(l1Address, CHAIN_ID);
      if (!intentAddr) {
        console.error('❌ Failed to get intent address');
        return;
      }

      console.log(`Intent Address (${chainName}): ${intentAddr}`);
      console.log(`\n💡 Send USDC to this address on ${chainName}`);
      console.log(`   Waiting for deposit and account creation...\n`);

      // Wait for account to be created after deposit
      if (!account) {
        for (let i = 0; i < 30; i++) {
          account = await getAccount(l1Address);
          if (account) break;
          if (i % 3 === 0) console.log(`   Checking... (${Math.floor((i + 1) * 10 / 60)}m elapsed)`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }

        if (!account) {
          console.error('❌ Account not found after deposit');
          console.error('   Please verify the deposit was successful');
          return;
        }
      }
    }

    if (!account) {
      console.error('❌ No account available');
      return;
    }

    console.log(`✅ Account found: ${account.accountIndex}`);
    console.log(`   Balance: ${account.availableBalance} USDC\n`);

    const apiKeys = await generateAPIKeys(account.accountIndex);
    
    // Get intent addresses (works without auth for most chains)
    const intentAddresses = await getAllIntentAddresses(l1Address, account.accountIndex);

    saveConfig(account.accountIndex, l1Address, account.l2Address, apiKeys, intentAddresses);

    console.log(`✅ Onboarding complete`);
    console.log(`   Account: ${account.accountIndex}`);
    console.log(`   Balance: ${account.availableBalance} USDC`);
    console.log(`   API Keys: ${Object.keys(apiKeys).length} generated`);
    console.log(`   Config: ${OUTPUT_FILE}`);
    
    if (!API_PRIVATE_KEY && Object.keys(apiKeys).length > 0) {
      console.log(`\n💡 API keys generated but not registered`);
      console.log(`   Register the first key via frontend, then use API_PRIVATE_KEY for subsequent keys`);
    }
    
    if (Object.keys(intentAddresses).length > 0) {
      console.log(`\n🌐 Intent addresses: ${Object.keys(intentAddresses).length} chains available`);
    }

  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    if (error.stack) console.error(error.stack);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as onboarding };
