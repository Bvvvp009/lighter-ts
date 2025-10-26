import { ethers } from 'ethers';
import { L1DepositParams, L1DepositResult, L1BridgeConfig } from '../types/api';

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

  constructor(config: L1BridgeConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    // Initialize USDC contract
    this.usdcContract = new ethers.Contract(
      config.usdcContract,
      L1BridgeClient.USDC_ABI,
      this.provider
    );

    // Initialize bridge contract
    this.bridgeContract = new ethers.Contract(
      config.l1BridgeContract,
      L1BridgeClient.BRIDGE_ABI,
      this.provider
    );
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
        console.log('Approving USDC for bridge contract...');
        
        // Approve USDC for bridge contract
        const approveTx = await (usdcContractWithSigner as any).approve(
          this.config.l1BridgeContract,
          amountInUnits,
          {
            gasPrice: params.gasPrice ? ethers.parseUnits(params.gasPrice, 'gwei') : undefined,
            gasLimit: params.gasLimit
          }
        );
        
        console.log('Approval transaction:', approveTx.hash);
        await approveTx.wait();
        console.log('USDC approved for bridge contract');
      }

      // Execute deposit
      console.log(`Depositing ${params.usdcAmount} USDC to L2 account ${params.l2AccountIndex}...`);
      
      const depositTx = await (bridgeContractWithSigner as any).deposit(
        amountInUnits,
        params.l2AccountIndex,
        {
          gasPrice: params.gasPrice ? ethers.parseUnits(params.gasPrice, 'gwei') : undefined,
          gasLimit: params.gasLimit
        }
      );

      console.log('Deposit transaction:', depositTx.hash);
      
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
      console.error('L1 deposit failed:', error);
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
      console.error('Failed to get USDC balance:', error);
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
      console.error('Failed to get USDC allowance:', error);
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
      console.error('Failed to get transaction status:', error);
      throw error;
    }
  }

  /**
   * Get default bridge configuration for mainnet
   * @returns L1BridgeConfig
   */
  static getMainnetConfig(): L1BridgeConfig {
    return {
      l1BridgeContract: '0x0000000000000000000000000000000000000000', // Replace with actual bridge contract
      usdcContract: '0xA0b86a33E6441b8c4C8C0E4A8c4c4c4c4c4c4c4c4', // Replace with actual USDC contract
      rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY', // Replace with actual RPC URL
      chainId: 1
    };
  }

  /**
   * Get default bridge configuration for testnet
   * @returns L1BridgeConfig
   */
  static getTestnetConfig(): L1BridgeConfig {
    return {
      l1BridgeContract: '0x0000000000000000000000000000000000000000', // Replace with actual testnet bridge contract
      usdcContract: '0x0000000000000000000000000000000000000000', // Replace with actual testnet USDC contract
      rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY', // Replace with actual testnet RPC URL
      chainId: 11155111 // Sepolia testnet
    };
  }
}
