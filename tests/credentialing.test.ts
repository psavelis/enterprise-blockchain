import test from "node:test";
import assert from "node:assert/strict";

import { CredentialRegistry } from "../modules/credentialing/src/index";

test("evaluateAssignment blocks a provider with non-clear sanction status", () => {
  const registry = new CredentialRegistry();

  registry.registerProvider({
    id: "PROV-SANCTIONED",
    name: "Test Provider",
    specialties: [],
    sanctionStatus: "blocked",
  });

  const decision = registry.evaluateAssignment({
    providerId: "PROV-SANCTIONED",
    facility: "Hospital",
    jurisdiction: "NL",
    requiredCredentials: [],
    procedure: "Consultation",
    scheduledAt: "2026-03-10T00:00:00Z",
  });

  assert.equal(decision.approved, false);
  assert.ok(decision.reasons.some((r) => r.includes("blocked")));
});

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

test("evaluateAssignment approves when all credentials are valid", () => {
  const registry = new CredentialRegistry();

  registry.registerProvider({
    id: "PROV-FULL",
    name: "Dr. Complete",
    specialties: ["Surgery"],
    sanctionStatus: "clear",
  });

  registry.issueCredential({
    id: "LIC-FULL-1",
    providerId: "PROV-FULL",
    type: "medical-license",
    jurisdictions: ["NL"],
    validUntil: "2027-01-01",
  });

  registry.issueCredential({
    id: "BLS-FULL-1",
    providerId: "PROV-FULL",
    type: "bls",
    jurisdictions: ["NL"],
    validUntil: "2027-01-01",
  });

  const decision = registry.evaluateAssignment({
    providerId: "PROV-FULL",
    facility: "Hospital",
    jurisdiction: "NL",
    requiredCredentials: ["medical-license", "bls"],
    procedure: "Day Surgery",
    scheduledAt: "2026-06-01T08:00:00Z",
  });

  assert.equal(decision.approved, true);
  assert.equal(decision.missingCredentials.length, 0);
});

test("evaluateAssignment blocks credential outside target jurisdiction", () => {
  const registry = new CredentialRegistry();

  registry.registerProvider({
    id: "PROV-JURIS",
    name: "Dr. Local",
    specialties: ["General"],
    sanctionStatus: "clear",
  });

  registry.issueCredential({
    id: "LIC-DE",
    providerId: "PROV-JURIS",
    type: "medical-license",
    jurisdictions: ["DE"],
    validUntil: "2027-01-01",
  });

  const decision = registry.evaluateAssignment({
    providerId: "PROV-JURIS",
    facility: "Amsterdam Hospital",
    jurisdiction: "NL",
    requiredCredentials: ["medical-license"],
    procedure: "Consultation",
    scheduledAt: "2026-06-01T08:00:00Z",
  });

  assert.equal(decision.approved, false);
  assert.ok(decision.missingCredentials.includes("medical-license"));
});

test("evaluateAssignment approves when credential expires on the schedule date", () => {
  const registry = new CredentialRegistry();

  registry.registerProvider({
    id: "PROV-EDGE",
    name: "Dr. Boundary",
    specialties: ["General"],
    sanctionStatus: "clear",
  });

  registry.issueCredential({
    id: "LIC-EDGE",
    providerId: "PROV-EDGE",
    type: "medical-license",
    jurisdictions: ["NL"],
    validUntil: "2026-06-01",
  });

  const decision = registry.evaluateAssignment({
    providerId: "PROV-EDGE",
    facility: "Test Hospital",
    jurisdiction: "NL",
    requiredCredentials: ["medical-license"],
    procedure: "Consultation",
    scheduledAt: "2026-06-01T00:00:00Z",
  });

  // validUntil === scheduledAt: credential is still valid on that date
  assert.equal(decision.approved, true);
  assert.equal(decision.missingCredentials.length, 0);
  assert.ok(decision.expiringSoon.some((e) => e.includes("0 days remaining")));
});
