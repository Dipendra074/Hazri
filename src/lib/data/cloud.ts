import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@/lib/session";
import { describeError, logError, toUserMessage } from "@/lib/errors";

/**
 * Guest data lives in IndexedDB and always works offline. Signed-in data lives
 * in the cloud, so a write attempted with no connection must fail with a clear,
 * user-facing message instead of a raw "Failed to fetch". A signed-in account
 * NEVER silently falls back to local storage.
 */
export function assertCloudReachable(session: Session) {
  if (session.mode !== "signed_in") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You're offline. Reconnect to save changes to your account.");
  }
}

/**
 * Confirm the Supabase session is still valid and return the authoritative
 * auth.uid() to use as `user_id`. Guest sessions return their local owner id.
 */
export async function requireOwnerId(session: Session): Promise<string> {
  if (session.mode === "none") throw new Error("No active session");
  if (session.mode === "guest") return session.userId;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    logError("auth.getUser", error);
    throw new Error("Your session expired. Please sign in again.");
  }
  return data.user.id;
}

/**
 * Turn a PostgREST/Supabase error object into a real Error carrying the
 * technical fields, while logging the full payload in development.
 */
export function toFriendlyError(error: unknown, scope = "supabase"): Error {
  logError(scope, error);
  const info = describeError(error);
  const err = new Error(toUserMessage(error, "Something went wrong. Please try again."));
  Object.assign(err, { code: info.code, details: info.details, hint: info.hint });
  return err;
}
