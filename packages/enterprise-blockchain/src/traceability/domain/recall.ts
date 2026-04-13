export interface RecallRule {
  readonly suspectSuppliers: string[];
  readonly flaggedLotIds: string[];
  readonly maxTemperatureCelsius: number;
}

export interface RecallAssessment {
  readonly impactedLotIds: string[];
  readonly impactedShipmentIds: string[];
  readonly impactedDestinations: string[];
  readonly reasons: string[];
}
