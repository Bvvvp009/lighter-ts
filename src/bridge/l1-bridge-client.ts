import { ethers } from 'ethers';
import { L1DepositParams, L1DepositResult, L1BridgeConfig } from '../types/api';

/** Raised when a bridge config names an address that cannot be the intended contract. */
export class BridgeConfigError extends Error {
  constructor(field: 'l1BridgeContract' | 'usdcContract', value: string, reason: string) {
    super(
      `L1 bridge config field '${field}' is unusable: ${reason} (got '${value}').\n` +
        `\n` +
        `This client moves real USDC on Ethereum. Refusing to build a client\n` +
        `around an address that cannot hold the intended contract, rather than\n` +
        `letting an approval or a deposit go somewhere it can never be\n` +
        `recovered from.\n` +
        `\n` +
        `Pass the real bridge and USDC addresses for your network in the\n` +
        `L1BridgeConfig you hand to the constructor.`,
    );
    this.name = 'BridgeConfigError';
  }
}

/**
 * L1 Bridge Client for handling Ethereum to Lighter L2 deposits
 * Uses ethers.js to interact with L1 contracts
 */
export class L1BridgeClient {
  private config: L1BridgeConfig;
  private provider: ethers.Provider;
  private usdcContract: ethers.Contract;
  private bridgeContract: ethers.Contract;

  // USDC Contract ABI (minimal for transfer and approve)
  private static readonly USDC_ABI = [
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function allowance(address owner, address spender) external view returns (uint256)'
  ] as const;

  // Bridge Contract ABI (minimal for deposit)
  private static readonly BRIDGE_ABI = [
    'function deposit(uint256 amount, uint256 l2AccountIndex) external',
    'function depositTo(uint256 amount, uint256 l2AccountIndex, address to) external'
  ] as const;

  /**
   * Reject an address that cannot possibly be the contract it claims to be.
   *
   * The zero address is the dangerous case, not an obviously malformed one:
   * ethers accepts it, USDC will happily `approve` it, and an EVM call to an
   * address with no code SUCCEEDS as a no-op instead of reverting. A deposit
   * routed there returns a green receipt while the funds never move.
   */
  private static assertUsableAddress(
    field: 'l1BridgeContract' | 'usdcContract',
    value: string
  ): string {
    let normalized: string;
    try {
      normalized = ethers.getAddress(value);
    } catch {
      throw new BridgeConfigError(field, value, 'not a valid Ethereum address');
    }
    if (normalized === ethers.ZeroAddress) {
      throw new BridgeConfigError(
        field,
        value,
        'the zero address is a placeholder, not a contract'
      );
    }
    return normalized;
  }

  constructor(config: L1BridgeConfig) {
    const l1BridgeContract = L1BridgeClient.assertUsableAddress(
      'l1BridgeContract',
      config.l1BridgeContract
    );
    const usdcContract = L1BridgeClient.assertUsableAddress('usdcContract', config.usdcContract);

    this.config = { ...config, l1BridgeContract, usdcContract };
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Initialize USDC contract
    this.usdcContract = new ethers.Contract(
      usdcContract,
      L1BridgeClient.USDC_ABI,
      this.provider
    );

    // Initialize bridge contract
    this.bridgeContract = new ethers.Contract(
      l1BridgeContract,
      L1BridgeClient.BRIDGE_ABI,
      this.provider
    );
  }

  /**
   * Confirm the configured bridge address actually hosts a contract.
   *
   * Guards the silent-failure case a valid-but-wrong address creates: `approve`
   * and `deposit` both succeed on-chain, so `depositToL2` reports success while
   * the USDC never leaves the wallet. Checked before any gas is spent.
   */
  private async assertBridgeHasCode(): Promise<void> {
    const code = await this.provider.getCode(this.config.l1BridgeContract);
    if (code === '0x' || code === '0x0') {
      throw new BridgeConfigError(
        'l1BridgeContract',
        this.config.l1BridgeContract,
        'no contract code at this address on the configured RPC network'
      );
    }
  }

  /**
   * Deposit USDC from L1 to L2
   * @param params - Deposit parameters
   * @returns Promise<L1DepositResult>
   */
  async depositToL2(params: L1DepositParams): Promise<L1DepositResult> {
    try {
      // Create wallet from private key
      const wallet = new ethers.Wallet(params.ethPrivateKey, this.provider);
      
      // Connect contracts to wallet
      const usdcContractWithSigner = this.usdcContract.connect(wallet);
      const bridgeContractWithSigner = this.bridgeContract.connect(wallet);

      // Before spending any gas, prove there is a contract to deposit into.
      await this.assertBridgeHasCode();

      // Get USDC decimals
      const decimals = await (usdcContractWithSigner as any).decimals();
      
      // Convert amount to proper units
      const amountInUnits = ethers.parseUnits(params.usdcAmount.toString(), decimals);
      
      // Check USDC balance
      const balance = await (usdcContractWithSigner as any).balanceOf(wallet.address);
      if (balance < amountInUnits) {
        throw new Error(`Insufficient USDC balance. Required: ${ethers.formatUnits(amountInUnits, decimals)}, Available: ${ethers.formatUnits(balance, decimals)}`);
      }

      // Check allowance
      const allowance = await (usdcContractWithSigner as any).allowance(wallet.address, this.config.l1BridgeContract);
      
      if (allowance < amountInUnits) {
        const approveTx = await (usdcContractWithSigner as any).approve(
          this.config.l1BridgeContract,
          amountInUnits,
          {
            gasPrice: params.gasPrice ? ethers.parseUnits(params.gasPrice, 'gwei') : undefined,
            gasLimit: params.gasLimit
          }
        );
        
        await approveTx.wait();
      }

      const depositTx = await (bridgeContractWithSigner as any).deposit(
        amountInUnits,
        params.l2AccountIndex,
        {
          gasPrice: params.gasPrice ? ethers.parseUnits(params.gasPrice, 'gwei') : undefined,
          gasLimit: params.gasLimit
        }
      );
      
      // Wait for transaction confirmation
      const receipt = await depositTx.wait();
      
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      return {
        l1TxHash: depositTx.hash,
        l2AccountIndex: params.l2AccountIndex,
        amount: ethers.formatUnits(amountInUnits, decimals),
        status: 'completed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Check USDC balance for an address
   * @param address - Ethereum address
   * @returns Promise<string> - Balance in USDC units
   */
  async getUSDCBalance(address: string): Promise<string> {
    try {
      const balance = await (this.usdcContract as any).balanceOf(address);
      const decimals = await (this.usdcContract as any).decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check USDC allowance for bridge contract
   * @param address - Ethereum address
   * @returns Promise<string> - Allowance in USDC units
   */
  async getUSDCAllowance(address: string): Promise<string> {
    try {
      const allowance = await (this.usdcContract as any).allowance(address, this.config.l1BridgeContract);
      const decimals = await (this.usdcContract as any).decimals();
      return ethers.formatUnits(allowance, decimals);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get transaction status
   * @param txHash - Transaction hash
   * @returns Promise<L1DepositResult>
   */
  async getTransactionStatus(txHash: string): Promise<L1DepositResult> {
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!tx) {
        throw new Error('Transaction not found');
      }

      if (!receipt) {
        return {
          l1TxHash: txHash,
          l2AccountIndex: 0, // Will be updated when transaction is parsed
          amount: '0',
          status: 'pending'
        };
      }

      // Parse transaction data to extract amount and account index
      // This is a simplified version - in reality, you'd need to decode the transaction data
      const amount = '0'; // Extract from transaction data
      const l2AccountIndex = 0; // Extract from transaction data

      return {
        l1TxHash: txHash,
        l2AccountIndex,
        amount,
        status: receipt.status === 1 ? 'completed' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * @throws BridgeConfigError always.
   *
   * This used to return placeholder addresses marked "Replace with actual" -- a
   * zero-address bridge and a hand-typed, malformed USDC address -- behind a
   * name that promises a working mainnet config. No real bridge address ships
   * with this SDK, and guessing one on a deposit path is how funds get burned,
   * so this fails loudly instead of handing back something that looks usable.
   *
   * @deprecated Construct `L1BridgeClient` with an explicit `L1BridgeConfig`.
   */
  static getMainnetConfig(): L1BridgeConfig {
    throw new BridgeConfigError(
      'l1BridgeContract',
      '<unset>',
      'no built-in mainnet bridge address ships with this SDK'
    );
  }

  /**
   * @throws BridgeConfigError always. See {@link getMainnetConfig}.
   *
   * @deprecated Construct `L1BridgeClient` with an explicit `L1BridgeConfig`.
   */
  static getTestnetConfig(): L1BridgeConfig {
    throw new BridgeConfigError(
      'l1BridgeContract',
      '<unset>',
      'no built-in testnet bridge address ships with this SDK'
    );
  }
}
