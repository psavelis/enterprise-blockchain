import type { TransactionRequest } from "ethers";

/**
 * Protocol-level port for Besu/EVM blockchain capabilities.
 *
 * This defines what operations are available at the protocol level,
 * independent of specific domain use cases (traceability, privacy, etc.).
 *
 * @see skills/platform-selection.md for protocol selection criteria
 */

export interface BesuTransactionResult {
  txHash: string;
  blockNumber: number;
  gasUsed: bigint;
}

export interface BesuGasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/**
 * Port for EVM transaction submission.
 *
 * Implementations handle provider connection, nonce management, and signing.
 */
export interface IBesuTransactionPort {
  /**
   * Submit a signed transaction to the network.
   * @returns Transaction hash and receipt metadata
   */
  submitTransaction(tx: TransactionRequest): Promise<BesuTransactionResult>;

  /**
   * Estimate gas for a transaction without submitting.
   * @param tx Transaction to estimate
   * @returns Gas estimate with price information
   */
  estimateGas(tx: TransactionRequest): Promise<BesuGasEstimate>;

  /**
   * Get the current nonce for an address.
   * @param address Ethereum address
   * @returns Current pending nonce
   */
  getNonce(address: string): Promise<number>;
}

/**
 * Port for EVM contract queries (read-only operations).
 */
export interface IBesuQueryPort {
  /**
   * Call a contract method without submitting a transaction.
   * @param to Contract address
   * @param data Encoded function call
   * @returns Encoded return value
   */
  call(to: string, data: string): Promise<string>;

  /**
   * Get contract bytecode at an address.
   * @param address Contract address
   * @returns Bytecode hex string
   */
  getCode(address: string): Promise<string>;
}

/**
 * Port for Besu privacy group operations (Tessera integration).
 */
export interface IBesuPrivacyPort {
  /**
   * Create a new privacy group.
   * @param members Public keys of privacy group members
   * @returns Privacy group ID
   */
  createPrivacyGroup(members: string[]): Promise<string>;

  /**
   * Find existing privacy groups for a set of members.
   * @param members Public keys to search for
   * @returns Matching privacy group IDs
   */
  findPrivacyGroups(members: string[]): Promise<string[]>;
}
