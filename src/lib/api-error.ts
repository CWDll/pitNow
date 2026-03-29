export interface ApiErrorShape {
  error?: string | { code?: string; message?: string } | null;
}

export function extractApiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const typed = payload as ApiErrorShape;

  if (typeof typed.error === "string" && typed.error.trim()) {
    return typed.error;
  }

  if (
    typed.error &&
    typeof typed.error === "object" &&
    typeof typed.error.message === "string" &&
    typed.error.message.trim()
  ) {
    return typed.error.message;
  }

  return fallback;
}
