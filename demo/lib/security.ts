import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Secret key - in production, use env var
const SECRET_KEY =
  process.env.SESSION_SECRET || randomBytes(32).toString("hex");

export interface SecureSession {
  id: string;
  token: string;
  createdAt: number;
  clientIp: string;
  scenario: "food-recall" | "aid-voucher" | "cross-border-fx" | "mpc-auction";
  rail: "solana" | "bitcoin" | "fiat";
  useRealProver: boolean;
}

/**
 * Generate HMAC-signed session token
 * Format: sessionId.signature
 */
export function createSessionToken(sessionId: string): string {
  const hmac = createHmac("sha256", SECRET_KEY);
  hmac.update(sessionId);
  const signature = hmac.digest("hex");
  return `${sessionId}.${signature}`;
}

/**
 * Verify and extract session ID from token
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [sessionId, providedSignature] = parts;
  if (!sessionId || !providedSignature) return null;

  const hmac = createHmac("sha256", SECRET_KEY);
  hmac.update(sessionId);
  const expectedSignature = hmac.digest("hex");

  try {
    const providedBuffer = Buffer.from(providedSignature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    if (providedBuffer.length !== expectedBuffer.length) return null;
    if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;
    return sessionId;
  } catch {
    return null;
  }
}

// Rate limiter (in-memory, use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
// Increase rate limit for CI/testing (many E2E tests run sequentially)
// In production, use lower limit for security
const RATE_LIMIT_MAX =
  process.env.CI || process.env.NODE_ENV === "development" ? 100 : 10;

/**
 * Check if request is within rate limit
 * Returns true if allowed, false if rate limited
 */
export function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientIp, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get client IP from headers (handles proxies)
 */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const firstIp = xff.split(",")[0];
    return firstIp?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Validate origin header for CSRF protection
 */
export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // Allow requests without origin (non-browser clients, same-origin)
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    // In dev, allow localhost
    if (process.env.NODE_ENV === "development") {
      return (
        originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1"
      );
    }
    // In production, validate against allowed origins
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",");
    return allowedOrigins.includes(origin) || originUrl.host === host;
  } catch {
    return false;
  }
}
