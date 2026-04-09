import type { SecureSession } from "./security";

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 1000; // Prevent memory exhaustion

/**
 * In-memory session store with TTL and DoS protection
 * In production, use Redis or similar distributed store
 */
class SessionStore {
  private sessions = new Map<string, SecureSession>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Cleanup expired sessions every minute
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    }
  }

  /**
   * Store a session
   * Returns false if max sessions reached (DoS protection)
   */
  set(id: string, session: SecureSession): boolean {
    // Enforce max sessions
    if (this.sessions.size >= MAX_SESSIONS) {
      this.cleanup(); // Try cleanup first
      if (this.sessions.size >= MAX_SESSIONS) {
        return false; // Still at limit
      }
    }
    this.sessions.set(id, session);
    return true;
  }

  /**
   * Get a session by ID
   * Returns undefined if not found or expired
   */
  get(id: string): SecureSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    // Check expiration
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  /**
   * Delete a session
   */
  delete(id: string): void {
    this.sessions.delete(id);
  }

  /**
   * Check if session exists and is valid
   */
  has(id: string): boolean {
    return this.get(id) !== undefined;
  }

  /**
   * Get current session count (for monitoring)
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Destroy the store (for testing)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
