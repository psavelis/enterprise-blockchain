import type { StaffingAssignment } from "../credentialing/domain/entities.js";

/**
 * Port for projecting credentialing decisions onto a distributed ledger.
 */
export interface CredentialingProtocolAdapter<TInvocation> {
  buildAssignmentClearanceFlow(
    assignment: StaffingAssignment,
    decision: { approved: boolean; reasons: string[] },
  ): TInvocation;
}
