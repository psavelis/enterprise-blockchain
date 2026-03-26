/**
 * Cross-module end-to-end test.
 *
 * Exercises the full consortium workflow: traceability registration, privacy
 * anchoring, credential verification, and aid settlement — validating that
 * data flows correctly across module boundaries.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TraceabilityLedger } from "../modules/traceability/src/index";
import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";
import { CredentialRegistry } from "../modules/credentialing/src/index";
import { AidSettlementLedger } from "../modules/aid-settlement/src/index";
import { FabricTraceabilityAdapter } from "../modules/protocols/fabric/src/index";
import { BesuSelectiveDisclosureAdapter } from "../modules/protocols/besu/src/index";
import { CordaCredentialingAdapter } from "../modules/protocols/corda/src/index";

describe("E2E: consortium supply-chain workflow", () => {
  it("traces product → anchors order → verifies credentials → settles aid", () => {
    // Phase 1: Traceability — register lot and shipment
    const trace = new TraceabilityLedger();
    trace.registerLot({
      id: "LOT-E2E-001",
      productName: "Organic Rice",
      supplier: "Delta Farms",
      originCountry: "TH",
      harvestDate: "2026-03-01",
      expirationDate: "2026-09-01",
    });

    trace.dispatchShipment({
      id: "SHIP-E2E-001",
      lotId: "LOT-E2E-001",
      from: "Bangkok Export Hub",
      to: "Rotterdam DC",
      departedAt: "2026-03-03T04:00:00Z",
    });

    trace.recordTelemetry({
      shipmentId: "SHIP-E2E-001",
      timestamp: "2026-03-03T12:00:00Z",
      temperatureCelsius: 22,
      location: "Singapore Strait",
    });

    // Verify recall assessment finds no issues
    const assessment = trace.assessRecall({
      suspectSuppliers: [],
      flaggedLotIds: [],
      maxTemperatureCelsius: 30,
    });
    assert.equal(assessment.impactedLotIds.length, 0);

    // Phase 2: Privacy — anchor a purchase order and create audience views
    const privacy = new SelectiveDisclosureLedger();
    privacy.publishOrder({
      id: "PO-E2E-001",
      buyer: "Global Foods Inc",
      supplier: "Delta Farms",
      sku: "ORGANIC-RICE-5KG",
      quantity: 2000,
      unitPriceUsd: 8,
      incoterm: "CIF",
      destinationPort: "Rotterdam",
      financingBank: "Asia Trade Bank",
      sustainabilityGrade: "A",
    });

    const bankView = privacy.createView("PO-E2E-001", "bank");
    const logisticsView = privacy.createView("PO-E2E-001", "logistics");

    assert.equal(bankView.data.totalValueUsd, 16000);
    assert.equal("unitPriceUsd" in bankView.data, false);
    assert.equal(logisticsView.data.incoterm, "CIF");
    assert.equal(bankView.auditProof, logisticsView.auditProof);

    // Phase 3: Credentialing — verify provider assignment
    const registry = new CredentialRegistry();
    registry.registerProvider({
      id: "PROV-E2E-001",
      name: "Dr. Ana Torres",
      specialties: ["Emergency Medicine"],
      sanctionStatus: "clear",
    });

    registry.issueCredential({
      id: "LIC-E2E-001",
      providerId: "PROV-E2E-001",
      type: "medical-license",
      jurisdictions: ["NL"],
      validUntil: "2027-06-01",
    });

    const decision = registry.evaluateAssignment({
      providerId: "PROV-E2E-001",
      facility: "Rotterdam Medical Centre",
      jurisdiction: "NL",
      requiredCredentials: ["medical-license"],
      procedure: "Emergency Shift",
      scheduledAt: "2026-04-01T08:00:00Z",
    });

    assert.equal(decision.approved, true);

    // Phase 4: Aid Settlement — reconcile claims
    const settlement = new AidSettlementLedger();
    settlement.issueGrant({
      id: "GRANT-E2E-001",
      beneficiaryId: "HH-E2E-001",
      program: "Humanitarian Food Aid",
      issuedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-06-01T00:00:00Z",
      approvedMerchantCategories: ["groceries", "pharmacy"],
      amountUsd: 500,
    });

    settlement.submitClaim({
      id: "CLAIM-E2E-001",
      grantId: "GRANT-E2E-001",
      merchantId: "M-E2E-001",
      merchantCategory: "groceries",
      submittedAt: "2026-02-15T10:00:00Z",
      invoiceReference: "INV-E2E-001",
      amountUsd: 120,
    });

    const report = settlement.reconcile();
    assert.deepEqual(report.settledClaimIds, ["CLAIM-E2E-001"]);
    assert.equal(report.rejectedClaimIds.length, 0);
  });

  it("protocol adapters produce correct invocations from domain data", () => {
    const fabricAdapter = new FabricTraceabilityAdapter();
    const besuAdapter = new BesuSelectiveDisclosureAdapter();
    const cordaAdapter = new CordaCredentialingAdapter();

    // Fabric: traceability lot → chaincode invocation
    const fabricInvocation = fabricAdapter.createLotCommand({
      id: "LOT-CROSS-001",
      productName: "Coffee Beans",
      supplier: "Highland Co-op",
      originCountry: "CO",
      harvestDate: "2026-04-01",
      expirationDate: "2026-10-01",
    });
    assert.equal(fabricInvocation.contract, "FoodTraceContract");
    assert.equal(fabricInvocation.transaction, "CreateProduct");

    // Besu: privacy anchor → contract call
    const besuCall = besuAdapter.anchorOrder(
      {
        id: "PO-CROSS-001",
        buyer: "Import Co",
        supplier: "Highland Co-op",
        sku: "ARABICA-1KG",
        quantity: 500,
        unitPriceUsd: 12,
        incoterm: "FOB",
        destinationPort: "Antwerp",
        sustainabilityGrade: "B",
      },
      "proof-cross-001",
    );
    assert.equal(besuCall.method, "anchorOrder");
    assert.equal(besuCall.contractName, "ConsortiumOrderRegistry");

    // Corda: credentialing → flow command
    const cordaCommand = cordaAdapter.buildAssignmentClearanceFlow(
      {
        providerId: "PROV-CROSS-001",
        facility: "Clinic A",
        jurisdiction: "BE",
        requiredCredentials: ["medical-license"],
        procedure: "Consultation",
        scheduledAt: "2026-05-01T09:00:00Z",
      },
      { approved: true, reasons: [] },
    );
    assert.equal(cordaCommand.flow, "IssueProviderClearanceFlow");
    assert.equal(cordaCommand.command, "ApproveClearance");
    assert.equal(cordaCommand.contract, "ProviderClearanceContract");
  });
});
