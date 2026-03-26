import type { StaffingAssignment } from "../../credentialing/src/domain/entities";

/**
 * Port for projecting credentialing decisions onto a distributed ledger.
 */
export interface CredentialingProtocolAdapter<TInvocation> {
  buildAssignmentClearanceFlow(
    assignment: StaffingAssignment,
    decision: { approved: boolean; reasons: string[] },
  ): TInvocation;
}
