import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sessionStore } from "@/lib/session-store";
import { settlementRequestSchema } from "@/lib/validation";
import {
  createSessionToken,
  checkRateLimit,
  getClientIp,
  validateOrigin,
  type SecureSession,
} from "@/lib/security";

export async function POST(request: Request) {
  // CSRF protection
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  // Rate limiting
  const clientIp = getClientIp(request);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // Parse and validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parseResult = settlementRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  // Create secure session
  const sessionId = randomUUID();
  const session: SecureSession = {
    id: sessionId,
    token: createSessionToken(sessionId),
    createdAt: Date.now(),
    clientIp,
    ...parseResult.data,
  };

  if (!sessionStore.set(sessionId, session)) {
    return NextResponse.json(
      { error: "Service busy, try again later" },
      { status: 503 },
    );
  }

  // Return signed token (not raw session ID)
  return NextResponse.json(
    { token: session.token },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
