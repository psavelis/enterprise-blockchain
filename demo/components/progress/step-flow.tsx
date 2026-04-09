"use client";

import { StepItem } from "./step-item";
import { STEP_LABELS } from "@/services/types";

interface StepFlowProps {
  currentStep: number;
  stepProgress: Record<number, number>;
}

export function StepFlow({ currentStep, stepProgress }: StepFlowProps) {
  return (
    <div className="space-y-4">
      {STEP_LABELS.map((label, index) => (
        <StepItem
          key={index}
          step={index}
          label={label}
          progress={stepProgress[index] ?? 0}
          isActive={currentStep === index}
          isComplete={(stepProgress[index] ?? 0) === 100}
          isHighlighted={index === 2} // Batch Proof step is highlighted
        />
      ))}
    </div>
  );
}
