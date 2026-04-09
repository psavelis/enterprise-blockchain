import { sessionStore } from "@/lib/session-store";
import { verifySessionToken, getClientIp } from "@/lib/security";
import { runSettlementGenerator } from "@/services/mock-settlement";
import { runRealSettlementGenerator } from "@/services/real-prover-settlement";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  // Validate token presence
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify HMAC signature
  const sessionId = verifySessionToken(token);
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get session
  const session = sessionStore.get(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify client IP matches (session binding)
  const clientIp = getClientIp(request);
  if (session.clientIp !== clientIp && session.clientIp !== "unknown") {
    return new Response(JSON.stringify({ error: "Session IP mismatch" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = session.useRealProver
          ? runRealSettlementGenerator({
              scenario: session.scenario,
              rail: session.rail,
              useRealProver: session.useRealProver,
            })
          : runSettlementGenerator({
              scenario: session.scenario,
              rail: session.rail,
              useRealProver: session.useRealProver,
            });

        for await (const event of generator) {
          // Sanitize event data (prevent XSS in JSON)
          const sanitizedEvent = JSON.stringify(event)
            .replace(/</g, "\\u003c")
            .replace(/>/g, "\\u003e");
          const data = `data: ${sanitizedEvent}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch {
        const errorEvent = JSON.stringify({
          type: "error",
          error: "Internal error",
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      } finally {
        controller.close();
        sessionStore.delete(sessionId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
