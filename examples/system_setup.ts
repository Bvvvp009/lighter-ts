/**
 * System Setup - Generate and Register API Key
 * 
 * This script automatically:
 * - Detects your account from your ETH private key
 * - Finds the next available API key index
 * - Generates a new random API key pair
 * - Registers it on-chain
 * 
 * Requirements:
 * - ETH_PRIVATE_KEY in .env (your Ethereum wallet private key)
 * - BASE_URL (optional, defaults to mainnet)
 * - API_KEY_INDEX (optional, auto-selects next available)
 */
import { ApiClient } from '../src/api/api-client';
import { AccountApi } from '../src/api/account-api';
import { TransactionApi } from '../src/api/transaction-api';
import { SignerClient } from '../src/signer/wasm-signer-client';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';
const ETH_PRIVATE_KEY_RAW = process.env['ETH_PRIVATE_KEY'];
const REQUESTED_API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

if (!ETH_PRIVATE_KEY_RAW) {
  console.error('❌ ETH_PRIVATE_KEY required');
  process.exit(1);
}

const ETH_PRIVATE_KEY: string = ETH_PRIVATE_KEY_RAW;

async function main(): Promise<void> {
  console.log('🚀 Lighter API Key Auto-Setup\n');
  console.log('═'.repeat(80));

  const apiClient = new ApiClient({ host: BASE_URL });
  const wallet = new ethers.Wallet(ETH_PRIVATE_KEY);
  const ethAddress = wallet.address;

  console.log('\n📍 Your ETH Address:', ethAddress);
  console.log('📍 Requested API Key Index:', REQUESTED_API_KEY_INDEX);
  console.log('📍 Network:', BASE_URL, '\n');

  try {
    // Step 1: Find ALL accounts for this ETH address
    console.log('🔍 Finding your accounts...');
    const accountApi = new AccountApi(apiClient);
    const response = await accountApi.getAccountsByL1Address(ethAddress);
    const accounts = (response as any).sub_accounts || response;
    
    if (!accounts || accounts.length === 0) {
      throw new Error(`No accounts found for ${ethAddress}\nCreate an account at https://app.lighter.xyz first`);
    }

    console.log(`✅ Found ${accounts.length} account(s):`);
    accounts.forEach((acc: any, i: number) => {
      console.log(`   ${i + 1}. Account Index: ${acc.index}, Type: ${acc.account_type === 0 ? 'Master' : 'Sub'}`);
    });

    // Use first master account
    const masterAccount = accounts.find((acc: any) => acc.account_type === 0 || acc.account_type === '0');
    const accountIndex = parseInt(masterAccount?.index || accounts[0].index, 10);
    
    console.log(`\n✅ Using Account: ${accountIndex}`);

    // Verify account details
    const accountData = await accountApi.getAccount({ by: 'index', value: accountIndex.toString() });
    const account = (accountData as any).accounts?.[0] || accountData;
    console.log(`   L1 Address: ${account.l1_address}`);
    console.log(`   Collateral: ${account.collateral || '0'} USDC\n`);

    // Step 2: Check existing API keys
    console.log('📝 Checking existing API keys...');
    const transactionApi = new TransactionApi(apiClient);
    
    const existingKeys: number[] = [];
    for (let i = 0; i <= 20; i++) {
      try {
        const nonceResult = await transactionApi.getNextNonce(accountIndex, i);
        if (nonceResult.nonce !== undefined) {
          existingKeys.push(i);
        }
      } catch {
        // Key doesn't exist
      }
    }
    
    console.log('✅ Existing keys:', existingKeys.length > 0 ? existingKeys.join(', ') : 'None');

    // Determine target index
    let targetIndex = REQUESTED_API_KEY_INDEX;
    if (existingKeys.includes(targetIndex)) {
      console.log(`⚠️  Index ${targetIndex} already exists, using next available...`);
      targetIndex = existingKeys.length > 0 ? Math.max(...existingKeys) + 1 : 0;
    }
    
    console.log(`✅ Will register NEW key at index: ${targetIndex}\n`);

    // Step 3: Generate NEW API key pair
    console.log('📝 Generating NEW API key pair...');
    
    const tempSigner = new SignerClient({
      url: BASE_URL,
      privateKey: '0'.repeat(80),
      accountIndex,
      apiKeyIndex: 0,
      wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
    });
    
    await tempSigner.initialize();
    await tempSigner.ensureWasmClient();
    
    const keyPair = await tempSigner.generateAPIKey();
    if (!keyPair) {
      throw new Error('Failed to generate key');
    }
    
    console.log(`✅ Private Key: ${keyPair.privateKey.substring(0, 20)}...${keyPair.privateKey.substring(60)} (80 chars)`);
    console.log(`✅ Public Key: ${keyPair.publicKey.substring(0, 20)}...${keyPair.publicKey.substring(60)} (80 chars)\n`);
    
    await tempSigner.close();

    // Step 4: Create SignerClient with NEW key (Python approach)
    console.log(`📝 Creating SignerClient with NEW key at index ${targetIndex}...`);
    
    const newKeySigner = new SignerClient({
      url: BASE_URL,
      privateKey: keyPair.privateKey,
      accountIndex,
      apiKeyIndex: targetIndex,
      wasmConfig: { wasmPath: 'wasm/lighter-signer.wasm' }
    });
    
    await newKeySigner.initialize();
    await newKeySigner.ensureWasmClient();
    console.log('✅ SignerClient ready\n');

    // Step 5: Register (verify ETH address matches!)
    console.log('📝 Registering API key on-chain...');
    console.log(`   ⚠️  CRITICAL: ETH signature will be from: ${ethAddress}`);
    console.log(`   ⚠️  Account expects signature from: ${account.l1_address}`);
    
    if (ethAddress.toLowerCase() !== account.l1_address.toLowerCase()) {
      console.error(`\n❌ ADDRESS MISMATCH!`);
      console.error(`   Your ETH_PRIVATE_KEY derives to: ${ethAddress}`);
      console.error(`   Account ${accountIndex} is registered to: ${account.l1_address}`);
      console.error(`\n   You need the ETH private key for ${account.l1_address}`);
      console.error(`   Update ETH_PRIVATE_KEY in .env with the correct key!\n`);
      process.exit(1);
    }
    
    console.log(`   ✅ Addresses match!\n`);
    
    const [_response, txHash, error] = await newKeySigner.changeApiKey({
      ethPrivateKey: ETH_PRIVATE_KEY,
      newPubkey: keyPair.publicKey,
      newApiKeyIndex: targetIndex
    });

    if (error) {
      throw new Error(`Registration failed: ${error}`);
    }

    console.log(`✅ Registered! TX Hash: ${txHash}\n`);
    console.log('⏳ Waiting 10 seconds for confirmation...\n');
    await new Promise(r => setTimeout(r, 10000));

    console.log('═'.repeat(80));
    console.log('\n🎉 SUCCESS! API Key Registered\n');
    console.log('💾 Save to your .env:\n');
    console.log(`API_PRIVATE_KEY=${keyPair.privateKey}`);
    console.log(`API_KEY_INDEX=${targetIndex}`);
    console.log(`ACCOUNT_INDEX=${accountIndex}`);
    console.log(`BASE_URL=${BASE_URL}\n`);
    
    await newKeySigner.close();
    await apiClient.close();

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

