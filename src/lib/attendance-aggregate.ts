/**
 * Shared attendance statistics aggregation for Phase 5.
 * Consumes the Phase 1–4 hybrid model and produces per-component,
 * per-course and overall stats + calendar day aggregation.
 */

import type { CourseRow } from "@/lib/data/courses";
import type { ComponentRow } from "@/lib/data/course-components";
import type { ScheduleEntryRow } from "@/lib/data/schedule-entries";
import type { AttendanceEventRow } from "@/lib/data/attendance-events";
import type { HolidayRow } from "@/lib/data/holidays";
import {
  computeComponentStats,
  type ComponentStats,
  type StatusLabel,
} from "@/lib/attendance-stats";

export type { ComponentStats, StatusLabel } from "@/lib/attendance-stats";

export type CourseStats = {
  course: CourseRow;
  components: Array<{ component: ComponentRow; stats: ComponentStats }>;
  attended: number;
  missed: number;
  conducted: number;
  cancelled: number;
  pending: number;
  credited: number;
  percentage: number | null;
  rawPercentage: number | null;
  status: StatusLabel;
  targetPct: number;
};

export type OverallStats = {
  attended: number;
  missed: number;
  conducted: number;
  cancelled: number;
  pending: number;
  credited: number;
  percentage: number | null;
  rawPercentage: number | null;
  coursesBelow: number;
  componentsBelow: number;
  totalCourses: number;
  totalComponents: number;
};

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K) {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  return m;
}

export function computeComponentStatsFrom(
  component: ComponentRow,
  events: readonly AttendanceEventRow[],
): ComponentStats {
  const relevant = events.filter((e) => e.component_id === component.id);
  const pending = relevant
    .filter((e) => (e.event_type ?? "class") === "class" && e.status === "pending")
    .reduce((n, e) => n + e.units, 0);
  return computeComponentStats(
    {
      initial_attended: component.initial_attended,
      initial_conducted: component.initial_conducted,
      required_pct: component.required_pct,
    },
    relevant.map((e) => ({
      status: e.status,
      units: e.units,
      event_type: e.event_type,
      credit_counts_as_conducted: e.credit_counts_as_conducted,
    })),
    { pendingUnits: pending },
  );
}

function statusFromPct(pct: number | null, target: number): StatusLabel {
  if (pct === null) return "empty";
  if (pct >= target) return "safe";
  if (pct >= target - 5) return "warn";
  return "danger";
}

export function computeCourseStats(
  course: CourseRow,
  components: readonly ComponentRow[],
  events: readonly AttendanceEventRow[],
): CourseStats {
  const rows = components.map((component) => ({
    component,
    stats: computeComponentStatsFrom(component, events),
  }));
  let attended = 0, missed = 0, conducted = 0, cancelled = 0, pending = 0, credited = 0;
  for (const { stats } of rows) {
    attended += stats.attended;
    missed += stats.missed;
    conducted += stats.conducted;
    cancelled += stats.cancelled;
    pending += stats.pending;
    credited += stats.credited;
  }
  const raw = conducted === 0 ? null : (attended / conducted) * 100;
  const pct = raw === null ? null : Math.min(100, raw);
  const target = Number(course.target_pct);
  return {
    course, components: rows,
    attended, missed, conducted, cancelled, pending, credited,
    rawPercentage: raw, percentage: pct,
    status: statusFromPct(pct, target), targetPct: target,
  };
}

export function computeAllCourseStats(
  courses: readonly CourseRow[],
  components: readonly ComponentRow[],
  events: readonly AttendanceEventRow[],
): CourseStats[] {
  const compsByCourse = groupBy(components, (c) => c.course_id);
  return courses.map((c) =>
    computeCourseStats(c, compsByCourse.get(c.id) ?? [], events),
  );
}

export function computeOverallStats(courseStats: readonly CourseStats[]): OverallStats {
  let attended = 0, missed = 0, conducted = 0, cancelled = 0, pending = 0, credited = 0;
  let coursesBelow = 0, componentsBelow = 0, totalComponents = 0;
  for (const cs of courseStats) {
    attended += cs.attended;
    missed += cs.missed;
    conducted += cs.conducted;
    cancelled += cs.cancelled;
    pending += cs.pending;
    credited += cs.credited;
    if (cs.status === "warn" || cs.status === "danger") coursesBelow += 1;
    for (const { stats } of cs.components) {
      totalComponents += 1;
      if (stats.status === "warn" || stats.status === "danger") componentsBelow += 1;
    }
  }
  const raw = conducted === 0 ? null : (attended / conducted) * 100;
  const pct = raw === null ? null : Math.min(100, raw);
  return {
    attended, missed, conducted, cancelled, pending, credited,
    rawPercentage: raw, percentage: pct,
    coursesBelow, componentsBelow,
    totalCourses: courseStats.length, totalComponents,
  };
}

// ── Calendar aggregation ────────────────────────────────────────────

export type DayStatus =
  | "empty" | "attended" | "missed" | "mixed"
  | "cancelled" | "pending" | "credit" | "holiday";

export type DayEntry = {
  scheduleEntryId: string | null;
  extraEventId: string | null;
  componentId: string;
  courseId: string;
  eventId: string | null;
  status: "attended" | "missed" | "cancelled" | "pending" | "credit";
  units: number;
  startMinute: number | null;
  endMinute: number | null;
  isExtra: boolean;
  isCredit: boolean;
  source: string;
  note: string | null;
};

export type DayInfo = {
  date: string;
  status: DayStatus;
  holiday: HolidayRow | null;
  entries: DayEntry[];
  attended: number;
  missed: number;
  cancelled: number;
  pending: number;
  credits: number;
};

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toIsoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function summarize(entries: DayEntry[], holiday: HolidayRow | null): DayStatus {
  const hasAttended = entries.some((e) => e.status === "attended");
  const hasMissed = entries.some((e) => e.status === "missed");
  const hasPending = entries.some((e) => e.status === "pending");
  const hasCancelled = entries.some((e) => e.status === "cancelled");
  const hasCredit = entries.some((e) => e.status === "credit");
  const classCount = entries.filter((e) => e.status !== "credit").length;
  if (holiday && classCount === 0) return "holiday";
  if (hasAttended && hasMissed) return "mixed";
  if (hasAttended && !hasPending) return "attended";
  if (hasMissed && !hasAttended) return "missed";
  if (hasPending) return "pending";
  if (hasCancelled) return "cancelled";
  if (hasCredit) return "credit";
  return holiday ? "holiday" : "empty";
}

export function aggregateRange(
  fromIso: string,
  toIsoStr: string,
  entriesByWeekday: ReadonlyMap<number, ScheduleEntryRow[]>,
  eventsByDate: ReadonlyMap<string, AttendanceEventRow[]>,
  componentsById: ReadonlyMap<string, ComponentRow>,
  holidaysByDate: ReadonlyMap<string, HolidayRow>,
  todayIso: string,
): Map<string, DayInfo> {
  const out = new Map<string, DayInfo>();
  const start = parseIso(fromIso);
  const end = parseIso(toIsoStr);
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = toIsoLocal(cursor);
    const weekday = cursor.getDay();
    const holiday = holidaysByDate.get(iso) ?? null;
    const events = eventsByDate.get(iso) ?? [];
    const eventBySlot = new Map<string, AttendanceEventRow>();
    for (const e of events) {
      if (e.schedule_entry_id) eventBySlot.set(e.schedule_entry_id, e);
    }
    const entries: DayEntry[] = [];
    if (!holiday) {
      const scheduled = entriesByWeekday.get(weekday) ?? [];
      for (const s of scheduled) {
        const comp = componentsById.get(s.component_id);
        if (!comp) continue;
        const ev = eventBySlot.get(s.id);
        // Only today gets a synthesized "pending" entry for unlogged slots.
        // Past and future dates stay empty until the user marks them.
        if (!ev && iso !== todayIso) continue;
        const derived: DayEntry["status"] = ev
          ? (ev.status as DayEntry["status"])
          : "pending";
        entries.push({
          scheduleEntryId: s.id,
          extraEventId: null,
          componentId: comp.id,
          courseId: comp.course_id,
          eventId: ev?.id ?? null,
          status: derived,
          units: ev?.units ?? s.units,
          startMinute: s.start_minute,
          endMinute: s.end_minute,
          isExtra: false,
          isCredit: false,
          source: ev?.source ?? "schedule",
          note: ev?.note ?? null,
        });
      }
    }
    for (const ev of events) {
      if (ev.schedule_entry_id) continue;
      const comp = componentsById.get(ev.component_id);
      if (!comp) continue;
      const et = ev.event_type ?? "class";
      const isCredit = et === "credit" || ev.status === "credit";
      entries.push({
        scheduleEntryId: null,
        extraEventId: ev.id,
        componentId: comp.id,
        courseId: comp.course_id,
        eventId: ev.id,
        status: (isCredit ? "credit" : (ev.status as DayEntry["status"])),
        units: ev.units,
        startMinute: ev.start_minute ?? null,
        endMinute: ev.end_minute ?? null,
        isExtra: !isCredit,
        isCredit,
        source: ev.source,
        note: ev.note,
      });
    }

    let attended = 0, missed = 0, cancelled = 0, pending = 0, credits = 0;
    for (const e of entries) {
      if (e.status === "attended") attended += e.units;
      else if (e.status === "missed") missed += e.units;
      else if (e.status === "cancelled") cancelled += e.units;
      else if (e.status === "pending") pending += e.units;
      else if (e.status === "credit") credits += e.units;
    }
    out.set(iso, {
      date: iso, status: summarize(entries, holiday), holiday, entries,
      attended, missed, cancelled, pending, credits,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function insightFor(cs: CourseStats): string {
  if (cs.percentage === null) return "No classes yet";
  if (cs.status === "safe") {
    const tight = cs.components
      .filter(({ stats }) => stats.percentage !== null && Number.isFinite(stats.safeMisses))
      .sort((a, b) => a.stats.safeMisses - b.stats.safeMisses)[0];
    if (tight) {
      if (tight.stats.safeMisses === 0) return "At target";
      return `Can miss ${tight.stats.safeMisses}`;
    }
    return "Safe";
  }
  const worst = cs.components
    .filter(({ stats }) => stats.percentage !== null && stats.classesNeeded > 0 && Number.isFinite(stats.classesNeeded))
    .sort((a, b) => b.stats.classesNeeded - a.stats.classesNeeded)[0];
  if (worst) return `Need ${worst.stats.classesNeeded}`;
  return "At risk";
}
