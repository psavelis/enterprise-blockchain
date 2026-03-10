import type { StaffingAssignment } from "../../../credentialing/src/index";

export interface CordaFlowCommand {
  flow: string;
  initiator: string;
  participants: string[];
  inputStateRefs: string[];
  outputState: ProviderClearanceState;
  command: string;
  contract: string;
  notary: string;
}

export interface ProviderClearanceState {
  linearId: string;
  providerId: string;
  facility: string;
  jurisdiction: string;
  requiredCredentials: string[];
  approved: boolean;
  reasons: string[];
}

export class CordaCredentialingAdapter {
  buildAssignmentClearanceFlow(
    assignment: StaffingAssignment,
    decision: { approved: boolean; reasons: string[] },
  ): CordaFlowCommand {
    const state: ProviderClearanceState = {
      linearId: `${assignment.providerId}-${assignment.scheduledAt}`,
      providerId: assignment.providerId,
      facility: assignment.facility,
      jurisdiction: assignment.jurisdiction,
      requiredCredentials: assignment.requiredCredentials,
      approved: decision.approved,
      reasons: decision.reasons,
    };

    return {
      flow: "IssueProviderClearanceFlow",
      initiator: assignment.facility,
      participants: [assignment.facility, assignment.providerId, "MedicalBoardObserver"],
      inputStateRefs: [],
      outputState: state,
      command: decision.approved ? "ApproveClearance" : "RejectClearance",
      contract: "ProviderClearanceContract",
      notary: "RegulatedHealthNotary",
    };
  }
}