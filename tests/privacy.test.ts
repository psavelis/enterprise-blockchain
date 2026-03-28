import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SelectiveDisclosureLedger,
  type SignedAuditProof,
} from "../modules/privacy/src/index";
import { BesuSelectiveDisclosureAdapter } from "../modules/protocols/besu/src/index";
import { HsmClient } from "../modules/hsm/src/index";

const sampleOrder = () => ({
  id: "PO-1",
  buyer: "Buyer",
  supplier: "Supplier",
  sku: "SKU-100",
  quantity: 20,
  unitPriceUsd: 15,
  incoterm: "FOB",
  destinationPort: "Rotterdam",
  financingBank: "Trade Bank",
  sustainabilityGrade: "A" as const,
});

describe("SelectiveDisclosureLedger", () => {
  describe("bank view", () => {
    it("exposes totalValueUsd but hides unitPriceUsd", () => {
      const ledger = new SelectiveDisclosureLedger();
      const adapter = new BesuSelectiveDisclosureAdapter();

      ledger.publishOrder(sampleOrder());

      const bankView = ledger.createView("PO-1", "bank");
      assert.equal(bankView.data.totalValueUsd, 300);
      assert.equal("unitPriceUsd" in bankView.data, false);

      const call = adapter.publishAudienceView(bankView);
      assert.equal(call.contractName, "ConsortiumOrderRegistry");
      assert.equal(call.privacyGroup, "view-bank");
    });

    it("shows financingBank when present", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "bank");
      assert.equal(view.data.financingBank, "Trade Bank");
    });

    it("shows n/a when financingBank is omitted", () => {
      const ledger = new SelectiveDisclosureLedger();
      const order = sampleOrder();
      ledger.publishOrder({
        id: order.id,
        buyer: order.buyer,
        supplier: order.supplier,
        sku: order.sku,
        quantity: order.quantity,
        unitPriceUsd: order.unitPriceUsd,
        incoterm: order.incoterm,
        destinationPort: order.destinationPort,
        sustainabilityGrade: order.sustainabilityGrade,
      });

      const view = ledger.createView("PO-1", "bank");
      assert.equal(view.data.financingBank, "n/a");
    });
  });

  describe("logistics view", () => {
    it("includes shipping details but hides pricing", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "logistics");
      assert.equal(view.data.incoterm, "FOB");
      assert.equal(view.data.destinationPort, "Rotterdam");
      assert.equal("unitPriceUsd" in view.data, false);
      assert.equal("totalValueUsd" in view.data, false);
      assert.equal("financingBank" in view.data, false);
    });
  });

  describe("regulator view", () => {
    it("includes sustainability grade but hides pricing", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "regulator");
      assert.equal(view.data.sustainabilityGrade, "A");
      assert.equal(view.data.quantity, 20);
      assert.equal("unitPriceUsd" in view.data, false);
      assert.equal("financingBank" in view.data, false);
    });
  });

  describe("supplier view", () => {
    it("includes pricing but hides financing details", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "supplier");
      assert.equal(view.data.unitPriceUsd, 15);
      assert.equal(view.data.quantity, 20);
      assert.equal("financingBank" in view.data, false);
      assert.equal("sustainabilityGrade" in view.data, false);
    });
  });

  describe("audit proof", () => {
    it("produces a consistent SHA-256 proof for same order", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view1 = ledger.createView("PO-1", "bank");
      const view2 = ledger.createView("PO-1", "logistics");

      assert.equal(typeof view1.auditProof, "string");
      assert.equal((view1.auditProof as string).length, 64);
      assert.equal(view1.auditProof, view2.auditProof);
    });

    it("produces different proofs for different orders", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());
      ledger.publishOrder({ ...sampleOrder(), id: "PO-2", quantity: 99 });

      const proof1 = ledger.createView("PO-1", "bank").auditProof;
      const proof2 = ledger.createView("PO-2", "bank").auditProof;

      assert.notEqual(proof1, proof2);
    });
  });

  describe("error handling", () => {
    it("throws for unknown order ID", () => {
      const ledger = new SelectiveDisclosureLedger();
      assert.throws(
        () => ledger.createView("PO-UNKNOWN", "bank"),
        /unknown order/i,
      );
    });
  });

  describe("all audiences", () => {
    it("each audience receives orderId and a non-empty data object", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const audiences = ["logistics", "bank", "regulator", "supplier"] as const;
      for (const audience of audiences) {
        const view = ledger.createView("PO-1", audience);
        assert.equal(view.orderId, "PO-1");
        assert.equal(view.audience, audience);
        assert.ok(Object.keys(view.data).length > 0);
      }
    });
  });

  describe("HSM-signed audit proofs", () => {
    const createHsm = () => {
      const hsm = new HsmClient();
      hsm.initialize({ slotId: "slot-1", label: "smoke-test" });
      hsm.generateKeyPair("audit-signer");
      return hsm;
    };

    it("produces a SignedAuditProof when HSM is provided", () => {
      const hsm = createHsm();
      const ledger = new SelectiveDisclosureLedger({
        hsm,
        signerKeyLabel: "audit-signer",
      });
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "bank");
      assert.equal(typeof view.auditProof, "object");
      const proof = view.auditProof as SignedAuditProof;
      assert.ok(proof.hash.length > 0);
      assert.ok(proof.signature.length > 0);
      assert.equal(proof.signerKeyLabel, "audit-signer");
      assert.ok(proof.timestamp.length > 0);
    });

    it("signature verifies with the public key", () => {
      const hsm = createHsm();
      const ledger = new SelectiveDisclosureLedger({
        hsm,
        signerKeyLabel: "audit-signer",
      });
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "bank");
      const proof = view.auditProof as SignedAuditProof;

      // Reconstruct the preimage the projector signed
      const preimage = [
        JSON.stringify(sampleOrder()),
        "bank",
        proof.timestamp,
      ].join("\0");
      const valid = hsm.verify("audit-signer", preimage, proof.signature);
      assert.equal(valid, true);
    });

    it("signature fails verification when view content changes", () => {
      const hsm = createHsm();
      const ledger = new SelectiveDisclosureLedger({
        hsm,
        signerKeyLabel: "audit-signer",
      });
      ledger.publishOrder(sampleOrder());

      const bankView = ledger.createView("PO-1", "bank");
      const bankProof = bankView.auditProof as SignedAuditProof;

      // A different audience produces a different preimage
      const tamperedPreimage = [
        JSON.stringify(sampleOrder()),
        "logistics",
        bankProof.timestamp,
      ].join("\0");

      // The bank signature must not verify against the logistics preimage
      const valid = hsm.verify(
        "audit-signer",
        tamperedPreimage,
        bankProof.signature,
      );
      assert.equal(valid, false);
    });

    it("remains backward compatible without HSM", () => {
      const ledger = new SelectiveDisclosureLedger();
      ledger.publishOrder(sampleOrder());

      const view = ledger.createView("PO-1", "bank");
      assert.equal(typeof view.auditProof, "string");
      assert.equal((view.auditProof as string).length, 64);
    });
  });
});
