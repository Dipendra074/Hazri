/**
 * Smart Present Mode reconciler.
 *
 * Foreground-only. For each schedule instance whose end time has passed on
 * the target date, if there is no existing attendance event and the day is
 * not a holiday, we create one Attended event with source `smart_present`.
 *
 * Guarantees:
 *  - Extra classes are never auto-marked (they are events, not schedule instances).
 *  - Credits are never touched.
 *  - Future classes / not-yet-ended classes never auto-marked.
 *  - Existing manual events (attended/missed/cancelled/pending) are preserved.
 *  - Instances before `smart_present_enabled_at` are skipped.
 */
import { scheduleEntriesApi } from "@/lib/data/schedule-entries";
import { attendanceEventsApi } from "@/lib/data/attendance-events";
import { holidaysApi } from "@/lib/data/holidays";
import type { Session } from "@/lib/session";
import type { Preferences } from "@/lib/preferences";

function toLocalIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type SmartPresentResult = { created: number; skipped: number };

export async function runSmartPresent(
  session: Session,
  prefs: Preferences,
  opts: { date?: string } = {},
): Promise<SmartPresentResult> {
  if (session.mode === "none") return { created: 0, skipped: 0 };
  if (!prefs.smartPresentEnabled) return { created: 0, skipped: 0 };

  const date = opts.date ?? toLocalIso(new Date());
  const now = new Date();
  const today = toLocalIso(now);

  // Never touch a future date.
  if (date > today) return { created: 0, skipped: 0 };

  const enabledAt = prefs.smartPresentEnabledAt ? new Date(prefs.smartPresentEnabledAt) : null;
  const targetDay = parseLocalIso(date);

  const [entries, events, holidays] = await Promise.all([
    scheduleEntriesApi.list(session),
    attendanceEventsApi.listForDate(session, date),
    holidaysApi.list(session),
  ]);

  if (holidays.some((h) => h.date === date)) return { created: 0, skipped: 0 };

  const weekday = targetDay.getDay();
  const eligible = entries.filter((e) => e.weekday === weekday);

  // Build a lookup of existing events keyed by scheduleEntryId (only for
  // schedule-linked events on this date). Extra classes have no matching
  // schedule entry so they are naturally ignored.
  const seen = new Set(
    events.filter((e) => e.schedule_entry_id).map((e) => e.schedule_entry_id!),
  );

  let created = 0;
  let skipped = 0;
  for (const entry of eligible) {
    if (seen.has(entry.id)) {
      skipped++;
      continue;
    }
    // End time must be in the past (using local target date + end minute).
    const endsAt = new Date(targetDay);
    endsAt.setHours(0, 0, 0, 0);
    endsAt.setMinutes(entry.end_minute);
    if (endsAt.getTime() > now.getTime()) {
      skipped++;
      continue;
    }
    if (enabledAt && endsAt.getTime() < enabledAt.getTime()) {
      skipped++;
      continue;
    }
    try {
      await attendanceEventsApi.create(session, {
        component_id: entry.component_id,
        schedule_entry_id: entry.id,
        date,
        status: "attended",
        units: entry.units,
        source: "smart_present",
        note: null,
        event_type: "class",
        credit_counts_as_conducted: true,
        start_minute: entry.start_minute,
        end_minute: entry.end_minute,
      });
      created++;
    } catch {
      skipped++;
    }
  }
  return { created, skipped };
}