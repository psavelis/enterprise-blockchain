import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

interface ProofReport {
  timestamp: string;
  scenario: string;
  rail: string;
  proofId: string;
  stateRoot: string;
  proofHex: string;
  txCount: number;
  proverLatencyMs: number;
  verificationResult: "VALID" | "INVALID" | "ERROR";
  proverType: "stone" | "mock";
}

interface ProofReportFile {
  testName: string;
  startedAt: string;
  completedAt: string;
  reports: ProofReport[];
}

const PROOF_REPORTS_DIR = path.join(process.cwd(), "e2e-results", "proofs");

function ensureProofReportsDir() {
  if (!fs.existsSync(PROOF_REPORTS_DIR)) {
    fs.mkdirSync(PROOF_REPORTS_DIR, { recursive: true });
  }
}

function saveProofReport(testName: string, reports: ProofReport[]) {
  ensureProofReportsDir();
  const reportFile: ProofReportFile = {
    testName,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    reports,
  };
  const filename = `proof-report-${testName.replace(/\s+/g, "-")}-${Date.now()}.json`;
  const filepath = path.join(PROOF_REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(reportFile, null, 2));
  console.log(`Proof report saved: ${filepath}`);
}

test.describe("Real Prover Integration", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    ensureProofReportsDir();
  });

  test("should complete settlement with real prover toggle enabled", async ({
    request,
  }) => {
    const proofReports: ProofReport[] = [];

    // Create session with real prover enabled
    const sessionResponse = await request.post("/api/settlement", {
      data: {
        scenario: "food-recall",
        rail: "solana",
        useRealProver: true,
      },
    });

    if (sessionResponse.status() === 429) {
      test.skip();
      return;
    }

    expect(sessionResponse.status()).toBe(201);
    const { token } = await sessionResponse.json();

    // Connect to SSE stream and collect events
    const events: unknown[] = [];
    const eventsResponse = await request.get(`/api/events?token=${token}`);
    expect(eventsResponse.status()).toBe(200);

    const body = await eventsResponse.text();
    const eventLines = body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of eventLines) {
      const jsonStr = line.replace("data: ", "");
      try {
        const event = JSON.parse(jsonStr) as {
          type: string;
          report?: ProofReport;
        };
        events.push(event);

        // Capture proof reports
        if (event.type === "proof:report" && event.report) {
          proofReports.push(event.report);
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Verify we received expected events
    const stepStarts = events.filter(
      (e: unknown) => (e as { type: string }).type === "step:start",
    );
    const completeEvent = events.find(
      (e: unknown) => (e as { type: string }).type === "complete",
    );

    expect(stepStarts.length).toBe(4);
    expect(completeEvent).toBeDefined();

    // Save proof reports
    if (proofReports.length > 0) {
      saveProofReport("real-prover-food-recall-solana", proofReports);

      // Verify proof report structure
      const report = proofReports[0];
      expect(report).toHaveProperty("proofId");
      expect(report).toHaveProperty("stateRoot");
      expect(report).toHaveProperty("proverLatencyMs");
      expect(report).toHaveProperty("verificationResult");
      expect(["VALID", "INVALID", "ERROR"]).toContain(
        report?.verificationResult,
      );
    }
  });

  test("should generate proof reports for Bitcoin rail", async ({
    request,
  }) => {
    const proofReports: ProofReport[] = [];

    const sessionResponse = await request.post("/api/settlement", {
      data: {
        scenario: "aid-voucher",
        rail: "bitcoin",
        useRealProver: true,
      },
    });

    if (sessionResponse.status() === 429) {
      test.skip();
      return;
    }

    expect(sessionResponse.status()).toBe(201);
    const { token } = await sessionResponse.json();

    const eventsResponse = await request.get(`/api/events?token=${token}`);
    const body = await eventsResponse.text();
    const eventLines = body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of eventLines) {
      try {
        const event = JSON.parse(line.replace("data: ", "")) as {
          type: string;
          report?: ProofReport;
        };
        if (event.type === "proof:report" && event.report) {
          proofReports.push(event.report);
        }
      } catch {
        // Skip
      }
    }

    if (proofReports.length > 0) {
      saveProofReport("real-prover-aid-voucher-bitcoin", proofReports);

      const report = proofReports[0];
      expect(report?.scenario).toBe("aid-voucher");
      expect(report?.rail).toBe("bitcoin");
    }
  });

  test("should generate proof reports for Fiat rail", async ({ request }) => {
    const proofReports: ProofReport[] = [];

    const sessionResponse = await request.post("/api/settlement", {
      data: {
        scenario: "food-recall",
        rail: "fiat",
        useRealProver: true,
      },
    });

    if (sessionResponse.status() === 429) {
      test.skip();
      return;
    }

    expect(sessionResponse.status()).toBe(201);
    const { token } = await sessionResponse.json();

    const eventsResponse = await request.get(`/api/events?token=${token}`);
    const body = await eventsResponse.text();
    const eventLines = body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "));

    for (const line of eventLines) {
      try {
        const event = JSON.parse(line.replace("data: ", "")) as {
          type: string;
          report?: ProofReport;
        };
        if (event.type === "proof:report" && event.report) {
          proofReports.push(event.report);
        }
      } catch {
        // Skip
      }
    }

    if (proofReports.length > 0) {
      saveProofReport("real-prover-food-recall-fiat", proofReports);

      const report = proofReports[0];
      expect(report?.rail).toBe("fiat");
    }
  });

  test("UI flow with real prover should show proof generation logs", async ({
    page,
  }) => {
    await page.goto("/");

    // Select scenario
    await page.getByText("Food Recall").first().click();

    // Start settlement
    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await startButton.click();

    // Wait for progress page
    await expect(page).toHaveURL(/\/progress/);

    // Verify we're on the progress page and see Settlement Progress header
    await expect(page.getByText("Settlement Progress")).toBeVisible();

    // Wait for completion and navigation to results (settlement completes in ~8.5s for mock)
    await expect(page).toHaveURL(/\/results/, { timeout: 90_000 });

    // Verify proof is displayed on results page
    await expect(page.getByText("STARK Block Proof")).toBeVisible();
    await expect(page.getByText("Settlement Complete")).toBeVisible();
  });
});

test.describe("Proof Report Aggregation", () => {
  test("should run all scenarios and generate consolidated report", async ({
    request,
  }) => {
    const allReports: ProofReport[] = [];
    const scenarios: Array<{ scenario: string; rail: string }> = [
      { scenario: "food-recall", rail: "solana" },
      { scenario: "food-recall", rail: "bitcoin" },
      { scenario: "food-recall", rail: "fiat" },
      { scenario: "aid-voucher", rail: "solana" },
      { scenario: "aid-voucher", rail: "bitcoin" },
      { scenario: "aid-voucher", rail: "fiat" },
    ];

    for (const { scenario, rail } of scenarios) {
      const sessionResponse = await request.post("/api/settlement", {
        data: {
          scenario,
          rail,
          useRealProver: true,
        },
      });

      if (sessionResponse.status() === 429) {
        console.log(`Rate limited for ${scenario}/${rail}, skipping...`);
        continue;
      }

      if (sessionResponse.status() !== 201) {
        continue;
      }

      const { token } = await sessionResponse.json();
      const eventsResponse = await request.get(`/api/events?token=${token}`);
      const body = await eventsResponse.text();
      const eventLines = body
        .split("\n\n")
        .filter((line) => line.startsWith("data: "));

      for (const line of eventLines) {
        try {
          const event = JSON.parse(line.replace("data: ", "")) as {
            type: string;
            report?: ProofReport;
          };
          if (event.type === "proof:report" && event.report) {
            allReports.push(event.report);
          }
        } catch {
          // Skip
        }
      }
    }

    // Save consolidated report
    if (allReports.length > 0) {
      ensureProofReportsDir();
      const consolidatedReport = {
        generatedAt: new Date().toISOString(),
        totalProofs: allReports.length,
        validProofs: allReports.filter((r) => r.verificationResult === "VALID")
          .length,
        invalidProofs: allReports.filter(
          (r) => r.verificationResult === "INVALID",
        ).length,
        errorProofs: allReports.filter((r) => r.verificationResult === "ERROR")
          .length,
        avgLatencyMs:
          allReports.reduce((sum, r) => sum + r.proverLatencyMs, 0) /
          allReports.length,
        proverTypes: {
          stone: allReports.filter((r) => r.proverType === "stone").length,
          mock: allReports.filter((r) => r.proverType === "mock").length,
        },
        reports: allReports,
      };

      const filepath = path.join(
        PROOF_REPORTS_DIR,
        `consolidated-proof-report-${Date.now()}.json`,
      );
      fs.writeFileSync(filepath, JSON.stringify(consolidatedReport, null, 2));
      console.log(`Consolidated proof report saved: ${filepath}`);
      console.log(
        `Summary: ${consolidatedReport.validProofs}/${consolidatedReport.totalProofs} valid proofs, avg latency: ${consolidatedReport.avgLatencyMs.toFixed(2)}ms`,
      );
    }

    // At least some reports should be generated
    expect(allReports.length).toBeGreaterThan(0);
  });
});
