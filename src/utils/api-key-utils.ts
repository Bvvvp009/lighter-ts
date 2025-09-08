import { ethers } from 'ethers';
import crypto from 'crypto';

export interface ApiKeyPair {
  privateKey: string;
  publicKey: string;
}

export function createApiKey(seed?: string): [string, string, string | null] {
  try {
    // Generate a random seed if none provided
    const randomSeed = seed || crypto.randomBytes(32).toString('hex');
    
    // Create a deterministic wallet from the seed
    const wallet = ethers.Wallet.fromPhrase(randomSeed);
    
    // The private key is the wallet's private key
    const privateKey = wallet.privateKey;
    
    // The public key is the wallet's address (for this implementation)
    // In a real implementation, you might want to derive the actual public key
    const publicKey = wallet.address;
    
    return [privateKey, publicKey, null];
  } catch (error) {
    return ['', '', error instanceof Error ? error.message : 'Unknown error'];
  }
}

export function generateRandomSeed(): string {
  return crypto.randomBytes(32).toString('hex');
} 