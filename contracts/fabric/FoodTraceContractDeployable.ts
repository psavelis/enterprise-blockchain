/**
 * FoodTraceContractDeployable — Hyperledger Fabric 2.5+ chaincode that extends
 * `fabric-contract-api` Contract for real peer deployment.
 *
 * This is the deployable counterpart of the in-memory `FoodTraceContract`.
 * Business rules and domain types are identical; the difference is that this
 * version reads and writes via `ctx.stub.putState()` / `getState()` /
 * `getStateByPartialCompositeKey()` and emits events via `ctx.stub.setEvent()`.
 *
 * ## Deployment
 *
 * See the README in this directory for `peer lifecycle chaincode` commands.
 *
 * ## Composite key scheme
 *
 * - Lots:      `productLot~lotId`
 * - Shipments: `shipment~lotId~shipmentId`
 * - Telemetry: `telemetry~shipmentId~sensorId~recordedAt`
 */

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";

// ── Domain types ────────────────────────────────────────────────────

export interface ProductLot {
  docType: "productLot";
  lotId: string;
  producer: string;
  origin: string;
  harvestedAt: string;
  createdAt: string;
}

export interface ShipmentRecord {
  docType: "shipment";
  shipmentId: string;
  lotId: string;
  origin: string;
  destination: string;
  departedAt: string;
}

export interface TelemetryEntry {
  docType: "telemetry";
  shipmentId: string;
  sensorId: string;
  metric: string;
  value: number;
  unit: string;
  recordedAt: string;
}

export interface ProvenanceChain {
  lot: ProductLot;
  shipments: ShipmentRecord[];
  telemetry: TelemetryEntry[];
}

export interface RecallAssessmentResult {
  lotId: string;
  impactedShipmentIds: string[];
  breachedReadings: TelemetryEntry[];
  safe: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function toBuffer(obj: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(obj));
}

async function getState<T>(ctx: Context, key: string): Promise<T | undefined> {
  const data = await ctx.stub.getState(key);
  if (!data || data.length === 0) return undefined;
  return JSON.parse(Buffer.from(data).toString("utf8")) as T;
}

async function getByCompositeKey<T>(
  ctx: Context,
  objectType: string,
  attributes: string[],
): Promise<T[]> {
  const results: T[] = [];
  const iterator = await ctx.stub.getStateByPartialCompositeKey(
    objectType,
    attributes,
  );

  let res = await iterator.next();
  while (!res.done) {
    if (res.value && res.value.value) {
      results.push(
        JSON.parse(Buffer.from(res.value.value).toString("utf8")) as T,
      );
    }
    res = await iterator.next();
  }
  await iterator.close();
  return results;
}

// ── Contract ────────────────────────────────────────────────────────

@Info({
  title: "FoodTraceContract",
  description:
    "Hyperledger Fabric chaincode for food supply-chain traceability",
})
export class FoodTraceContractDeployable extends Contract {
  constructor() {
    super("FoodTraceContract");
  }

  /**
   * Register a new product lot in the world state.
   */
  @Transaction()
  @Returns("ProductLot")
  async createProduct(
    ctx: Context,
    lotId: string,
    origin: string,
    producer: string,
    harvestedAt: string,
  ): Promise<ProductLot> {
    if (!lotId) throw new Error("lotId is required");

    const compositeKey = ctx.stub.createCompositeKey("productLot", [lotId]);
    const existing = await getState<ProductLot>(ctx, compositeKey);
    if (existing) throw new Error(`Lot ${lotId} already exists`);

    const lot: ProductLot = {
      docType: "productLot",
      lotId,
      producer,
      origin,
      harvestedAt,
      createdAt: new Date().toISOString(),
    };

    await ctx.stub.putState(compositeKey, toBuffer(lot));
    ctx.stub.setEvent("LotCreated", toBuffer(lot));
    return lot;
  }

  /**
   * Record a shipment event for a lot.
   */
  @Transaction()
  @Returns("ShipmentRecord")
  async recordShipment(
    ctx: Context,
    lotId: string,
    shipmentId: string,
    origin: string,
    destination: string,
    departedAt: string,
  ): Promise<ShipmentRecord> {
    if (!shipmentId) throw new Error("shipmentId is required");

    const shipmentKey = ctx.stub.createCompositeKey("shipment", [
      lotId,
      shipmentId,
    ]);
    const existing = await getState<ShipmentRecord>(ctx, shipmentKey);
    if (existing) throw new Error(`Shipment ${shipmentId} already exists`);

    const lotKey = ctx.stub.createCompositeKey("productLot", [lotId]);
    const lot = await getState<ProductLot>(ctx, lotKey);
    if (!lot) throw new Error(`Lot ${lotId} does not exist`);

    const record: ShipmentRecord = {
      docType: "shipment",
      shipmentId,
      lotId,
      origin,
      destination,
      departedAt,
    };

    await ctx.stub.putState(shipmentKey, toBuffer(record));
    ctx.stub.setEvent("ShipmentRecorded", toBuffer(record));
    return record;
  }

  /**
   * Append an IoT telemetry reading to a shipment.
   */
  @Transaction()
  @Returns("TelemetryEntry")
  async recordTelemetry(
    ctx: Context,
    shipmentId: string,
    sensorId: string,
    metric: string,
    value: string, // string for chaincode API; parsed to number internally
    unit: string,
    recordedAt: string,
  ): Promise<TelemetryEntry> {
    if (!sensorId) throw new Error("sensorId is required");
    if (!recordedAt) throw new Error("recordedAt is required");

    // Verify shipment exists via any lot
    const shipments = await getByCompositeKey<ShipmentRecord>(ctx, "shipment", []);
    const shipment = shipments.find((s) => s.shipmentId === shipmentId);
    if (!shipment) throw new Error(`Shipment ${shipmentId} does not exist`);

    const entry: TelemetryEntry = {
      docType: "telemetry",
      shipmentId,
      sensorId,
      metric,
      value: parseFloat(value),
      unit,
      recordedAt,
    };

    const key = ctx.stub.createCompositeKey("telemetry", [
      shipmentId,
      sensorId,
      recordedAt,
    ]);
    await ctx.stub.putState(key, toBuffer(entry));
    ctx.stub.setEvent("TelemetryRecorded", toBuffer(entry));
    return entry;
  }

  /**
   * Query the full provenance chain for a product lot.
   */
  @Transaction(false)
  @Returns("ProvenanceChain")
  async traceOrigin(ctx: Context, lotId: string): Promise<ProvenanceChain> {
    const lotKey = ctx.stub.createCompositeKey("productLot", [lotId]);
    const lot = await getState<ProductLot>(ctx, lotKey);
    if (!lot) throw new Error(`Lot ${lotId} does not exist`);

    const shipments = await getByCompositeKey<ShipmentRecord>(ctx, "shipment", [
      lotId,
    ]);
    const shipmentIds = new Set(shipments.map((s) => s.shipmentId));

    const allTelemetry = await getByCompositeKey<TelemetryEntry>(
      ctx,
      "telemetry",
      [],
    );
    const telemetry = allTelemetry.filter((t) =>
      shipmentIds.has(t.shipmentId),
    );

    return { lot, shipments, telemetry };
  }

  /**
   * Evaluate recall impact: find shipments with telemetry readings that
   * breach the provided threshold for a given metric.
   */
  @Transaction(false)
  @Returns("RecallAssessmentResult")
  async assessRecall(
    ctx: Context,
    lotId: string,
    metric: string,
    threshold: string, // string for chaincode API
  ): Promise<RecallAssessmentResult> {
    const chain = await this.traceOrigin(ctx, lotId);
    const t = parseFloat(threshold);

    const breachedReadings = chain.telemetry.filter(
      (e) => e.metric === metric && e.value > t,
    );

    const impactedShipmentIds = [
      ...new Set(breachedReadings.map((r) => r.shipmentId)),
    ];

    const result: RecallAssessmentResult = {
      lotId,
      impactedShipmentIds,
      breachedReadings,
      safe: breachedReadings.length === 0,
    };

    ctx.stub.setEvent("RecallAssessed", toBuffer(result));
    return result;
  }
}
