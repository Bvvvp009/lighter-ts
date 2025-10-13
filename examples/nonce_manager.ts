import { TransactionApi, ApiClient } from '../src/index';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Nonce Manager Example
 * 
 * This example demonstrates nonce management for:
 * 1. Single API Key - Most common use case
 * 2. Multiple API Keys - Advanced usage for high-frequency trading
 * 
 * Nonces are sequential numbers that prevent replay attacks and ensure
 * transaction ordering. Each API key has its own nonce sequence.
 * 
 * Prerequisites:
 * - API_PRIVATE_KEY in .env (your primary API key)
 * - API_KEY_INDEX in .env (your primary API key index)
 * - ACCOUNT_INDEX in .env (your account index)
 * - BASE_URL in .env (API endpoint)
 * 
 * Optional for multiple keys:
 * - API_PRIVATE_KEY_2, API_KEY_INDEX_2
 * - API_PRIVATE_KEY_3, API_KEY_INDEX_3
 */

const BASE_URL = process.env['BASE_URL'] || 'https://testnet.zklighter.elliot.ai';
const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || '0', 10);

// Primary API Key
const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'];
const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || '0', 10);

// Additional API Keys (optional)
const API_PRIVATE_KEY_2 = process.env['API_PRIVATE_KEY_2'];
const API_KEY_INDEX_2 = parseInt(process.env['API_KEY_INDEX_2'] || '1', 10);

const API_PRIVATE_KEY_3 = process.env['API_PRIVATE_KEY_3'];
const API_KEY_INDEX_3 = parseInt(process.env['API_KEY_INDEX_3'] || '2', 10);

interface NonceInfo {
  apiKeyIndex: number;
  currentNonce: number;
  nextNonce: number;
  totalUsed: number;
}

/**
 * Single API Key Nonce Manager
 * This is the most common use case - managing nonces for one API key
 */
class SingleKeyNonceManager {
  private transactionApi: TransactionApi;
  private accountIndex: number;
  private apiKeyIndex: number;
  private nonceOffset: number = 0;
  private lastFetchedNonce: number = -1;

  constructor(apiClient: ApiClient, accountIndex: number, apiKeyIndex: number) {
    this.transactionApi = new TransactionApi(apiClient);
    this.accountIndex = accountIndex;
    this.apiKeyIndex = apiKeyIndex;
  }

  async getCurrentNonce(): Promise<number> {
    const response = await this.transactionApi.getNextNonce(
      this.accountIndex,
      this.apiKeyIndex
    );
    this.lastFetchedNonce = response.nonce;
    this.nonceOffset = 0;
    return response.nonce;
  }

  async getNextNonce(): Promise<number> {
    if (this.lastFetchedNonce === -1) {
      return await this.getCurrentNonce();
    }
    this.nonceOffset++;
    return this.lastFetchedNonce + this.nonceOffset;
  }

  async refreshNonce(): Promise<number> {
    return await this.getCurrentNonce();
  }

  getInfo(): NonceInfo {
    return {
      apiKeyIndex: this.apiKeyIndex,
      currentNonce: this.lastFetchedNonce,
      nextNonce: this.lastFetchedNonce + this.nonceOffset + 1,
      totalUsed: this.nonceOffset
    };
  }
}

/**
 * Multiple API Keys Nonce Manager
 * Advanced usage for high-frequency trading or load distribution
 */
class MultiKeyNonceManager {
  private apiClient: ApiClient;
  private accountIndex: number;
  private nonceManagers: Map<number, SingleKeyNonceManager> = new Map();

  constructor(apiClient: ApiClient, accountIndex: number) {
    this.apiClient = apiClient;
    this.accountIndex = accountIndex;
  }

  addApiKey(apiKeyIndex: number): void {
    if (!this.nonceManagers.has(apiKeyIndex)) {
      const manager = new SingleKeyNonceManager(
        this.apiClient,
        this.accountIndex,
        apiKeyIndex
      );
      this.nonceManagers.set(apiKeyIndex, manager);
    }
  }

  async getCurrentNonce(apiKeyIndex: number): Promise<number> {
    const manager = this.nonceManagers.get(apiKeyIndex);
    if (!manager) {
      throw new Error(`API key ${apiKeyIndex} not registered`);
    }
    return await manager.getCurrentNonce();
  }

  async getNextNonce(apiKeyIndex: number): Promise<number> {
    const manager = this.nonceManagers.get(apiKeyIndex);
    if (!manager) {
      throw new Error(`API key ${apiKeyIndex} not registered`);
    }
    return await manager.getNextNonce();
  }

  async refreshAllNonces(): Promise<Map<number, number>> {
    const results = new Map<number, number>();
    for (const [apiKeyIndex, manager] of this.nonceManagers.entries()) {
      const nonce = await manager.refreshNonce();
      results.set(apiKeyIndex, nonce);
    }
    return results;
  }

  getAllInfo(): NonceInfo[] {
    const infos: NonceInfo[] = [];
    for (const manager of this.nonceManagers.values()) {
      infos.push(manager.getInfo());
    }
    return infos.sort((a, b) => a.apiKeyIndex - b.apiKeyIndex);
  }

  getApiKeyCount(): number {
    return this.nonceManagers.size;
  }
}

async function main() {
  if (!API_PRIVATE_KEY) {
    console.error('❌ API_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  console.log('🔢 Nonce Manager Example\n');

  const apiClient = new ApiClient({ host: BASE_URL });

  // ===================================================================
  // PART 1: SINGLE API KEY NONCE MANAGEMENT (Most Common Use Case)
  // ===================================================================
  console.log('📍 PART 1: Single API Key Nonce Management\n');

  const singleKeyManager = new SingleKeyNonceManager(
    apiClient,
    ACCOUNT_INDEX,
    API_KEY_INDEX
  );

  const currentNonce = await singleKeyManager.getCurrentNonce();
  console.log(`Current nonce for API Key #${API_KEY_INDEX}: ${currentNonce}`);

  console.log('\nNext 3 sequential nonces:');
  for (let i = 1; i <= 3; i++) {
    const nextNonce = await singleKeyManager.getNextNonce();
    console.log(`  Transaction ${i}: ${nextNonce}`);
  }

  const info = singleKeyManager.getInfo();
  console.log('\nNonce Status:');
  console.log(`  API Key: ${info.apiKeyIndex}`);
  console.log(`  Base: ${info.currentNonce}`);
  console.log(`  Next: ${info.nextNonce}`);
  console.log(`  Used: ${info.totalUsed}`);

  // ===================================================================
  // PART 2: MULTIPLE API KEYS NONCE MANAGEMENT (Advanced Use Case)
  // ===================================================================
  console.log('\n\n📍 PART 2: Multiple API Keys Nonce Management\n');

  const multiKeyManager = new MultiKeyNonceManager(apiClient, ACCOUNT_INDEX);

  // Add primary key
  multiKeyManager.addApiKey(API_KEY_INDEX);

  // Add additional keys if available
  const additionalKeys: Array<{ key: string | undefined; index: number }> = [
    { key: API_PRIVATE_KEY_2, index: API_KEY_INDEX_2 },
    { key: API_PRIVATE_KEY_3, index: API_KEY_INDEX_3 }
  ];

  for (const { key, index } of additionalKeys) {
    if (key) {
      multiKeyManager.addApiKey(index);
    }
  }

  console.log(`Registered ${multiKeyManager.getApiKeyCount()} API key(s)`);

  const allNonces = await multiKeyManager.refreshAllNonces();
  console.log('\nCurrent nonces:');
  for (const [apiKeyIndex, nonce] of allNonces.entries()) {
    console.log(`  API Key #${apiKeyIndex}: ${nonce}`);
  }

  console.log('\nSimulating parallel transactions:');
  
  // Key 1: Transaction sequence
  console.log(`  API Key #${API_KEY_INDEX}:`);
  for (let i = 1; i <= 2; i++) {
    const nonce = await multiKeyManager.getNextNonce(API_KEY_INDEX);
    console.log(`    TX ${i}: ${nonce}`);
  }

  // Key 2: Transaction sequence (if available)
  if (API_PRIVATE_KEY_2) {
    console.log(`  API Key #${API_KEY_INDEX_2}:`);
    for (let i = 1; i <= 2; i++) {
      const nonce = await multiKeyManager.getNextNonce(API_KEY_INDEX_2);
      console.log(`    TX ${i}: ${nonce}`);
    }
  }

  const allInfo = multiKeyManager.getAllInfo();
  console.log('\nAll Keys Status:');
  console.log('┌───────────┬────────────┬──────────┬──────┐');
  console.log('│ API Key # │ Base Nonce │ Next     │ Used │');
  console.log('├───────────┼────────────┼──────────┼──────┤');
  for (const info of allInfo) {
    const keyIdx = info.apiKeyIndex.toString().padEnd(9);
    const baseNonce = info.currentNonce.toString().padEnd(10);
    const nextNonce = info.nextNonce.toString().padEnd(8);
    const used = info.totalUsed.toString().padEnd(4);
    console.log(`│ ${keyIdx} │ ${baseNonce} │ ${nextNonce} │ ${used} │`);
  }
  console.log('└───────────┴────────────┴──────────┴──────┘');

  // Clean up
  await apiClient.close();
}

main().catch(console.error);

