import { sha256hex } from "../../shared/src/crypto";

export { sha256hex };

export function commitShare(
  partyId: string,
  index: number,
  value: number,
  nonce: string,
): string {
  return sha256hex(`${nonce}:${partyId}:${index}:${value}`);
}
