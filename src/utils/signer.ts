import { hashNoPad, hexToHashOut } from 'poseidon-goldilocks-lite';
import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/curves/abstract/utils';

export interface LighterSigner {
  signTransaction(transaction: any): Promise<string>;
  getPublicKey(): string;
}

export class LighterSignerImpl implements LighterSigner {
  private privateKey: Uint8Array;
  private publicKey: string;

  constructor(privateKeyHex: string) {
    // Remove 0x prefix if present
    const cleanKey = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
    this.privateKey = hexToBytes(cleanKey);
    
    // Generate public key from private key
    const pubKeyPoint = schnorr.getPublicKey(this.privateKey);
    this.publicKey = bytesToHex(pubKeyPoint);
  }

  async signTransaction(transaction: any): Promise<string> {
    // 1. Serialize transaction to canonical JSON
    const txString = this.serializeTransaction(transaction);
    
    // 2. Hash the transaction using Poseidon-Goldilocks
    const messageHash = this.hashMessage(txString);
    
    // 3. Sign the hash using Schnorr
    const signature = await schnorr.sign(messageHash, this.privateKey);
    
    // 4. Return signature as hex string
    return bytesToHex(signature);
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  private serializeTransaction(transaction: any): string {
    // Sort keys to ensure canonical order
    const sortedKeys = Object.keys(transaction).sort();
    const canonicalTx: any = {};
    
    for (const key of sortedKeys) {
      canonicalTx[key] = transaction[key];
    }
    
    // Convert to JSON with no extra whitespace
    return JSON.stringify(canonicalTx);
  }

  private hashMessage(message: string): Uint8Array {
    // Convert message string to bytes
    const messageBytes = new TextEncoder().encode(message);
    
    // Convert bytes to hex string for poseidon-goldilocks
    const messageHex = bytesToHex(messageBytes);
    
    // Use Poseidon-Goldilocks to hash the message
    // Convert hex to hash input format
    const hashInput = hexToHashOut(messageHex);
    const hashOutput = hashNoPad([...hashInput]); // Spread IHashOut to bigint[]
    
    // Convert hash output (IHashOut) to bytes
    // IHashOut is [bigint, bigint, bigint, bigint]
    const hashBytes = new Uint8Array(32); // 4 * 8 bytes = 32 bytes
    let offset = 0;
    
    for (const bigintValue of hashOutput) {
      const valueBytes = new Uint8Array(8);
      const view = new DataView(valueBytes.buffer);
      view.setBigUint64(0, bigintValue, true); // little-endian
      hashBytes.set(valueBytes, offset);
      offset += 8;
    }
    
    return hashBytes;
  }
}

// Factory function to create a signer
export function createLighterSigner(privateKeyHex: string): LighterSigner {
  return new LighterSignerImpl(privateKeyHex);
} 