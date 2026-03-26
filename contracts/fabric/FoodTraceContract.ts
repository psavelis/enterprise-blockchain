/**
 * FoodTraceContract — Hyperledger Fabric chaincode for food supply-chain
 * traceability.
 *
 * Transactions:
 *   CreateProduct  – register a product lot
 *   RecordShipment – record lot movement and optional telemetry
 *   RecordTelemetry – append an IoT sensor reading to a shipment
 *   TraceOrigin    – query the full provenance chain for a lot
 *   AssessRecall   – evaluate recall impact for a lot against a threshold
 *
 * Events:
 *   LotCreated | ShipmentRecorded | TelemetryRecorded | RecallAssessed
 *
 * This file is a self-contained demonstration of the chaincode business logic.
 * In a production deployment it would extend the `Contract` class from
 * `fabric-contract-api` and interact with the stub/context directly.
 * Here the world state is simulated with an in-memory key-value store so the
 * contract can be exercised and tested without a running Fabric peer.
 */

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

export interface ChaincodeEvent {
  name: string;
  payload: string;
}

// ── Simulated world state ───────────────────────────────────────────

class WorldState {
  private readonly store = new Map<string, string>();

  put(key: string, value: unknown): void {
    this.store.set(key, JSON.stringify(value));
  }

  get<T>(key: string): T | undefined {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }

  getByPrefix<T>(prefix: string): T[] {
    const results: T[] = [];
    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) {
        results.push(JSON.parse(value) as T);
      }
    }
    return results;
  }
}

// ── Contract ────────────────────────────────────────────────────────

export class FoodTraceContract {
  private readonly state = new WorldState();
  readonly events: ChaincodeEvent[] = [];

  /**
   * Register a new product lot in the world state.
   */
  createProduct(
    lotId: string,
    origin: string,
    producer: string,
    harvestedAt: string,
  ): ProductLot {
    if (!lotId) throw new Error("lotId is required");
    if (this.state.get<ProductLot>(`lot:${lotId}`)) {
      throw new Error(`Lot ${lotId} already exists`);
    }

    const lot: ProductLot = {
      docType: "productLot",
      lotId,
      producer,
      origin,
      harvestedAt,
      createdAt: new Date().toISOString(),
    };

    this.state.put(`lot:${lotId}`, lot);
    this.emit("LotCreated", lot);
    return lot;
  }

  /**
   * Record a shipment event for a lot.
   */
  recordShipment(
    lotId: string,
    shipmentId: string,
    origin: string,
    destination: string,
    departedAt: string,
  ): ShipmentRecord {
    if (!this.state.get<ProductLot>(`lot:${lotId}`)) {
      throw new Error(`Lot ${lotId} does not exist`);
    }

    const record: ShipmentRecord = {
      docType: "shipment",
      shipmentId,
      lotId,
      origin,
      destination,
      departedAt,
    };

    this.state.put(`shipment:${shipmentId}`, record);
    this.emit("ShipmentRecorded", record);
    return record;
  }

  /**
   * Append an IoT telemetry reading to a shipment.
   */
  recordTelemetry(
    shipmentId: string,
    sensorId: string,
    metric: string,
    value: number,
    unit: string,
    recordedAt: string,
  ): TelemetryEntry {
    if (!this.state.get<ShipmentRecord>(`shipment:${shipmentId}`)) {
      throw new Error(`Shipment ${shipmentId} does not exist`);
    }

    const entry: TelemetryEntry = {
      docType: "telemetry",
      shipmentId,
      sensorId,
      metric,
      value,
      unit,
      recordedAt,
    };

    const key = `telemetry:${shipmentId}:${sensorId}:${recordedAt}`;
    this.state.put(key, entry);
    this.emit("TelemetryRecorded", entry);
    return entry;
  }

  /**
   * Query the full provenance chain for a product lot.
   */
  traceOrigin(lotId: string): ProvenanceChain {
    const lot = this.state.get<ProductLot>(`lot:${lotId}`);
    if (!lot) throw new Error(`Lot ${lotId} does not exist`);

    const shipments = this.state
      .getByPrefix<ShipmentRecord>("shipment:")
      .filter((s) => s.lotId === lotId);

    const shipmentIds = new Set(shipments.map((s) => s.shipmentId));

    const telemetry = this.state
      .getByPrefix<TelemetryEntry>("telemetry:")
      .filter((t) => shipmentIds.has(t.shipmentId));

    return { lot, shipments, telemetry };
  }

  /**
   * Evaluate recall impact: find shipments with telemetry readings that
   * breach the provided threshold for a given metric.
   */
  assessRecall(
    lotId: string,
    metric: string,
    threshold: number,
  ): RecallAssessmentResult {
    const chain = this.traceOrigin(lotId);

    const breachedReadings = chain.telemetry.filter(
      (t) => t.metric === metric && t.value > threshold,
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

    this.emit("RecallAssessed", result);
    return result;
  }

  private emit(name: string, payload: unknown): void {
    this.events.push({ name, payload: JSON.stringify(payload) });
  }
}
