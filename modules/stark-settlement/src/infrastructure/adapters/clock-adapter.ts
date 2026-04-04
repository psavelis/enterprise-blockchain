/**
 * Clock Adapters
 *
 * Implementations of ClockPort for time and UUID operations.
 * Enables deterministic testing with fixed timestamps.
 *
 * @see domain/ports.ts for ClockPort interface
 */

import { randomUUID } from "node:crypto";

import type { ClockPort } from "../../domain/ports";

/**
 * Real clock adapter using system time.
 */
export class SystemClock implements ClockPort {
  now(): number {
    return Date.now();
  }

  uuid(): string {
    return randomUUID();
  }
}

/**
 * Fixed clock adapter for deterministic testing.
 *
 * Time advances manually or by a fixed increment per call.
 */
export class FixedClock implements ClockPort {
  private currentTime: number;
  private uuidCounter = 0;
  private readonly uuidPrefix: string;
  private readonly autoAdvanceMs: number;

  constructor(
    initialTime: number = 1704067200000, // 2024-01-01T00:00:00Z
    options: {
      uuidPrefix?: string;
      autoAdvanceMs?: number;
    } = {},
  ) {
    this.currentTime = initialTime;
    this.uuidPrefix = options.uuidPrefix ?? "00000000-0000-0000-0000";
    this.autoAdvanceMs = options.autoAdvanceMs ?? 0;
  }

  now(): number {
    const time = this.currentTime;
    if (this.autoAdvanceMs > 0) {
      this.currentTime += this.autoAdvanceMs;
    }
    return time;
  }

  uuid(): string {
    const counter = this.uuidCounter++;
    const suffix = counter.toString(16).padStart(12, "0");
    return `${this.uuidPrefix}-${suffix}`;
  }

  /**
   * Manually advance time by the specified milliseconds.
   */
  advance(ms: number): void {
    this.currentTime += ms;
  }

  /**
   * Set time to a specific value.
   */
  setTime(time: number): void {
    this.currentTime = time;
  }

  /**
   * Get the current time without advancing.
   */
  peek(): number {
    return this.currentTime;
  }

  /**
   * Reset the clock to initial state.
   */
  reset(initialTime?: number): void {
    this.currentTime = initialTime ?? 1704067200000;
    this.uuidCounter = 0;
  }

  /**
   * Get the next UUID that will be generated (for assertions).
   */
  peekNextUuid(): string {
    const suffix = this.uuidCounter.toString(16).padStart(12, "0");
    return `${this.uuidPrefix}-${suffix}`;
  }
}

/**
 * Default clock instance (system clock).
 */
export const defaultClock: ClockPort = new SystemClock();
