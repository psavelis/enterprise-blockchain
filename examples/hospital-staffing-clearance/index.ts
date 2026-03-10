import { CredentialRegistry } from "../../modules/credentialing/src/index";

const registry = new CredentialRegistry();

registry.registerProvider({
  id: "PROV-102",
  name: "Dr. Elena Varga",
  specialties: ["Cardiology", "Critical Care"],
  sanctionStatus: "clear",
});

registry.issueCredential({
  id: "LIC-EU-7781",
  providerId: "PROV-102",
  type: "medical-license",
  jurisdictions: ["NL"],
  validUntil: "2027-01-15",
});

registry.issueCredential({
  id: "BLS-2201",
  providerId: "PROV-102",
  type: "bls",
  jurisdictions: ["NL"],
  validUntil: "2026-03-22",
});

const decision = registry.evaluateAssignment({
  providerId: "PROV-102",
  facility: "Utrecht Heart Centre",
  jurisdiction: "NL",
  requiredCredentials: ["medical-license", "bls", "sedation-privilege"],
  procedure: "Catheterization Lab Weekend Shift",
  scheduledAt: "2026-03-25T08:00:00Z",
});

console.log("Hospital Staffing Clearance");
console.log(JSON.stringify(decision, null, 2));