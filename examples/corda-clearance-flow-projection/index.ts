import { CredentialRegistry } from "../../modules/credentialing/src/index";
import { CordaCredentialingAdapter } from "../../modules/protocols/corda/src/index";

const registry = new CredentialRegistry();
const adapter = new CordaCredentialingAdapter();

registry.registerProvider({
  id: "PROV-CORDA-001",
  name: "Dr. Leo Hartmann",
  specialties: ["Surgery"],
  sanctionStatus: "clear",
});

registry.issueCredential({
  id: "LIC-CORDA-001",
  providerId: "PROV-CORDA-001",
  type: "medical-license",
  jurisdictions: ["NL"],
  validUntil: "2027-05-01",
});

const assignment = {
  providerId: "PROV-CORDA-001",
  facility: "Amsterdam Surgical Centre",
  jurisdiction: "NL",
  requiredCredentials: ["medical-license", "sedation-privilege"],
  procedure: "Day Surgery Coverage",
  scheduledAt: "2026-05-11T08:30:00Z",
};

const decision = registry.evaluateAssignment(assignment);

console.log("Corda Clearance Flow Projection");
console.log(
  JSON.stringify(
    adapter.buildAssignmentClearanceFlow(assignment, {
      approved: decision.approved,
      reasons: decision.reasons,
    }),
    null,
    2,
  ),
);
