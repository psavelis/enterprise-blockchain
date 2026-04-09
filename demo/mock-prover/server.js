/**
 * Mock Stone STARK Prover Server
 *
 * Simulates the Stone prover gRPC/HTTP API for demo and testing.
 * Returns realistic mock STARK proofs with configurable latency.
 */

const express = require("express");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const METRICS_PORT = process.env.METRICS_PORT || 9100;
const MIN_LATENCY_MS = parseInt(process.env.MIN_LATENCY_MS || "500", 10);
const MAX_LATENCY_MS = parseInt(process.env.MAX_LATENCY_MS || "2000", 10);

// Metrics
let totalProofs = 0;
let validVerifications = 0;
let totalLatencyMs = 0;

// Generate realistic-looking STARK proof
function generateMockProof() {
  const proofSize = 4096; // Typical STARK proof size in bytes
  const proofBytes = crypto.randomBytes(proofSize);
  return "0x" + proofBytes.toString("hex");
}

// Generate field element (STARK prime field)
function generateFieldElement() {
  // STARK prime: 2^251 + 17 * 2^192 + 1
  const bytes = crypto.randomBytes(32);
  return "0x" + bytes.toString("hex");
}

// Simulate proof generation latency
function simulateLatency() {
  const latency =
    MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);
  return new Promise((resolve) => setTimeout(resolve, latency));
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "mock-stone-prover" });
});

// Prove endpoint - generates a STARK proof
app.post("/prove", async (req, res) => {
  const startTime = Date.now();

  try {
    const { program, input, layout } = req.body;

    console.log(
      `[PROVE] Generating proof for program: ${program}, layout: ${layout || "plain"}`,
    );

    // Simulate proof generation time
    await simulateLatency();

    const proof = generateMockProof();
    const publicInputs = [
      generateFieldElement(), // state_root
      generateFieldElement(), // commitment
      generateFieldElement(), // output_hash
    ];

    const executionTimeMs = Date.now() - startTime;
    totalProofs++;
    totalLatencyMs += executionTimeMs;

    console.log(`[PROVE] Proof generated in ${executionTimeMs}ms`);

    res.json({
      proof,
      public_inputs: publicInputs,
      verification_key: generateFieldElement(),
      execution_time_ms: executionTimeMs,
      prover_version: "mock-stone-1.0.0",
    });
  } catch (error) {
    console.error("[PROVE] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Verify endpoint - verifies a STARK proof
app.post("/verify", async (req, res) => {
  const { proof } = req.body;

  if (!proof) {
    return res.status(400).json({ error: "Missing proof" });
  }

  // Simulate verification (always valid for mock)
  await simulateLatency();
  validVerifications++;

  console.log(`[VERIFY] Proof verified: VALID`);

  res.json({
    valid: true,
    verification_time_ms: Date.now(),
  });
});

// Metrics endpoint (Prometheus format)
const metricsApp = express();

metricsApp.get("/metrics", (req, res) => {
  const avgLatency = totalProofs > 0 ? totalLatencyMs / totalProofs : 0;

  res.set("Content-Type", "text/plain");
  res.send(`# HELP stone_prover_proofs_total Total proofs generated
# TYPE stone_prover_proofs_total counter
stone_prover_proofs_total ${totalProofs}

# HELP stone_prover_verifications_total Total verifications performed
# TYPE stone_prover_verifications_total counter
stone_prover_verifications_total ${validVerifications}

# HELP stone_prover_avg_latency_ms Average proof generation latency
# TYPE stone_prover_avg_latency_ms gauge
stone_prover_avg_latency_ms ${avgLatency.toFixed(2)}

# HELP stone_prover_up Prover service status
# TYPE stone_prover_up gauge
stone_prover_up 1
`);
});

metricsApp.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// Start servers
app.listen(PORT, () => {
  console.log(`Mock Stone Prover listening on port ${PORT}`);
});

metricsApp.listen(METRICS_PORT, () => {
  console.log(`Metrics server listening on port ${METRICS_PORT}`);
});
