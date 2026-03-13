import { createHash } from "node:crypto";

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function commitShare(
  partyId: string,
  index: number,
  value: number,
  nonce: string,
): string {
  return sha256hex(`${nonce}:${partyId}:${index}:${value}`);
}
