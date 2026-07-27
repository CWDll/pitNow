import { randomBytes, timingSafeEqual } from "node:crypto";

const MANUAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createPartnerQrToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createPartnerManualCode(): string {
  const bytes = randomBytes(8);
  const characters = Array.from(bytes, (byte) => {
    return MANUAL_CODE_ALPHABET[byte % MANUAL_CODE_ALPHABET.length];
  }).join("");

  return `PIT-${characters.slice(0, 4)}-${characters.slice(4)}`;
}

export function normalizeManualCode(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (compact.startsWith("PIT") && compact.length === 11) {
    return `PIT-${compact.slice(3, 7)}-${compact.slice(7)}`;
  }

  return value.trim().toUpperCase();
}

export function extractQrToken(value: string): string {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("partnerToken")?.trim() ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function secureTextEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
