import test from "node:test";
import assert from "node:assert/strict";

import { CredentialRegistry } from "../modules/credentialing/src/index";

test("credential registry blocks assignments with missing or expired requirements", () => {
  const registry = new CredentialRegistry();

  registry.registerProvider({
    id: "PROV-1",
    name: "Dr. Noor Malik",
    specialties: ["Emergency Medicine"],
    sanctionStatus: "clear",
  });

  registry.issueCredential({
    id: "LIC-1",
    providerId: "PROV-1",
    type: "medical-license",
    jurisdictions: ["NL"],
    validUntil: "2026-09-01",
  });

  registry.issueCredential({
    id: "BLS-1",
    providerId: "PROV-1",
    type: "bls",
    jurisdictions: ["NL"],
    validUntil: "2026-03-02",
  });

  const decision = registry.evaluateAssignment({
    providerId: "PROV-1",
    facility: "Central Hospital",
    jurisdiction: "NL",
    requiredCredentials: ["medical-license", "bls", "sedation-privilege"],
    procedure: "Emergency Shift",
    scheduledAt: "2026-03-10T00:00:00Z",
  });

  assert.equal(decision.approved, false);
  assert.deepEqual(decision.missingCredentials, ["bls", "sedation-privilege"]);
});
