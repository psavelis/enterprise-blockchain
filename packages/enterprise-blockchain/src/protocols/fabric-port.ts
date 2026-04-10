/**
 * Protocol-level port for Hyperledger Fabric capabilities.
 *
 * This defines what operations are available at the protocol level,
 * independent of specific domain use cases (traceability, privacy, etc.).
 *
 * @see skills/platform-selection.md for protocol selection criteria
 */

export interface FabricInvocationResult {
  transactionId: string;
  payload: Uint8Array;
  validationCode: number;
}

export interface FabricEndorsementPolicy {
  identities: Array<{ role: string; mspId: string }>;
  policy: string;
}

/**
 * Port for Fabric chaincode invocation (submit transactions).
 *
 * Implementations handle endorsement collection and commit.
 */
export interface IFabricSubmitPort {
  /**
   * Submit a transaction to the ledger.
   * @param chaincodeId Chaincode name
   * @param functionName Function to invoke
   * @param args Function arguments
   * @param transientData Private data (not committed to ledger)
   * @returns Transaction result with validation code
   */
  submitTransaction(
    chaincodeId: string,
    functionName: string,
    args: string[],
    transientData?: Record<string, Uint8Array>,
  ): Promise<FabricInvocationResult>;
}

/**
 * Port for Fabric chaincode queries (read-only operations).
 */
export interface IFabricQueryPort {
  /**
   * Evaluate a chaincode function without committing.
   * @param chaincodeId Chaincode name
   * @param functionName Function to evaluate
   * @param args Function arguments
   * @returns Query result payload
   */
  evaluateTransaction(
    chaincodeId: string,
    functionName: string,
    args: string[],
  ): Promise<Uint8Array>;
}

/**
 * Port for Fabric private data collection operations.
 */
export interface IFabricPrivateDataPort {
  /**
   * Store data in a private data collection.
   * @param collectionName Name of the collection
   * @param key Document key
   * @param value Document value
   */
  putPrivateData(
    collectionName: string,
    key: string,
    value: Uint8Array,
  ): Promise<void>;

  /**
   * Retrieve data from a private data collection.
   * @param collectionName Name of the collection
   * @param key Document key
   * @returns Document value or undefined if not found
   */
  getPrivateData(
    collectionName: string,
    key: string,
  ): Promise<Uint8Array | undefined>;
}

/**
 * Port for Fabric event subscription.
 */
export interface IFabricEventPort {
  /**
   * Subscribe to chaincode events.
   * @param chaincodeId Chaincode name
   * @param eventName Event name filter
   * @param callback Event handler
   * @returns Unsubscribe function
   */
  subscribeToEvents(
    chaincodeId: string,
    eventName: string,
    callback: (event: FabricChaincodeEvent) => void,
  ): () => void;
}

export interface FabricChaincodeEvent {
  chaincodeId: string;
  eventName: string;
  payload: Uint8Array;
  transactionId: string;
  blockNumber: bigint;
}
