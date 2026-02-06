/**
 * Helper utilities for account management in examples
 */

import { ApiClient, AccountApi } from '../../src';
import { ethers } from 'ethers';

/**
 * Fetches account index from L1 address
 * Returns the master account (minimum index) if multiple accounts exist
 */
export async function getAccountIndexFromL1Address(
  l1Address: string,
  baseUrl: string
): Promise<number | null> {
  try {
    const apiClient = new ApiClient({ host: baseUrl });
    const accountApi = new AccountApi(apiClient);
    
    const checksummed = ethers.getAddress(l1Address);
    const accounts = await accountApi.getAccountsByL1Address(checksummed);
    
    await apiClient.close();
    
    if (!accounts || accounts.length === 0) {
      return null;
    }
    
    // If we have multiple accounts, find the master account (minimum index)
    if (accounts.length > 1) {
      const masterAccount = accounts.reduce((min, acc) => {
        const minIdx = parseInt(String(min.index || min.account_index || '0'), 10);
        const accIdx = parseInt(String(acc.index || acc.account_index || '0'), 10);
        return accIdx < minIdx ? acc : min;
      });
      
      return parseInt(String(masterAccount.index || masterAccount.account_index || '0'), 10);
    }
    
    return parseInt(String(accounts[0].index || accounts[0].account_index || '0'), 10);
  } catch (error: any) {
    if (error.message && error.message.includes('account not found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Gets account index from environment or L1 address
 * Falls back to env ACCOUNT_INDEX if provided, otherwise fetches from L1 address
 */
export async function getAccountIndex(
  baseUrl: string,
  ethPrivateKey?: string
): Promise<number | null> {
  // First, try to use ACCOUNT_INDEX from env if provided
  const envAccountIndex = process.env['ACCOUNT_INDEX'];
  if (envAccountIndex) {
    const parsed = parseInt(envAccountIndex, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  // If no ACCOUNT_INDEX in env, try to fetch from L1 address
  const ethKey = ethPrivateKey || process.env['ETH_PRIVATE_KEY'] || process.env['ACCOUNT_PRIVATE_KEY'];
  if (!ethKey) {
    return null;
  }
  
  try {
    const wallet = new ethers.Wallet(ethKey);
    const l1Address = wallet.address;
    return await getAccountIndexFromL1Address(l1Address, baseUrl);
  } catch (error) {
    return null;
  }
}

