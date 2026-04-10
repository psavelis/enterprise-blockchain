/**
 * Event Emitter Adapter
 *
 * Implements EventEmitterPort for domain event publication.
 * Uses a simple synchronous pub/sub pattern.
 *
 * @see domain/ports.ts for EventEmitterPort interface
 */

import type { SettlementEvent, EventEmitterPort } from "../../domain/ports.js";

type EventHandler = (event: SettlementEvent) => void;

/**
 * In-memory event emitter for domain events.
 */
export class InMemoryEventEmitter implements EventEmitterPort {
  private readonly handlers = new Set<EventHandler>();
  private readonly typeHandlers = new Map<
    SettlementEvent["type"],
    Set<EventHandler>
  >();
  private readonly eventHistory: SettlementEvent[] = [];
  private readonly maxHistorySize: number;

  constructor(options: { maxHistorySize?: number } = {}) {
    this.maxHistorySize = options.maxHistorySize ?? 1000;
  }

  emit(event: SettlementEvent): void {
    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Notify general handlers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Event handler error:", error);
      }
    }

    // Notify type-specific handlers
    const typeSet = this.typeHandlers.get(event.type);
    if (typeSet) {
      for (const handler of typeSet) {
        try {
          handler(event);
        } catch (error) {
          console.error("Event handler error:", error);
        }
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
 * Async event emitter that handles async handlers.
 */
export class AsyncEventEmitter implements EventEmitterPort {
  private readonly handlers = new Set<
    (event: SettlementEvent) => void | Promise<void>
  >();
  private readonly typeHandlers = new Map<
    SettlementEvent["type"],
    Set<(event: SettlementEvent) => void | Promise<void>>
  >();

  emit(event: SettlementEvent): void {
    // Fire and forget for async handlers
    this.emitAsync(event).catch((error) => {
      console.error("Async event emission error:", error);
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
    handler: (event: Extract<SettlementEvent, { type: T }>) => void,
  ): { unsubscribe: () => void } {
    if (!this.typeHandlers.has(eventType)) {
      this.typeHandlers.set(eventType, new Set());
    }
    const wrappedHandler = handler as (event: SettlementEvent) => void;
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
 */
export const defaultEventEmitter = new InMemoryEventEmitter();
