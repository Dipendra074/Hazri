/**
 * Typed preferences layer on top of `settingsApi`.
 * All keys are owner-scoped and persist per session.
 */
import { settingsApi } from "@/lib/data/settings";
import type { Session } from "@/lib/session";

export type WeekStart = "monday" | "sunday";

export type Preferences = {
  attendanceTarget: number; // 1..100
  defaultLabUnits: number; // >=1
  weekStart: WeekStart;
  smartPresentEnabled: boolean;
  smartPresentEnabledAt: string | null; // ISO
};

export const DEFAULT_PREFS: Preferences = {
  attendanceTarget: 75,
  defaultLabUnits: 1,
  weekStart: "monday",
  smartPresentEnabled: false,
  smartPresentEnabledAt: null,
};

const KEYS = {
  attendanceTarget: "pref.attendance_target",
  defaultLabUnits: "pref.default_lab_units",
  weekStart: "pref.week_start",
  smartPresentEnabled: "pref.smart_present_enabled",
  smartPresentEnabledAt: "pref.smart_present_enabled_at",
} as const;

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(min, Math.min(max, v));
}

export async function loadPreferences(session: Session): Promise<Preferences> {
  if (session.mode === "none") return DEFAULT_PREFS;
  const [t, u, w, se, sea] = await Promise.all([
    settingsApi.get<number>(session, KEYS.attendanceTarget),
    settingsApi.get<number>(session, KEYS.defaultLabUnits),
    settingsApi.get<WeekStart>(session, KEYS.weekStart),
    settingsApi.get<boolean>(session, KEYS.smartPresentEnabled),
    settingsApi.get<string>(session, KEYS.smartPresentEnabledAt),
  ]);
  return {
    attendanceTarget: clampInt(t, 1, 100, DEFAULT_PREFS.attendanceTarget),
    defaultLabUnits: clampInt(u, 1, 20, DEFAULT_PREFS.defaultLabUnits),
    weekStart: w === "sunday" ? "sunday" : "monday",
    smartPresentEnabled: se === true,
    smartPresentEnabledAt: typeof sea === "string" ? sea : null,
  };
}

export async function savePreference<K extends keyof Preferences>(
  session: Session,
  key: K,
  value: Preferences[K],
): Promise<void> {
  if (session.mode === "none") return;
  const storeKey = KEYS[key];
  await settingsApi.set(session, storeKey, value);
}

export const PREF_QUERY_KEY = "preferences";