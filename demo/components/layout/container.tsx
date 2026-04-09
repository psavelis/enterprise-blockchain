import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className }: ContainerProps) {
  return (
    <main className={cn("container mx-auto px-4 py-8", className)}>
      {children}
    </main>
  );
}
