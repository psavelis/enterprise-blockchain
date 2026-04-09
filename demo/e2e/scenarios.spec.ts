import { test, expect } from "@playwright/test";

test.describe("All Scenarios E2E", () => {
  test.describe.configure({ mode: "serial" });

  const scenarios = [
    {
      id: "food-recall",
      title: "Food Recall Settlement",
      description: "Track contaminated food lots",
    },
    {
      id: "aid-voucher",
      title: "Aid Voucher Reconciliation",
      description: "Reconcile international aid vouchers",
    },
    {
      id: "cross-border-fx",
      title: "Cross-Border FX Settlement",
      description: "EUR/JPY settlement through correspondent banks",
    },
    {
      id: "mpc-auction",
      title: "MPC Sealed-Bid Auction",
      description: "Enterprise procurement with secret-shared",
    },
  ];

  const rails = ["solana", "bitcoin", "fiat"] as const;

  for (const scenario of scenarios) {
    test.describe(`${scenario.title}`, () => {
      test(`should display ${scenario.id} scenario card`, async ({ page }) => {
        await page.goto("/");
        await expect(page.getByText(scenario.title).first()).toBeVisible();
      });

      test(`should select ${scenario.id} and enable start button`, async ({
        page,
      }) => {
        await page.goto("/");
        await page.getByText(scenario.title).first().click();
        const startButton = page.getByRole("button", {
          name: /Start Settlement/i,
        });
        await expect(startButton).toBeEnabled();
      });

      test(`should complete ${scenario.id} flow with Solana rail`, async ({
        page,
      }) => {
        await page.goto("/");

        // Select scenario
        await page.getByText(scenario.title).first().click();

        // Ensure Solana rail is selected (default)
        const railSelector = page.locator("select").first();
        await expect(railSelector).toHaveValue("solana");

        // Start settlement
        const startButton = page.getByRole("button", {
          name: /Start Settlement/i,
        });
        await startButton.click();

        // Wait for progress page
        await expect(page).toHaveURL(/\/progress/);
        await expect(page.getByText("Settlement Progress")).toBeVisible();

        // Wait for completion (mock prover is fast)
        await expect(page).toHaveURL(/\/results/, { timeout: 60_000 });

        // Verify results page shows expected content
        await expect(page.getByText("Settlement Complete")).toBeVisible();
        await expect(page.getByText("STARK Block Proof")).toBeVisible();
      });
    });
  }

  test.describe("Rail Selection", () => {
    for (const rail of rails) {
      test(`should complete settlement with ${rail} rail`, async ({ page }) => {
        await page.goto("/");

        // Select first scenario (Food Recall)
        await page.getByText("Food Recall").first().click();

        // Select rail
        const railSelector = page.locator("select").first();
        await railSelector.selectOption(rail);
        await expect(railSelector).toHaveValue(rail);

        // Start settlement
        const startButton = page.getByRole("button", {
          name: /Start Settlement/i,
        });
        await startButton.click();

        // Wait for completion
        await expect(page).toHaveURL(/\/results/, { timeout: 60_000 });
        await expect(page.getByText("Settlement Complete")).toBeVisible();
      });
    }
  });

  test.describe("API Tests", () => {
    for (const scenario of scenarios) {
      test(`API: should accept ${scenario.id} scenario`, async ({
        request,
      }) => {
        const response = await request.post("/api/settlement", {
          data: {
            scenario: scenario.id,
            rail: "solana",
            useRealProver: false,
          },
        });

        // May be rate limited in CI
        if (response.status() === 429) {
          test.skip();
          return;
        }

        expect(response.status()).toBe(201);
        const body = await response.json();
        expect(body.token).toBeDefined();
        expect(typeof body.token).toBe("string");
      });
    }

    test("API: should reject invalid scenario", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "invalid-scenario",
          rail: "solana",
          useRealProver: false,
        },
      });

      if (response.status() === 429) {
        test.skip();
        return;
      }

      expect(response.status()).toBe(400);
    });

    test("API: should reject invalid rail", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "invalid-rail",
          useRealProver: false,
        },
      });

      if (response.status() === 429) {
        test.skip();
        return;
      }

      expect(response.status()).toBe(400);
    });
  });

  test.describe("Cross-Border FX Specific", () => {
    test("should show FX-specific messages in progress", async ({ page }) => {
      await page.goto("/");

      // Select Cross-Border FX
      await page.getByText("Cross-Border FX Settlement").first().click();

      // Start settlement
      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for progress page
      await expect(page).toHaveURL(/\/progress/);

      // Should see FX-related logs
      await expect(
        page.getByText(/EUR\/JPY|correspondent|ML-DSA-65/i).first(),
      ).toBeVisible({ timeout: 30_000 });
    });
  });

  test.describe("MPC Auction Specific", () => {
    test("should show MPC-specific messages in progress", async ({ page }) => {
      await page.goto("/");

      // Select MPC Auction
      await page.getByText("MPC Sealed-Bid Auction").first().click();

      // Start settlement
      await page.getByRole("button", { name: /Start Settlement/i }).click();

      // Wait for progress page
      await expect(page).toHaveURL(/\/progress/);

      // Should see MPC-related logs
      await expect(
        page
          .getByText(/sealed-bid|secret-shared|bidder|Nordic|Baltic|Rhine/i)
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    });
  });
});

test.describe("Responsive Design", () => {
  const viewports = [
    { name: "mobile", width: 375, height: 667 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    test(`should display all 4 scenarios on ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/");

      await expect(page.getByText("Food Recall").first()).toBeVisible();
      await expect(page.getByText("Aid Voucher").first()).toBeVisible();
      await expect(page.getByText("Cross-Border FX").first()).toBeVisible();
      await expect(page.getByText("MPC Sealed-Bid").first()).toBeVisible();
    });
  }
});
