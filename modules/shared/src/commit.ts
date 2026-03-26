import { sha256hex } from "./crypto";

export function commitShare(
  partyId: string,
  index: number,
  value: number | string,
  nonce: string,
): string {
  return sha256hex(`${nonce}:${partyId}:${index}:${value}`);
}
