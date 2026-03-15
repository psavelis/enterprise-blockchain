import { createHash } from "node:crypto";

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
