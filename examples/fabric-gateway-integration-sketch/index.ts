import { FabricGatewayClientSketch } from "../../modules/integrations/fabric-gateway/src/index";

const client = new FabricGatewayClientSketch();

const profile = client.createProfile({
  mspId: "RetailerMSP",
  channelName: "food-trace",
  chaincodeName: "food-trace-contract",
  peerEndpoint: "peer0.retailer.example.com:7051",
  tlsCertPath: "./crypto/peer/tls/ca.crt",
  identityCertPath: "./crypto/user/signcerts/cert.pem",
  privateKeyPath: "./crypto/user/keystore/key.pem",
});

const shipmentPlan = client.buildRecordShipmentProposal({
  lotId: "LOT-GATEWAY-001",
  shipmentId: "SHIP-GATEWAY-001",
  temperatureCelsius: 7.1,
  location: "Bordeaux",
  telemetryTimestamp: "2026-03-10T11:20:00Z",
  endorsingOrganizations: ["RetailerMSP", "CarrierMSP"],
});

console.log("Fabric Gateway Integration Sketch");
console.log(JSON.stringify({ profile, shipmentPlan }, null, 2));