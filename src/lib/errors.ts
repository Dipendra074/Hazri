/**
 * Central error normalisation.
 *
 * Supabase / PostgREST errors are PLAIN OBJECTS ({ message, code, details,
 * hint }), not Error instances. Passing one straight to a toast renders
 * "[object Object]" and hides the real failure. Everything user-facing must
 * go through `toUserMessage`; everything logged goes through `logError`.
 */

export type ErrorInfo = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
  status?: number;
};

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Safely pull message/code/details/hint out of anything that was thrown. */
export function describeError(error: unknown): ErrorInfo {
  if (error == null) return { message: "Something went wrong" };

  if (typeof error === "string") return { message: error };

  if (error instanceof Error) {
    const anyErr = error as Error & Partial<ErrorInfo>;
    return {
      message: error.message || "Something went wrong",
      code: str(anyErr.code),
      details: str(anyErr.details),
      hint: str(anyErr.hint),
      status: typeof anyErr.status === "number" ? anyErr.status : undefined,
    };
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const message =
      str(o.message) ??
      str(o.error_description) ??
      str(o.error) ??
      str(o.msg) ??
      str(o.details) ??
      "Something went wrong";
    return {
      message,
      code: str(o.code),
      details: str(o.details),
      hint: str(o.hint),
      status: typeof o.status === "number" ? o.status : undefined,
    };
  }

  return { message: String(error) };
}

/** Full technical detail — development only. */
export function logError(scope: string, error: unknown) {
  if (import.meta.env.DEV) {
    const info = describeError(error);
    // eslint-disable-next-line no-console
    console.error(`[${scope}]`, info, error);
  }
}

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|timeout|ecconn/i;

export function isNetworkError(error: unknown) {
  return NETWORK_RE.test(describeError(error).message);
}

/**
 * A safe, human message for the UI. Never leaks table names, policy names,
 * SQL, or raw PostgREST payloads.
 */
export function toUserMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const info = describeError(error);

  if (isNetworkError(error)) return "Network problem. Check your connection and try again.";
  if (info.message === "OFFLINE") return "You're offline. Reconnect to save changes to your account.";

  switch (info.code) {
    case "PGRST301":
    case "401":
      return "Your session expired. Please sign in again.";
    case "42501": // insufficient privilege
    case "PGRST116": // no rows returned / not visible
      return fallback;
    case "23505":
      return "That already exists.";
    default:
      break;
  }

  // Known-safe app-authored messages pass through; anything else is generic.
  if (error instanceof Error && !info.code && !NETWORK_RE.test(info.message)) return info.message;
  return fallback;
}
