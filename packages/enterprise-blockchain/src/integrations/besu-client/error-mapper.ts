/**
 * Extracts and normalizes error codes from ethers.js error objects.
 * See: https://docs.ethers.org/v6/api/utils/#errors
 */
export function extractErrorCode(err: unknown): string {
  const anyErr = err as
    | {
        code?: unknown;
        error?: { code?: unknown };
        info?: { error?: { code?: unknown } };
      }
    | undefined;

  const rawCode =
    anyErr?.code ?? anyErr?.error?.code ?? anyErr?.info?.error?.code;

  return typeof rawCode === "string" ? rawCode.toUpperCase() : "";
}

export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isInsufficientFunds(err: unknown): boolean {
  const code = extractErrorCode(err);
  const msg = extractErrorMessage(err).toLowerCase();
  return code === "INSUFFICIENT_FUNDS" || msg.includes("insufficient funds");
}

export function isNonceTooLow(err: unknown): boolean {
  const code = extractErrorCode(err);
  const msg = extractErrorMessage(err).toLowerCase();
  return code === "NONCE_TOO_LOW" || msg.includes("nonce too low");
}
