"use client";

import { useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/utils";
import type { LogEntry } from "@/services/types";

interface LogPanelProps {
  title: string;
  logs: LogEntry[];
  isActive?: boolean;
}

const levelColors: Record<LogEntry["level"], string> = {
  info: "text-blue-400",
  success: "text-green-400",
  error: "text-red-400",
  debug: "text-muted-foreground",
};

export function LogPanel({ title, logs, isActive }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card
      className={cn(
        "terminal-bg overflow-hidden transition-all",
        isActive && "border-primary/30"
      )}
    >
      <CardHeader className="py-3 px-4 border-b border-border">
        <CardTitle className="text-sm font-mono flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isActive ? "bg-green-500 animate-pulse" : "bg-muted"
            )}
          />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={scrollRef}
          className="h-32 overflow-y-auto p-4 font-mono text-xs space-y-1"
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground">Waiting...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-muted-foreground shrink-0">
                  [{formatTimestamp(log.timestamp)}]
                </span>
                <span className={levelColors[log.level]}>{log.message}</span>
              </div>
            ))
          )}
          {isActive && logs.length > 0 && (
            <span className="terminal-cursor text-primary" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
