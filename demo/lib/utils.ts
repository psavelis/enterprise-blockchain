import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateHash(hash: string, length = 8): string {
  if (hash.length <= length * 2 + 3) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
