"use client";

import { Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface StepItemProps {
  step: number;
  label: string;
  progress: number;
  isActive: boolean;
  isComplete: boolean;
  isHighlighted?: boolean;
}

export function StepItem({
  step,
  label,
  progress,
  isActive,
  isComplete,
  isHighlighted,
}: StepItemProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-all duration-200",
        isActive && "border-primary bg-primary/5",
        isComplete && "border-green-500/30 bg-green-500/5",
        !isActive && !isComplete && "border-border bg-card",
        isHighlighted && isActive && "glow-border-active"
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
            isComplete && "bg-green-500 text-white",
            isActive && !isComplete && "bg-primary text-primary-foreground",
            !isActive && !isComplete && "bg-secondary text-muted-foreground"
          )}
        >
          {isComplete ? <Check className="w-4 h-4" /> : step + 1}
        </div>
        <div className="flex-1">
          <p
            className={cn(
              "font-medium",
              isActive && "text-primary",
              isComplete && "text-green-400"
            )}
          >
            {label}
          </p>
        </div>
        <span className="text-sm text-muted-foreground">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}
