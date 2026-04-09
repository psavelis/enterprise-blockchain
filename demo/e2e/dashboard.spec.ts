import { test, expect } from "@playwright/test";

test.describe("Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display the page title and navbar", async ({ page }) => {
    await expect(page).toHaveTitle(/Enterprise Blockchain/i);
    await expect(
      page.getByText("Enterprise Blockchain Live Demo"),
    ).toBeVisible();
    await expect(page.getByText("Try Live")).toBeVisible();
  });

  test("should display scenario selection section", async ({ page }) => {
    await expect(page.getByText("Select Scenario")).toBeVisible();
    await expect(
      page.getByText(
        "Choose a business scenario to demonstrate STARK settlement",
      ),
    ).toBeVisible();
  });

  test("should display both scenario cards", async ({ page }) => {
    // Use first() since there might be multiple matches
    await expect(page.getByText("Food Recall").first()).toBeVisible();
    await expect(page.getByText("Aid Voucher").first()).toBeVisible();
  });

  test("should select Food Recall scenario", async ({ page }) => {
    // Click on the scenario card
    await page.getByText("Food Recall").first().click();

    // After clicking, the start button should be enabled
    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await expect(startButton).toBeEnabled();
  });

  test("should select Aid Voucher scenario", async ({ page }) => {
    await page.getByText("Aid Voucher").first().click();

    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await expect(startButton).toBeEnabled();
  });

  test("should toggle between scenarios", async ({ page }) => {
    // Select Food Recall
    await page.getByText("Food Recall").first().click();
    let startButton = page.getByRole("button", { name: /Start Settlement/i });
    await expect(startButton).toBeEnabled();

    // Select Aid Voucher
    await page.getByText("Aid Voucher").first().click();
    startButton = page.getByRole("button", { name: /Start Settlement/i });
    await expect(startButton).toBeEnabled();
  });

  test("should display rail selector", async ({ page }) => {
    // Rail selector should be a select element
    const railSelector = page.locator("select").first();
    await expect(railSelector).toBeVisible();
  });

  test("should have Solana as default rail", async ({ page }) => {
    // Solana should be the default value in the select
    const railSelector = page.locator("select").first();
    await expect(railSelector).toHaveValue("solana");
  });

  test("should change rail selection", async ({ page }) => {
    // Look for select element or dropdown
    const railSelector = page.locator("select").first();

    if (await railSelector.isVisible()) {
      await railSelector.selectOption("bitcoin");
      await expect(railSelector).toHaveValue("bitcoin");
    }
  });

  test("should disable Start button when no scenario selected", async ({
    page,
  }) => {
    const startButton = page.getByRole("button", { name: /Start Settlement/i });

    // Button should be disabled when no scenario selected
    if (await startButton.isVisible()) {
      await expect(startButton).toBeDisabled();
    }
  });

  test("should enable Start button after selecting scenario", async ({
    page,
  }) => {
    await page.getByText("Food Recall").first().click();

    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await expect(startButton).toBeEnabled();
  });

  test("should navigate to progress page on start", async ({ page }) => {
    await page.getByText("Food Recall").first().click();

    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await startButton.click();

    await expect(page).toHaveURL(/\/progress/);
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(page.getByText("Select Scenario")).toBeVisible();
    await expect(page.getByText("Food Recall").first()).toBeVisible();
    await expect(page.getByText("Aid Voucher").first()).toBeVisible();
  });

  test("should display prover selector", async ({ page }) => {
    const proverSelector = page.locator('[data-testid="prover-selector"]');
    await expect(proverSelector).toBeVisible();
  });

  test("should show Mock Prover by default", async ({ page }) => {
    await expect(page.getByText("Mock Prover")).toBeVisible();
    await expect(page.getByText("Demo").first()).toBeVisible();
  });

  test("should toggle prover mode", async ({ page }) => {
    const proverToggle = page.locator(
      '[data-testid="dashboard-prover-toggle"]',
    );

    // Initially mock prover
    await expect(page.getByText("Mock Prover")).toBeVisible();

    // Toggle to real prover (force click since input is sr-only)
    await proverToggle.click({ force: true });
    await expect(page.getByText("Real Stone Prover")).toBeVisible();
    await expect(page.getByText("ZKP").first()).toBeVisible();

    // Toggle back to mock
    await proverToggle.click({ force: true });
    await expect(page.getByText("Mock Prover")).toBeVisible();
  });

  test("should start settlement with selected prover mode", async ({
    page,
  }) => {
    // Select scenario
    await page.getByText("Food Recall").first().click();

    // Enable real prover (force click since input is sr-only)
    const proverToggle = page.locator(
      '[data-testid="dashboard-prover-toggle"]',
    );
    await proverToggle.click({ force: true });
    await expect(page.getByText("Real Stone Prover")).toBeVisible();

    // Start settlement
    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await startButton.click();

    // Should navigate to progress page
    await expect(page).toHaveURL(/\/progress/);

    // Prover toggle card on progress page should be visible with "Real" badge
    const progressProverCard = page.locator(
      '[data-testid="prover-toggle-card"]',
    );
    await expect(progressProverCard).toBeVisible();
    // Badge should show "Real" when real prover is enabled
    await expect(progressProverCard.getByText("Real")).toBeVisible();
  });
});
