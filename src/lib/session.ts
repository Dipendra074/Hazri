/**
 * Session module for Hazri — local-first.
 *
 * Hazri no longer requires an account. Every user runs in one local mode
 * backed by IndexedDB. The session exists only to provide a stable
 * `ownerId` (used as the scoping key for every IndexedDB record) and a
 * stable React Query key prefix.
 *
 * The `Session` union still carries a `signed_in` variant so older code
 * paths type-check, but the app never produces one. Supabase auth is not
 * touched at boot: no network, no delay, works fully offline.
 *
 * Persisted state (localStorage):
 *   hazri:guest_id  → uuid, stable per device; mirrored into IDB meta
 *   hazri:mode      → "guest" (kept for backwards compatibility)
 *
 * Data safety: the existing `hazri:guest_id` is reused verbatim, so all
 * previously stored IndexedDB data stays reachable. Nothing is deleted or
 * migrated automatically.
 */

import { useSyncExternalStore } from "react";
import { v4 as uuid } from "uuid";
import { getDB } from "@/lib/db";
import { STORE } from "@/lib/db/schema";

export type SessionMode = "guest" | "signed_in" | "none";

export type Session =
  | { mode: "signed_in"; userId: string; email: string | null }
  | { mode: "guest"; userId: string; email: null }
  | { mode: "none"; userId: null; email: null };

const GUEST_ID_KEY = "hazri:guest_id";
const MODE_KEY = "hazri:mode";

const isBrowser = typeof window !== "undefined";
const listeners = new Set<() => void>();

let current: Session = { mode: "none", userId: null, email: null };

function readGuestId(): string | null {
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(GUEST_ID_KEY);
  } catch {
    return null;
  }
}

function writeGuestId(id: string) {
  if (!isBrowser) return;
  try {
    localStorage.setItem(GUEST_ID_KEY, id);
    localStorage.setItem(MODE_KEY, "guest");
  } catch {
    // storage unavailable — session still works for this tab
  }
}

function setSession(next: Session) {
  if (
    current.mode === next.mode &&
    current.userId === next.userId &&
    current.email === next.email
  )
    return;
  current = next;
  listeners.forEach((l) => l());
}

/**
 * Synchronously resolve (or create) the local owner id. Called eagerly at
 * module load in the browser so no screen ever waits on session hydration.
 */
function ensureLocalSessionSync(): Session {
  if (!isBrowser) return current;
  if (current.mode === "guest") return current;
  let id = readGuestId();
  if (!id) {
    id = uuid();
    writeGuestId(id);
  } else {
    writeGuestId(id);
  }
  setSession({ mode: "guest", userId: id, email: null });
  return current;
}

if (isBrowser) ensureLocalSessionSync();

export function getActiveSession(): Session {
  return isBrowser ? ensureLocalSessionSync() : current;
}

/**
 * Boot hook. Resolves immediately from localStorage, then backfills the
 * IndexedDB `meta.guest_id` record. Idempotent — safe to call on every
 * navigation. Never performs a network call.
 */
export async function hydrateSession(): Promise<Session> {
  if (!isBrowser) return current;
  const session = ensureLocalSessionSync();
  if (session.mode !== "guest") return session;
  // Backfill / repair the IDB mirror without blocking anything meaningful.
  try {
    const db = await getDB();
    const rec = await db.get(STORE.meta, "guest_id");
    if (rec && typeof rec.value === "string" && rec.value !== session.userId) {
      // An older local dataset exists under a different id — prefer it so
      // the user keeps every record they already had on this device.
      writeGuestId(rec.value);
      setSession({ mode: "guest", userId: rec.value, email: null });
      return current;
    }
    if (!rec) {
      await db.put(STORE.meta, {
        key: "guest_id",
        value: session.userId,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // IndexedDB unavailable — localStorage id is enough to keep going.
  }
  return current;
}

/** Backwards-compatible alias: entering Hazri simply ensures a local session. */
export async function startGuestSession(): Promise<Session> {
  return hydrateSession();
}

/** @deprecated Accounts are gone; kept so legacy auth code still compiles. */
export function startSignedInSession(_userId: string, _email: string | null): Session {
  return getActiveSession();
}

/** @deprecated There is no session to exit in local-first mode. */
export function exitGuestSession() {
  /* no-op: local data stays, there is nothing to sign out of */
}

/** Permanently delete all local data for the current owner id. */
export async function deleteGuestData(): Promise<void> {
  const id = readGuestId();
  if (!id) return;
  try {
    const db = await getDB();
    const stores = [
      STORE.profile,
      STORE.subjects,
      STORE.attendanceLogs,
      STORE.routineSlots,
      STORE.projects,
      STORE.projectTasks,
      STORE.todos,
      STORE.images,
      STORE.settings,
      STORE.courses,
      STORE.courseComponents,
      STORE.scheduleEntries,
      STORE.attendanceEvents,
      STORE.holidays,
    ] as const;
    for (const name of stores) {
      if (name === STORE.profile) {
        await db.delete(STORE.profile, id);
        continue;
      }
      const tx = db.transaction(name, "readwrite");
      const idx = tx.store.index("byOwner");
      let cursor = await idx.openCursor(id);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch {
    // best-effort; IDB may be unavailable
  }
  // Keep the same owner id so the user simply starts with an empty app.
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return current;
}

const SERVER_SESSION: Session = { mode: "none", userId: null, email: null };
function getServerSnapshot() {
  return SERVER_SESSION;
}

/** React hook — subscribes to session changes. */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Stable query-key prefix so React Query cache is scoped per owner. */
export function sessionKey(s: Session = current): readonly [string, string] {
  return [s.mode, s.userId ?? "anon"] as const;
}
