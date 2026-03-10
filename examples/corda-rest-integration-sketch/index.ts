import { CordaGatewayClientSketch } from "../../modules/integrations/corda-gateway/src/index";

const client = new CordaGatewayClientSketch();

const profile = client.createProfile({
  baseUrl: "https://corda-gateway.example.org",
  network: "health-net",
  bearerToken: "demo-token",
  timeoutMs: 10000,
});

const request = client.buildIssueClearanceRequest(profile, {
  providerId: "PROV-REST-001",
  facility: "Amsterdam Surgical Centre",
  jurisdiction: "NL",
  scheduledAt: "2026-05-11T08:30:00Z",
  requiredCredentials: ["medical-license", "sedation-privilege"],
  approved: false,
  reasons: ["Missing sedation-privilege credential for jurisdiction NL."],
});

console.log("Corda REST Integration Sketch");
console.log(JSON.stringify({ profile, request }, null, 2));