import { test, expect } from "@playwright/test";

test.describe("Full Settlement Flow E2E", () => {
  test.describe("Food Recall Scenario", () => {
    test("complete flow with Solana rail", async ({ page }) => {
      // 1. Dashboard - Select scenario and rail
      await page.goto("/");
      await expect(
        page.getByText("Enterprise Blockchain Live Demo"),
      ).toBeVisible();

      // Select Food Recall scenario
      await page.getByText("Food Recall").first().click();

      // Verify Solana is default (or select it)
      const railSelector = page.locator("select").first();
      if (await railSelector.isVisible()) {
        await railSelector.selectOption("solana");
      }

      // Start settlement
      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // 2. Progress - Watch settlement progress
      await expect(page).toHaveURL(/\/progress/);
      await expect(page.getByText("Settlement Progress")).toBeVisible();

      // Verify steps are displayed
      await expect(page.getByText("Business Event").first()).toBeVisible();
      await expect(page.getByText("Base Proof").first()).toBeVisible();
      await expect(page.getByText("Batch Proof").first()).toBeVisible();
      await expect(page.getByText("Block Proof").first()).toBeVisible();

      // Wait for completion
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

      // 3. Results - Verify settlement outcome
      await expect(page.getByText("Settlement Complete")).toBeVisible();
      await expect(page.getByText("Verified", { exact: true })).toBeVisible();
      await expect(page.getByText("STARK Block Proof")).toBeVisible();

      // Verify Solana-specific confirmation
      await expect(page.getByText(/Solana/).first()).toBeVisible();
      await expect(page.getByText(/Slot:/)).toBeVisible();

      // Verify security status
      await expect(page.getByText("Post-Quantum Signature")).toBeVisible();
      await expect(page.getByText("MPC/HSM Status")).toBeVisible();
      await expect(page.getByText("Active")).toBeVisible();

      // 4. Return to dashboard
      await page.getByRole("button", { name: /Start New Settlement/i }).click();
      await expect(page).toHaveURL("/");
      await expect(page.getByText("Select Scenario")).toBeVisible();
    });

    test("complete flow with Bitcoin rail", async ({ page }) => {
      await page.goto("/");

      // Select scenario and Bitcoin rail
      await page.getByText("Food Recall").first().click();
      const railSelector = page.locator("select").first();
      if (await railSelector.isVisible()) {
        await railSelector.selectOption("bitcoin");
      }

      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for results
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

      // Verify Bitcoin-specific confirmation
      await expect(page.getByText(/Bitcoin/).first()).toBeVisible();
      await expect(page.getByText(/Confirmations:/)).toBeVisible();
    });

    test("complete flow with Fiat rail", async ({ page }) => {
      await page.goto("/");

      // Select scenario and Fiat rail
      await page.getByText("Food Recall").first().click();
      const railSelector = page.locator("select").first();
      if (await railSelector.isVisible()) {
        await railSelector.selectOption("fiat");
      }

      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for results
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

      // Verify Fiat-specific confirmation
      await expect(page.getByText(/Fiat/).first()).toBeVisible();
      await expect(page.getByText(/Settlement Date:/)).toBeVisible();
    });
  });

  test.describe("Aid Voucher Scenario", () => {
    test("complete flow with Solana rail", async ({ page }) => {
      await page.goto("/");

      // Select Aid Voucher scenario
      await page.getByText("Aid Voucher").first().click();

      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Progress page
      await expect(page).toHaveURL(/\/progress/);
      await expect(page.getByText("Settlement Progress")).toBeVisible();

      // Wait for results
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

      // Verify completion
      await expect(page.getByText("Settlement Complete")).toBeVisible();
      await expect(page.getByText("STARK Block Proof")).toBeVisible();
    });
  });

  test.describe("Multiple Settlement Flows", () => {
    test("should handle multiple consecutive settlements", async ({ page }) => {
      // First settlement
      await page.goto("/");
      await page.getByText("Food Recall").first().click();
      await page.getByRole("button", { name: /Start Settlement/i }).click();
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });
      await expect(page.getByText("Settlement Complete")).toBeVisible();

      // Start new settlement
      await page.getByRole("button", { name: /Start New Settlement/i }).click();
      await expect(page).toHaveURL("/");

      // Second settlement with different options
      await page.getByText("Aid Voucher").first().click();
      const railSelector = page.locator("select").first();
      if (await railSelector.isVisible()) {
        await railSelector.selectOption("bitcoin");
      }

      await page.getByRole("button", { name: /Start Settlement/i }).click();
      await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });
      await expect(page.getByText("Settlement Complete")).toBeVisible();
      await expect(page.getByText(/Bitcoin/).first()).toBeVisible();
    });
  });

  test.describe("Navigation Guards", () => {
    test("should redirect from progress to dashboard without session", async ({
      page,
    }) => {
      await page.goto("/progress");

      // Should redirect to dashboard
      await expect(page).toHaveURL("/", { timeout: 5000 });
    });

    test("should redirect from results to dashboard without completed session", async ({
      page,
    }) => {
      await page.goto("/results");

      // Should redirect to dashboard
      await expect(page).toHaveURL("/", { timeout: 5000 });
    });
  });

  test.describe("Error Handling", () => {
    test("should handle page refresh during settlement gracefully", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByText("Food Recall").first().click();
      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for progress page
      await expect(page).toHaveURL(/\/progress/);

      // Refresh the page
      await page.reload();

      // Should either continue or redirect to dashboard
      await expect(page).toHaveURL(/\/|\/progress/, { timeout: 5000 });
    });

    test("should handle browser back button", async ({ page }) => {
      await page.goto("/");
      await page.getByText("Food Recall").first().click();
      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for progress
      await expect(page).toHaveURL(/\/progress/);

      // Go back
      await page.goBack();

      // Should be back on dashboard
      await expect(page).toHaveURL("/");
    });
  });
});

test.describe("Performance and Responsiveness", () => {
  test("dashboard should load within acceptable time", async ({ page }) => {
    const startTime = Date.now();
    await page.goto("/");
    await expect(page.getByText("Select Scenario")).toBeVisible();
    const loadTime = Date.now() - startTime;

    // Should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test("should handle viewport resize during settlement", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();

    // Resize viewport during settlement
    await page.setViewportSize({ width: 375, height: 667 });

    // Should still show progress elements
    await expect(page.getByText("Settlement Progress")).toBeVisible();

    // Wait for completion
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

    // Results should be visible on mobile
    await expect(page.getByText("Settlement Complete")).toBeVisible();
  });
});

test.describe("Accessibility", () => {
  test("dashboard should have proper heading structure", async ({ page }) => {
    await page.goto("/");

    // Check for heading elements
    const headings = page.locator("h1, h2, h3");
    await expect(headings.first()).toBeVisible();
  });

  test("buttons should be focusable", async ({ page }) => {
    await page.goto("/");

    // Select scenario to enable button
    await page.getByText("Food Recall").first().click();

    // Find and focus the start button
    const startButton = page.getByRole("button", { name: /Start Settlement/i });
    await startButton.focus();

    // Button should be focused
    await expect(startButton).toBeFocused();
  });

  test("results page should have interactive elements", async ({ page }) => {
    // Complete flow to reach results
    await page.goto("/");
    await page.getByText("Food Recall").first().click();
    await page.getByRole("button", { name: /Start Settlement/i }).click();
    await expect(page).toHaveURL(/\/results/, { timeout: 30_000 });

    // Check for accessible buttons
    const buttons = page.getByRole("button");
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
  });
});
