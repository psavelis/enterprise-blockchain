/**
 * Event Emitter Adapter
 *
 * Implements EventEmitterPort for domain event publication.
 * Uses a simple synchronous pub/sub pattern.
 *
 * @see domain/ports.ts for EventEmitterPort interface
 */

import type { Logger } from "../../../shared/logger.js";
import { noopLogger } from "../../../shared/logger.js";
import type { SettlementEvent, EventEmitterPort } from "../../domain/ports.js";

type EventHandler = (event: SettlementEvent) => void;
type ErrorCallback = (error: unknown, event: SettlementEvent) => void;

/**
 * Configuration options for InMemoryEventEmitter.
 */
export interface EventEmitterOptions {
  /** Maximum number of events to retain in history. Default: 1000 */
  maxHistorySize?: number;
  /** Logger for error reporting. Default: noopLogger (silent) */
  logger?: Logger;
  /** Optional callback for handler errors. Called instead of/in addition to logging. */
  onHandlerError?: ErrorCallback;
}

/**
 * In-memory event emitter for domain events.
 *
 * Handler errors are routed through an injected Logger instead of console.error,
 * allowing library consumers to control logging behavior.
 */
export class InMemoryEventEmitter implements EventEmitterPort {
  private readonly handlers = new Set<EventHandler>();
  private readonly typeHandlers = new Map<
    SettlementEvent["type"],
    Set<EventHandler>
  >();
  private readonly eventHistory: SettlementEvent[] = [];
  private readonly maxHistorySize: number;
  private readonly logger: Logger;
  private readonly onHandlerError: ErrorCallback | undefined;

  constructor(options: EventEmitterOptions = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 1000;
    this.logger = options.logger ?? noopLogger;
    this.onHandlerError = options.onHandlerError;
  }

  emit(event: SettlementEvent): void {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify general handlers
    for (const handler of this.handlers) {
      this.safeInvoke(handler, event);
    }

    // Notify type-specific handlers
    const typeSet = this.typeHandlers.get(event.type);
    if (typeSet) {
      for (const handler of typeSet) {
        this.safeInvoke(handler, event);
      }
    }
  }

  /**
   * Safely invoke a handler, routing errors through logger/callback.
   */
  private safeInvoke(handler: EventHandler, event: SettlementEvent): void {
    try {
      handler(event);
    } catch (error) {
      // Route error through injected logger instead of console.error
      this.logger.error("Event handler error", {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });

      // Also invoke callback if provided
      if (this.onHandlerError) {
        this.onHandlerError(error, event);
      }
    }
  }

  subscribe(handler: EventHandler): { unsubscribe: () => void } {
    this.handlers.add(handler);
    return {
      unsubscribe: () => {
        this.handlers.delete(handler);
      },
    };
  }

  on<T extends SettlementEvent["type"]>(
    eventType: T,
    handler: (event: Extract<SettlementEvent, { type: T }>) => void,
  ): { unsubscribe: () => void } {
    if (!this.typeHandlers.has(eventType)) {
      this.typeHandlers.set(eventType, new Set());
    }
    const wrappedHandler = handler as EventHandler;
    this.typeHandlers.get(eventType)!.add(wrappedHandler);
    return {
      unsubscribe: () => {
        this.typeHandlers.get(eventType)?.delete(wrappedHandler);
      },
    };
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get all events of a specific type from history.
   */
  getEvents<T extends SettlementEvent["type"]>(
    eventType: T,
  ): Extract<SettlementEvent, { type: T }>[] {
    return this.eventHistory.filter(
      (e): e is Extract<SettlementEvent, { type: T }> => e.type === eventType,
    );
  }

  /**
   * Get all events from history.
   */
  getAllEvents(): readonly SettlementEvent[] {
    return [...this.eventHistory];
  }

  /**
   * Get the count of subscribers.
   */
  getSubscriberCount(): { general: number; byType: Map<string, number> } {
    const byType = new Map<string, number>();
    for (const [type, handlers] of this.typeHandlers) {
      byType.set(type, handlers.size);
    }
    return {
      general: this.handlers.size,
      byType,
    };
  }

  /**
   * Clear all handlers and history.
   */
  clear(): void {
    this.handlers.clear();
    this.typeHandlers.clear();
    this.eventHistory.length = 0;
  }

  /**
   * Clear only history, keep handlers.
   */
  clearHistory(): void {
    this.eventHistory.length = 0;
  }
}

/**
 * Configuration options for AsyncEventEmitter.
 */
export interface AsyncEventEmitterOptions {
  /** Logger for error reporting. Default: noopLogger (silent) */
  logger?: Logger;
  /** Optional callback for handler errors. */
  onHandlerError?: ErrorCallback;
}

/**
 * Async event emitter that handles async handlers.
 *
 * Handler errors are routed through an injected Logger instead of console.error,
 * allowing library consumers to control logging behavior.
 */
export class AsyncEventEmitter implements EventEmitterPort {
  private readonly handlers = new Set<
    (event: SettlementEvent) => void | Promise<void>
  >();
  private readonly typeHandlers = new Map<
    SettlementEvent["type"],
    Set<(event: SettlementEvent) => void | Promise<void>>
  >();
  private readonly logger: Logger;
  private readonly onHandlerError: ErrorCallback | undefined;

  constructor(options: AsyncEventEmitterOptions = {}) {
    this.logger = options.logger ?? noopLogger;
    this.onHandlerError = options.onHandlerError;
  }

  emit(event: SettlementEvent): void {
    // Fire and forget for async handlers
    this.emitAsync(event).catch((error) => {
      this.logger.error("Async event emission error", {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.onHandlerError) {
        this.onHandlerError(error, event);
      }
    });
  }

  async emitAsync(event: SettlementEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const handler of this.handlers) {
      promises.push(Promise.resolve(handler(event)));
    }

    const typeSet = this.typeHandlers.get(event.type);
    if (typeSet) {
      for (const handler of typeSet) {
        promises.push(Promise.resolve(handler(event)));
      }
    }

    await Promise.all(promises);
  }

  subscribe(handler: (event: SettlementEvent) => void | Promise<void>): {
    unsubscribe: () => void;
  } {
    this.handlers.add(handler);
    return {
      unsubscribe: () => {
        this.handlers.delete(handler);
      },
    };
  }

  on<T extends SettlementEvent["type"]>(
    eventType: T,
    handler: (
      event: Extract<SettlementEvent, { type: T }>,
    ) => void | Promise<void>,
  ): { unsubscribe: () => void } {
    if (!this.typeHandlers.has(eventType)) {
      this.typeHandlers.set(eventType, new Set());
    }
    const wrappedHandler = handler as (
      event: SettlementEvent,
    ) => void | Promise<void>;
    this.typeHandlers.get(eventType)!.add(wrappedHandler);
    return {
      unsubscribe: () => {
        this.typeHandlers.get(eventType)?.delete(wrappedHandler);
      },
    };
  }
}

/**
 * Default event emitter instance.
 * Uses noopLogger by default for library-friendly silent behavior.
 */
export const defaultEventEmitter = new InMemoryEventEmitter();
