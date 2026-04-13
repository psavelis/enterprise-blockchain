export interface ProductLot {
  readonly id: string;
  readonly productName: string;
  readonly supplier: string;
  readonly originCountry: string;
  readonly harvestDate: string;
  readonly expirationDate: string;
}

export interface Shipment {
  readonly id: string;
  readonly lotId: string;
  readonly from: string;
  readonly to: string;
  readonly departedAt: string;
  readonly receivedAt?: string;
}

export interface TelemetryReading {
  readonly shipmentId: string;
  readonly timestamp: string;
  readonly temperatureCelsius: number;
  readonly location: string;
}
