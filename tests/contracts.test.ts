import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FoodTraceContract,
  type ProductLot,
} from "../contracts/fabric/FoodTraceContract";

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

    it("rejects duplicate shipmentId", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-SHIP-DUP", "FR", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-SHIP-DUP",
        "SHIP-DUP",
        "Paris",
        "Berlin",
        "2026-02-02",
      );
      assert.throws(
        () =>
          contract.recordShipment(
            "LOT-SHIP-DUP",
            "SHIP-DUP",
            "Lyon",
            "Munich",
            "2026-02-03",
          ),
        /already exists/,
      );
    });

    it("rejects empty shipmentId", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-EMPTY-SHIP", "IT", "Farm", "2026-02-01");
      assert.throws(
        () =>
          contract.recordShipment(
            "LOT-EMPTY-SHIP",
            "",
            "Rome",
            "Vienna",
            "2026-02-02",
          ),
        /shipmentId is required/,
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

    it("rejects empty sensorId", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-SENSOR", "DE", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-SENSOR",
        "SHIP-SENSOR",
        "Berlin",
        "Hamburg",
        "2026-02-02",
      );
      assert.throws(
        () =>
          contract.recordTelemetry(
            "SHIP-SENSOR",
            "",
            "temperature",
            5,
            "celsius",
            "2026-02-02T08:00:00Z",
          ),
        /sensorId is required/,
      );
    });

    it("rejects empty recordedAt", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-TIME", "NL", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-TIME",
        "SHIP-TIME",
        "Amsterdam",
        "Brussels",
        "2026-02-02",
      );
      assert.throws(
        () =>
          contract.recordTelemetry(
            "SHIP-TIME",
            "SENS-01",
            "temperature",
            5,
            "celsius",
            "",
          ),
        /recordedAt is required/,
      );
    });

    it("records multiple metrics for same shipment", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-MULTI", "BE", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-MULTI",
        "SHIP-MULTI",
        "Brussels",
        "Paris",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-MULTI",
        "SENS-01",
        "temperature",
        4.5,
        "celsius",
        "2026-02-02T08:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-MULTI",
        "SENS-02",
        "humidity",
        85,
        "percent",
        "2026-02-02T08:00:00Z",
      );

      const chain = contract.traceOrigin("LOT-MULTI");
      assert.equal(chain.telemetry.length, 2);

      const metrics = chain.telemetry.map((t) => t.metric).sort();
      assert.deepEqual(metrics, ["humidity", "temperature"]);
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

    it("aggregates multiple shipments for same lot", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-MULTI-SHIP", "AT", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-MULTI-SHIP",
        "SHIP-MS-1",
        "Vienna",
        "Munich",
        "2026-02-02",
      );
      contract.recordShipment(
        "LOT-MULTI-SHIP",
        "SHIP-MS-2",
        "Munich",
        "Paris",
        "2026-02-03",
      );
      contract.recordTelemetry(
        "SHIP-MS-1",
        "S1",
        "temperature",
        5.0,
        "celsius",
        "2026-02-02T08:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-MS-2",
        "S2",
        "temperature",
        5.5,
        "celsius",
        "2026-02-03T08:00:00Z",
      );

      const chain = contract.traceOrigin("LOT-MULTI-SHIP");

      assert.equal(chain.shipments.length, 2);
      assert.equal(chain.telemetry.length, 2);
    });

    it("isolates telemetry to correct lot (does not bleed across lots)", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-ISO-A", "CH", "Farm A", "2026-02-01");
      contract.createProduct("LOT-ISO-B", "CH", "Farm B", "2026-02-01");
      contract.recordShipment(
        "LOT-ISO-A",
        "SHIP-ISO-A",
        "Zurich",
        "Geneva",
        "2026-02-02",
      );
      contract.recordShipment(
        "LOT-ISO-B",
        "SHIP-ISO-B",
        "Basel",
        "Bern",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-ISO-A",
        "S1",
        "temperature",
        6.0,
        "celsius",
        "2026-02-02T08:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-ISO-B",
        "S2",
        "temperature",
        7.0,
        "celsius",
        "2026-02-02T08:00:00Z",
      );

      const chainA = contract.traceOrigin("LOT-ISO-A");
      const chainB = contract.traceOrigin("LOT-ISO-B");

      assert.equal(chainA.telemetry.length, 1);
      assert.equal(chainA.telemetry[0]!.value, 6.0);
      assert.equal(chainB.telemetry.length, 1);
      assert.equal(chainB.telemetry[0]!.value, 7.0);
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

    it("value exactly at threshold is not a breach (boundary test)", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-BOUNDARY", "GR", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-BOUNDARY",
        "SHIP-BOUND",
        "Athens",
        "Rome",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-BOUND",
        "S1",
        "temperature",
        5.0, // exactly at threshold
        "celsius",
        "2026-02-02T08:00:00Z",
      );

      const result = contract.assessRecall("LOT-BOUNDARY", "temperature", 5.0);

      assert.equal(result.safe, true);
      assert.equal(result.breachedReadings.length, 0);
    });

    it("only counts matching metric for recall", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-METRIC", "CZ", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-METRIC",
        "SHIP-METRIC",
        "Prague",
        "Vienna",
        "2026-02-02",
      );
      contract.recordTelemetry(
        "SHIP-METRIC",
        "S1",
        "temperature",
        4.0, // below threshold
        "celsius",
        "2026-02-02T08:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-METRIC",
        "S2",
        "humidity",
        95, // above any threshold, but wrong metric
        "percent",
        "2026-02-02T08:00:00Z",
      );

      const result = contract.assessRecall("LOT-METRIC", "temperature", 5.0);

      assert.equal(result.safe, true);
      assert.equal(result.breachedReadings.length, 0);
    });

    it("detects multiple breached shipments in single lot", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-MULTI-BREACH", "PL", "Farm", "2026-02-01");
      contract.recordShipment(
        "LOT-MULTI-BREACH",
        "SHIP-MB-1",
        "Warsaw",
        "Berlin",
        "2026-02-02",
      );
      contract.recordShipment(
        "LOT-MULTI-BREACH",
        "SHIP-MB-2",
        "Berlin",
        "Amsterdam",
        "2026-02-03",
      );
      contract.recordTelemetry(
        "SHIP-MB-1",
        "S1",
        "temperature",
        8.0, // breach
        "celsius",
        "2026-02-02T08:00:00Z",
      );
      contract.recordTelemetry(
        "SHIP-MB-2",
        "S2",
        "temperature",
        9.0, // breach
        "celsius",
        "2026-02-03T08:00:00Z",
      );

      const result = contract.assessRecall(
        "LOT-MULTI-BREACH",
        "temperature",
        5.0,
      );

      assert.equal(result.safe, false);
      assert.equal(result.impactedShipmentIds.length, 2);
      assert.equal(result.breachedReadings.length, 2);
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

    it("event payload contains correct data", () => {
      const contract = new FoodTraceContract();
      contract.createProduct("LOT-EVT", "SE", "Nordic Farm", "2026-02-01");

      const event = contract.events[0];
      assert.equal(event!.name, "LotCreated");

      const payload = JSON.parse(event!.payload) as ProductLot;
      assert.equal(payload.lotId, "LOT-EVT");
      assert.equal(payload.producer, "Nordic Farm");
      assert.equal(payload.origin, "SE");
    });
  });
});
