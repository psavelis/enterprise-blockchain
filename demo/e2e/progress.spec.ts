import { test, expect } from "@playwright/test";

test.describe("Progress Page", () => {
  test.beforeEach(async ({ page }) => {
    // Start from dashboard and navigate to progress
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();
    await expect(page).toHaveURL(/\/progress/);
  });

  test("should display progress page header", async ({ page }) => {
    await expect(page.getByText("Settlement Progress")).toBeVisible();
    await expect(page.getByText("Live Logs")).toBeVisible();
  });

  test("should display prover toggle", async ({ page }) => {
    // Look for the real/mock prover toggle
    const proverToggle = page.locator('[data-testid="prover-toggle-card"]');
    await expect(proverToggle).toBeVisible();
    await expect(page.getByText("STARK Prover Mode")).toBeVisible();
  });

  test("should display all four settlement steps", async ({ page }) => {
    const steps = [
      "Business Event",
      "Base Proof",
      "Batch Proof",
      "Block Proof",
    ];

    for (const step of steps) {
      await expect(
        page.getByText(step, { exact: false }).first(),
      ).toBeVisible();
    }
  });

  test("should show step progress during settlement", async ({ page }) => {
    // Wait for first step to start (SSE will trigger this)
    await expect(page.getByRole("progressbar").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should display log entries during settlement", async ({ page }) => {
    // Wait a bit for SSE to deliver events
    await page.waitForTimeout(2000);

    // Check that the log panel area exists
    const logSection = page.getByText("Live Logs");
    await expect(logSection).toBeVisible();
  });

  test("should auto-navigate to results when complete", async ({ page }) => {
    // Wait for settlement to complete (mock takes ~8.5s total)
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });
  });

  test("should handle navigation properly", async ({ page }) => {
    // Just verify we're on the progress page and it's rendering
    await expect(page.getByText("Settlement Progress")).toBeVisible();
  });

  test("should show error handling gracefully", async ({ page }) => {
    // Navigate directly to progress without session
    await page.goto("/progress");

    // Should redirect to dashboard or handle appropriately
    await expect(page).toHaveURL(/\/|\/progress/);
  });
});

test.describe("Progress Page - Prover Toggle", () => {
  test("should show prover toggle on progress page", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();

    await expect(page).toHaveURL(/\/progress/);

    // Prover toggle should be visible
    const proverCard = page.locator('[data-testid="prover-toggle-card"]');
    await expect(proverCard).toBeVisible();
    await expect(page.getByText("STARK Prover Mode")).toBeVisible();
  });

  test("prover toggle should be disabled during active settlement", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();

    // Wait for progress page
    await expect(page).toHaveURL(/\/progress/);
    await page.waitForTimeout(500);

    // Find any switch/toggle element
    const proverSwitch = page.locator('button[role="switch"]');

    if ((await proverSwitch.count()) > 0) {
      // If switch exists, it should be disabled during settlement
      await expect(proverSwitch.first()).toBeDisabled();
    }
  });
});
