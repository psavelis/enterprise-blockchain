"use client";

import { useEffect, useRef } from "react";
import type { SettlementEvent } from "@/services/types";

/**
 * Hook to subscribe to Server-Sent Events for settlement progress
 */
export function useLiveLogs(
  token: string | null,
  onEvent: (event: SettlementEvent) => void,
  onError?: (error: string) => void,
) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  const completedRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    onEventRef.current = onEvent;
    onErrorRef.current = onError;
  }, [onEvent, onError]);

  useEffect(() => {
    if (!token) return;

    // Reset completion state for new token
    completedRef.current = false;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/events?token=${encodeURIComponent(token)}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as SettlementEvent;

        // Track completion to distinguish expected close from error
        // proof:report is the final event, so mark as complete when received
        if (event.type === "complete" || event.type === "proof:report") {
          completedRef.current = true;
        }

        onEventRef.current(event);

        // Close the connection gracefully after proof report (final event)
        if (event.type === "proof:report") {
          eventSource.close();
        }
      } catch {
        onErrorRef.current?.("Failed to parse event");
      }
    };

    eventSource.onerror = () => {
      // Only report error if stream closed unexpectedly (before completion)
      // completedRef.current being true means we received complete or proof:report
      if (!completedRef.current) {
        onErrorRef.current?.("Connection lost");
      }
      eventSource.close();
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [token]);
}
