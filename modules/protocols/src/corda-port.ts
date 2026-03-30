/**
 * Protocol-level port for R3 Corda capabilities.
 *
 * This defines what operations are available at the protocol level,
 * independent of specific domain use cases (credentialing, settlement, etc.).
 *
 * @see skills/platform-selection.md for protocol selection criteria
 */

export interface CordaFlowResult<T = unknown> {
  flowId: string;
  status: "COMPLETED" | "FAILED" | "RUNNING";
  result?: T;
  error?: string;
  timestamp: string;
}

export interface CordaTransactionInfo {
  txId: string;
  notary: string;
  signers: string[];
  timestamp: string;
}

/**
 * Port for Corda flow invocation.
 *
 * Implementations handle REST API communication and flow session management.
 */
export interface ICordaFlowPort {
  /**
   * Start a Corda flow.
   * @param flowClass Fully qualified flow class name
   * @param flowArgs Flow constructor arguments
   * @returns Flow execution result
   */
  startFlow<T = unknown>(
    flowClass: string,
    flowArgs: Record<string, unknown>,
  ): Promise<CordaFlowResult<T>>;

  /**
   * Check the status of a running flow.
   * @param flowId Flow run ID
   * @returns Current flow status
   */
  getFlowStatus<T = unknown>(flowId: string): Promise<CordaFlowResult<T>>;
}

/**
 * Port for Corda vault queries.
 */
export interface ICordaVaultPort {
  /**
   * Query states from the vault.
   * @param stateClass State class to query
   * @param criteria Query criteria
   * @returns Matching vault states
   */
  queryStates<T = unknown>(
    stateClass: string,
    criteria?: CordaQueryCriteria,
  ): Promise<CordaVaultState<T>[]>;

  /**
   * Get a specific state by its state ref.
   * @param txId Transaction ID
   * @param index Output index
   * @returns State if found
   */
  getState<T = unknown>(
    txId: string,
    index: number,
  ): Promise<CordaVaultState<T> | undefined>;
}

export interface CordaQueryCriteria {
  status?: "UNCONSUMED" | "CONSUMED" | "ALL";
  contractStateTypes?: string[];
  participants?: string[];
  notary?: string;
}

export interface CordaVaultState<T = unknown> {
  state: T;
  ref: { txId: string; index: number };
  notary: string;
  constraint: string;
}

/**
 * Port for Corda node identity operations.
 */
export interface ICordaIdentityPort {
  /**
   * Get the current node's identity.
   * @returns Node X500 name
   */
  getNodeIdentity(): Promise<string>;

  /**
   * Look up a party by name.
   * @param name X500 name or organization name
   * @returns Party information or undefined
   */
  lookupParty(name: string): Promise<CordaPartyInfo | undefined>;

  /**
   * Get all known network participants.
   * @returns List of network participants
   */
  getNetworkMap(): Promise<CordaPartyInfo[]>;
}

export interface CordaPartyInfo {
  name: string;
  owningKey: string;
  host: string;
  port: number;
}
