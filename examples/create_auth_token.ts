/**
 * Example: Create Auth Token
 * Demonstrates creating authentication tokens for API requests
 */

import { SignerClient } from '../src';
import dotenv from 'dotenv';

dotenv.config();

async function createAuthToken() {
  console.log('Creating Auth Token...');

  // Use hardcoded values for testing (similar to Python SDK example)
  const API_PRIVATE_KEY = process.env['API_PRIVATE_KEY'] || "";
  const ACCOUNT_INDEX = parseInt(process.env['ACCOUNT_INDEX'] || "52548");
  const API_KEY_INDEX = parseInt(process.env['API_KEY_INDEX'] || "4");
  const BASE_URL = process.env['BASE_URL'] || 'https://mainnet.zklighter.elliot.ai';

  // Validate required environment variables
  if (!API_PRIVATE_KEY) {
    throw new Error('API_PRIVATE_KEY environment variable is required');
  }

  const signerClient = new SignerClient({
    url: BASE_URL,
    privateKey: API_PRIVATE_KEY,
    accountIndex: ACCOUNT_INDEX,
    apiKeyIndex: API_KEY_INDEX
  });

  await signerClient.initialize();
  await signerClient.ensureWasmClient();

  try {
    // Create short-lived auth token (default ~10 minutes)
    const authToken = await signerClient.createAuthToken();
    console.log(`Auth token created: ${authToken.substring(0, 50)}...`);
    
    // Create custom duration token (1 hour)
    const oneHourInSeconds = 60 * 60;
    const longToken = await signerClient.createAuthTokenWithExpiry(oneHourInSeconds);
    console.log(`1-hour token created: ${longToken.substring(0, 50)}...`);

    console.log('Auth tokens created successfully');

  } catch (error) {
    console.error('Error creating auth token:', error);
  }
}

// Run the example
if (require.main === module) {
  createAuthToken().catch(console.error);
}

export { createAuthToken };
