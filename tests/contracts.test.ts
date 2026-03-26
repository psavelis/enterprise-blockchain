import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FoodTraceContract } from "../contracts/fabric/FoodTraceContract";

describe("FoodTraceContract (Fabric chaincode)", () => {
  describe("createProduct", () => {
    it("registers a product lot", () => {
      const contract = new FoodTraceContract();
      const lot = contract.createProduct(
        "LOT-001",
        "MX",
        "Pacific Produce",
        "2026-03-01",
      );

      assert.equal(lot.lotId, "LOT-001");
      assert.equal(lot.origin, "MX");
      assert.equal(lot.producer, "Pacific Produce");
      assert.equal(lot.docType, "productLot");
    });

    it("rejects empty lotId", () => {
      const contract = new FoodTraceContract();
      assert.throws(
        () => contract.createProduct("", "MX", "P", "2026-01-01"),
        /lotId is required/,
      );
    });

    it("rejects duplicate lot", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-DUP", "US", "P", "2026-01-01");
      assert.throws(
        () => contract.createProduct("LOT-DUP", "US", "P", "2026-01-01"),
        /already exists/,
      );
    });
  });

  describe("recordShipment", () => {
    it("records a shipment for an existing lot", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-002", "ES", "Farm", "2026-02-01");
      const shipment = contract.recordShipment(
        "LOT-002",
        "SHIP-001",
        "Madrid",
        "Rotterdam",
        "2026-02-02T04:00:00Z",
      );

      assert.equal(shipment.shipmentId, "SHIP-001");
      assert.equal(shipment.lotId, "LOT-002");
      assert.equal(shipment.destination, "Rotterdam");
    });

    it("rejects shipment for unknown lot", () => {
      const contract = new FoodTraceContract();
      assert.throws(
        () =>
          contract.recordShipment("LOT-NONE", "S-1", "A", "B", "2026-01-01"),
        /does not exist/,
      );
    });
  });

  describe("recordTelemetry", () => {
    it("appends a telemetry reading", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-003", "PT", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-003",
        "SHIP-002",
        "Porto",
        "Hamburg",
        "2026-02-02",
      );

      const entry = contract.recordTelemetry(
        "SHIP-002",
        "SENS-01",
        "temperature",
        7.9,
        "celsius",
        "2026-02-02T08:00:00Z",
      );

      assert.equal(entry.shipmentId, "SHIP-002");
      assert.equal(entry.metric, "temperature");
      assert.equal(entry.value, 7.9);
    });

    it("rejects telemetry for unknown shipment", () => {
      const contract = new FoodTraceContract();
      assert.throws(
        () =>
          contract.recordTelemetry(
            "SHIP-NONE",
            "S",
            "temp",
            5,
            "C",
            "2026-01-01",
          ),
        /does not exist/,
      );
    });
  });

  describe("traceOrigin", () => {
    it("returns full provenance chain", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-004", "ES", "Green Valley", "2026-02-17");
      contract.recordShipment(
        "LOT-004",
        "SHIP-A",
        "Madrid",
        "Rotterdam",
        "2026-02-19",
      );
      contract.recordTelemetry(
        "SHIP-A",
        "S1",
        "temperature",
        5.9,
        "celsius",
        "2026-02-19T08:00:00Z",
      );

      const chain = contract.traceOrigin("LOT-004");

      assert.equal(chain.lot.lotId, "LOT-004");
      assert.equal(chain.shipments.length, 1);
      assert.equal(chain.telemetry.length, 1);
    });

    it("throws for unknown lot", () => {
      const contract = new FoodTraceContract();
      assert.throws(() => contract.traceOrigin("LOT-X"), /does not exist/);
    });
  });

  describe("assessRecall", () => {
    it("identifies breached shipments", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-005", "ES", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-005",
        "SHIP-B",
        "Madrid",
        "Rotterdam",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-B",
        "S1",
        "temperature",
        8.5,
        "celsius",
        "2026-02-02T10:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-B",
        "S1",
        "temperature",
        4.2,
        "celsius",
        "2026-02-02T12:00:00Z",
      );

      const result = contract.assessRecall("LOT-005", "temperature", 5.0);

      assert.equal(result.safe, false);
      assert.equal(result.impactedShipmentIds.length, 1);
      assert.equal(result.impactedShipmentIds[0], "SHIP-B");
      assert.equal(result.breachedReadings.length, 1);
      assert.equal(result.breachedReadings[0]!.value, 8.5);
    });

    it("reports safe when no breaches", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-006", "PT", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-006",
        "SHIP-C",
        "Porto",
        "Hamburg",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-C",
        "S1",
        "temperature",
        3.8,
        "celsius",
        "2026-02-02T09:00:00Z",
      );

      const result = contract.assessRecall("LOT-006", "temperature", 5.0);

      assert.equal(result.safe, true);
      assert.equal(result.impactedShipmentIds.length, 0);
    });
  });

  describe("events", () => {
    it("emits events for all operations", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-E", "US", "P", "2026-01-01");
      contract.recordShipment("LOT-E", "SHIP-E", "A", "B", "2026-01-02");
      contract.recordTelemetry(
        "SHIP-E",
        "S",
        "temp",
        5,
        "C",
        "2026-01-02T12:00:00Z",
      );
      contract.assessRecall("LOT-E", "temp", 10);

      const names = contract.events.map((e) => e.name);
      assert.deepEqual(names, [
        "LotCreated",
        "ShipmentRecorded",
        "TelemetryRecorded",
        "RecallAssessed",
      ]);
    });
  });
});
