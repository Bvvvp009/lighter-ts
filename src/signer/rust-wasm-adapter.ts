/**
 * Complete Rust WASM signer adapter supporting all transaction types.
 * Drop-in replacement for Go WASM with 99% smaller binary size.
 */
import path from 'path';
import fs from 'fs';

// Lazy require to avoid ESM/CJS friction
let RustWasm: any = null;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Fallback for browsers (not expected here)
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// Convert PascalCase / camelCase (with acronym support) to snake_case
// Handles sequences like "USDCAmount" -> "usdc_amount" instead of "u_s_d_c_amount"
function pascalToSnake(str: string): string {
  return str
    // insert underscore between lowercase/number and uppercase boundaries
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // handle acronym followed by normal word: "USDCAmount" => "USDC_Amount"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function convertKeysToSnakeCase(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnakeCase);
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[pascalToSnake(key)] = convertKeysToSnakeCase(value);
  }
  return result;
}

export class RustWasmOrderSigner {
  private signer: any;
  private initialized = false;
  private readonly privateKeyHex: string;

  constructor(privateKeyHex: string) {
    this.privateKeyHex = privateKeyHex.startsWith('0x') ? privateKeyHex.slice(2) : privateKeyHex;
  }

  private async load(): Promise<void> {
    if (this.initialized) return;
    if (!RustWasm) {
      const wasmPath = path.join(process.cwd(), 'wasm', 'rust-nodejs', 'signer_wasm.js');
      // Use CommonJS require to avoid ESM/CJS interop issues on Node
      RustWasm = require(wasmPath);

      // Explicitly initialize the wasm module to ensure wasm exports (e.g., __wbindgen_malloc) are set
      const wasmBgPath = path.join(process.cwd(), 'wasm', 'rust-nodejs', 'signer_wasm_bg.wasm');
      const wasmBytes = fs.readFileSync(wasmBgPath);

      // wasm-pack exposes initSync for Node targets; fall back to default (async) if not present
      if (typeof RustWasm.initSync === 'function') {
        // wasm-pack now expects an options object; pass bytes explicitly to avoid deprecation warnings
        RustWasm.initSync({ module: wasmBytes });
      } else if (typeof RustWasm.default === 'function') {
        await RustWasm.default({ module: wasmBytes });
      }
    }
    this.signer = new RustWasm.SignerInstance(this.privateKeyHex);
    this.initialized = true;
  }

  private async signTransaction(
    txOrString: Record<string, any> | string,
    signMethod: string,
    txType: number
  ): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    await this.load();
    try {
      let jsonWithoutSig: string;
      let originalObj: any;
      
      if (typeof txOrString === 'string') {
        originalObj = JSON.parse(txOrString);
      } else {
        originalObj = { ...txOrString };
      }
      
      // Remove Sig field if present
      delete originalObj.Sig;
      
      // Convert PascalCase (Go) to snake_case (Rust)
      const snakeCaseObj = convertKeysToSnakeCase(originalObj);
      jsonWithoutSig = JSON.stringify(snakeCaseObj);
      
      // Call the appropriate signing method
      const sigHex = this.signer[signMethod](jsonWithoutSig);
      if (!sigHex || typeof sigHex !== 'string') {
        return { txType, txInfo: '', txHash: '', error: `Rust signer returned empty signature for ${signMethod}` };
      }
      
      const sigBytes = hexToBytes(sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex);
      const sigB64 = bytesToBase64(sigBytes);
      
      // Return with original PascalCase field names (server expects this)
      originalObj.Sig = sigB64;
      return { txType, txInfo: JSON.stringify(originalObj), txHash: '' };
    } catch (err: any) {
      return { txType, txInfo: '', txHash: '', error: err?.message || String(err) };
    }
  }

  async signCreateOrder(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCreateOrder', 14);
  }

  async signCancelOrder(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCancelOrder', 15);
  }

  async signCancelAllOrders(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCancelAllOrders', 16);
  }

  async signUpdateLeverage(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signUpdateLeverage', 20);
  }

  async signTransfer(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signTransfer', 12);
  }

  async signWithdraw(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signWithdraw', 13);
  }

  async signUpdateMargin(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signUpdateMargin', 29);
  }

  async signModifyOrder(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signModifyOrder', 17);
  }

  async signCreateSubAccount(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCreateSubAccount', 9);
  }

  async signCreateGroupedOrders(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCreateGroupedOrders', 28);
  }

  async signCreatePublicPool(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signCreatePublicPool', 10);
  }

  async signUpdatePublicPool(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signUpdatePublicPool', 11);
  }

  async signMintShares(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signMintShares', 18);
  }

  async signBurnShares(txOrString: Record<string, any> | string): Promise<{ txType: number; txInfo: string; txHash: string; error?: string }> {
    return this.signTransaction(txOrString, 'signBurnShares', 19);
  }

  async createAuthToken(deadline: bigint, accountIndex: bigint, apiKeyIndex: number): Promise<string> {
    await this.load();
    console.log(`[DEBUG] createAuthToken params: deadline=${deadline}, accountIndex=${accountIndex}, apiKeyIndex=${apiKeyIndex}`);
    // Rust signer returns auth token in format: "deadline:account_index:api_key_index:signature_hex"
    // Return as-is - no conversion needed
    const token = this.signer.createAuthToken(deadline, accountIndex, apiKeyIndex);
    console.log(`[DEBUG] createAuthToken result: ${token.substring(0, 100)}...`);
    return token;
  }

  async getPublicKey(): Promise<string> {
    await this.load();
    return this.signer.getPublicKey();
  }

  // Static method for API key generation (useful for setup scripts)
  static async generateAPIKeyPair(seed?: string): Promise<{ publicKey: string; privateKey: string }> {
    let RustWasm: any = null;
    try {
      const wasmPath = path.join(process.cwd(), 'wasm', 'rust-nodejs', 'signer_wasm.js');
      // Use require for CommonJS compatibility
      RustWasm = require(wasmPath);
      const privateKeyHex = RustWasm.generatePrivateKey();
      const publicKeyHex = RustWasm.getPublicKeyFromPrivate(privateKeyHex);
      return { publicKey: publicKeyHex, privateKey: privateKeyHex };
    } catch (e) {
      throw new Error(`Failed to generate API key pair: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
