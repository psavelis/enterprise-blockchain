import { test, expect } from "@playwright/test";

test.describe("Results Page", () => {
  test.beforeEach(async ({ page }) => {
    // Complete full flow to reach results
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();

    // Wait for settlement to complete and redirect to results
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });
  });

  test("should display Settlement Complete header", async ({ page }) => {
    await expect(page.getByText("Settlement Complete")).toBeVisible();
  });

  test("should display Verified badge", async ({ page }) => {
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  });

  test("should display STARK Block Proof section", async ({ page }) => {
    await expect(page.getByText("STARK Block Proof")).toBeVisible();
  });

  test("should display proof details", async ({ page }) => {
    await expect(page.getByText("Block Proof ID")).toBeVisible();
    await expect(page.getByText("Transactions")).toBeVisible();
    await expect(page.getByText("State Root")).toBeVisible();
  });

  test("should display copy button for proof", async ({ page }) => {
    // Find copy button (look for button with copy icon)
    const copyButtons = page.locator("button").filter({
      has: page.locator("svg"),
    });
    await expect(copyButtons.first()).toBeVisible();
  });

  test("should display rail confirmation for Solana", async ({ page }) => {
    // Solana is the default rail
    await expect(
      page.getByText(/Solana Transaction|Solana/).first(),
    ).toBeVisible();
    await expect(page.getByText(/Slot:/)).toBeVisible();
  });

  test("should display Post-Quantum Signature status", async ({ page }) => {
    await expect(page.getByText("Post-Quantum Signature")).toBeVisible();
    await expect(
      page.getByText(/Verified.*ML-DSA|ML-DSA/).first(),
    ).toBeVisible();
  });

  test("should display MPC/HSM status", async ({ page }) => {
    await expect(page.getByText("MPC/HSM Status")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
  });

  test("should display Start New Settlement button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Start New Settlement/i }),
    ).toBeVisible();
  });

  test("should navigate to dashboard on Start New Settlement click", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Start New Settlement/i }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Select Scenario")).toBeVisible();
  });

  test("should reset state after starting new settlement", async ({ page }) => {
    await page.getByRole("button", { name: /Start New Settlement/i }).click();
    await expect(page).toHaveURL("/");

    // No scenario should be selected - Start button should be disabled
    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    if (await startButton.isVisible()) {
      await expect(startButton).toBeDisabled();
    }
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await expect(page.getByText("Settlement Complete")).toBeVisible();
    await expect(page.getByText("STARK Block Proof")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Start New Settlement/i }),
    ).toBeVisible();
  });
});

test.describe("Results Page - Different Rails", () => {
  test("should show Bitcoin confirmation when Bitcoin rail selected", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByText("Food Recall").first().click();

    // Select Bitcoin rail
    const railSelector = page.locator("select").first();
    if (await railSelector.isVisible()) {
      await railSelector.selectOption("bitcoin");
    }

    await page.getByRole("button", { name: /Start Settlement/i }).click();
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

    // Should show Bitcoin confirmation
    await expect(page.getByText(/Bitcoin/).first()).toBeVisible();
    await expect(page.getByText(/Confirmations:/)).toBeVisible();
  });

  test("should show Fiat confirmation when Fiat rail selected", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByText("Food Recall").first().click();

    // Select Fiat rail
    const railSelector = page.locator("select").first();
    if (await railSelector.isVisible()) {
      await railSelector.selectOption("fiat");
    }

    await page.getByRole("button", { name: /Start Settlement/i }).click();
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

    // Should show Fiat confirmation
    await expect(page.getByText(/Fiat/).first()).toBeVisible();
    await expect(page.getByText(/Settlement Date:/)).toBeVisible();
  });
});

test.describe("Results Page - Direct Access Guard", () => {
  test("should redirect to dashboard when accessing results directly without session", async ({
    page,
  }) => {
    // Try to access results directly
    await page.goto("/results");

    // Should redirect to dashboard
    await expect(page).toHaveURL("/", { timeout: 5000 });
  });
});
