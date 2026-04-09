import { test, expect } from "@playwright/test";

test.describe("API Routes", () => {
  test.describe("POST /api/settlement", () => {
    test("should create settlement session with valid request", async ({
      request,
    }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toHaveProperty("token");
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(0);
    });

    test("should create session for aid-voucher scenario", async ({
      request,
    }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "aid-voucher",
          rail: "bitcoin",
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toHaveProperty("token");
    });

    test("should create session for fiat rail", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "fiat",
          useRealProver: true,
        },
      });

      expect(response.status()).toBe(201);
      const body = await response.json();
      expect(body).toHaveProperty("token");
    });

    test("should reject invalid scenario", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "invalid-scenario",
          rail: "solana",
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    test("should reject invalid rail", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "ethereum", // Invalid rail
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty("error");
    });

    test("should reject missing scenario", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          rail: "solana",
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(400);
    });

    test("should reject missing rail", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          useRealProver: false,
        },
      });

      expect(response.status()).toBe(400);
    });

    test("should reject invalid JSON body", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        headers: { "Content-Type": "application/json" },
        data: "not valid json{",
      });

      expect(response.status()).toBe(400);
    });

    test("should set correct response headers", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      // Cache-control may include additional directives from Next.js
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    });
  });

  test.describe("GET /api/events", () => {
    test("should reject request without token", async ({ request }) => {
      const response = await request.get("/api/events");

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Missing token");
    });

    test("should reject request with invalid token", async ({ request }) => {
      const response = await request.get("/api/events?token=invalid-token");

      expect(response.status()).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Invalid token");
    });

    test("should reject request with malformed token", async ({ request }) => {
      const response = await request.get(
        "/api/events?token=not.a.valid.hmac.token",
      );

      // Could be 401 (invalid) or 404 (session not found)
      expect([401, 404]).toContain(response.status());
    });

    test("should stream events with valid token", async ({ request }) => {
      // First, create a session
      const sessionResponse = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      expect(sessionResponse.status()).toBe(201);
      const { token } = await sessionResponse.json();

      // Then, connect to events stream
      const eventsResponse = await request.get(`/api/events?token=${token}`);

      expect(eventsResponse.status()).toBe(200);
      expect(eventsResponse.headers()["content-type"]).toContain(
        "text/event-stream",
      );
    });

    test("should accept valid token for SSE streaming", async ({ request }) => {
      // Create session first
      const sessionResponse = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      // May be rate limited in CI
      if (sessionResponse.status() === 429) {
        test.skip();
        return;
      }

      expect(sessionResponse.status()).toBe(201);
      const { token } = await sessionResponse.json();
      expect(token).toBeDefined();

      // Note: The SSE endpoint returns 200 for streaming
      const eventsResponse = await request.get(`/api/events?token=${token}`);
      expect(eventsResponse.status()).toBe(200);
    });
  });

  test.describe("Rate Limiting", () => {
    test("should respond with valid status codes", async ({ request }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      // Valid response codes: 201 (created), 429 (rate limited), 503 (store full)
      expect([201, 429, 503]).toContain(response.status());
    });
  });

  test.describe("Security Headers", () => {
    test("should include security headers on API response", async ({
      request,
    }) => {
      const response = await request.post("/api/settlement", {
        data: {
          scenario: "food-recall",
          rail: "solana",
          useRealProver: false,
        },
      });

      // Verify security headers
      expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    });
  });
});
