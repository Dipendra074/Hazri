/**
 * Component-level attendance statistics helper.
 *
 * Rules (mirror the Phase 3 spec):
 *  - conducted = initial_conducted + attended.units + missed.units
 *  - attended  = initial_attended  + attended.units
 *  - missed    = conducted - attended
 *  - cancelled is reported but does NOT contribute to conducted
 *  - pending is passed in by the caller (schedule-generated instances)
 *  - percentage = attended / conducted * 100, or null if conducted === 0
 *  - classesNeeded = ceil((target*conducted - attended) / (1 - target))
 *  - safeMisses    = floor(attended / target - conducted)
 *  - target === 100% is handled without dividing by zero.
 */

export type StatusLabel = "safe" | "warn" | "danger" | "empty";

export type ComponentStats = {
  attended: number;
  missed: number;
  conducted: number;
  cancelled: number;
  pending: number;
  credited: number;
  percentage: number | null;
  rawPercentage: number | null;
  classesNeeded: number;
  safeMisses: number;
  status: StatusLabel;
};

export type InitCounts = {
  initial_attended: number;
  initial_conducted: number;
  required_pct: number;
};

export type StatEvent = {
  status: string;
  units: number;
  event_type?: "class" | "credit";
  credit_counts_as_conducted?: boolean;
};

export function computeComponentStats(
  init: InitCounts,
  events: readonly StatEvent[],
  opts?: { pendingUnits?: number; targetOverride?: number },
): ComponentStats {
  let addAttended = 0;
  let addMissed = 0;
  let cancelled = 0;
  let credited = 0;
  let creditConducted = 0;
  for (const e of events) {
    if (e.event_type === "credit" || e.status === "credit") {
      credited += e.units;
      if (e.credit_counts_as_conducted !== false) creditConducted += e.units;
      continue;
    }
    if (e.status === "attended") addAttended += e.units;
    else if (e.status === "missed") addMissed += e.units;
    else if (e.status === "cancelled") cancelled += e.units;
    // pending / extra (legacy) don't contribute.
  }
  const attended = init.initial_attended + addAttended + credited;
  const conducted = init.initial_conducted + addAttended + addMissed + creditConducted;
  const missed = Math.max(0, conducted - attended);
  const pending = opts?.pendingUnits ?? 0;

  const targetPctRaw = opts?.targetOverride ?? init.required_pct;
  const target = Math.min(1, Math.max(0, targetPctRaw / 100));
  const rawPercentage = conducted === 0 ? null : (attended / conducted) * 100;
  const percentage = rawPercentage === null ? null : Math.min(100, rawPercentage);

  let classesNeeded = 0;
  let safeMisses = 0;
  if (percentage !== null) {
    if (percentage >= target * 100) {
      if (target === 0) safeMisses = Number.POSITIVE_INFINITY;
      else safeMisses = Math.max(0, Math.floor(attended / target - conducted + 1e-9));
    } else if (target >= 1) {
      classesNeeded = Number.POSITIVE_INFINITY;
    } else {
      classesNeeded = Math.max(
        0,
        Math.ceil((target * conducted - attended) / (1 - target) - 1e-9),
      );
    }
  }

  let status: StatusLabel;
  if (percentage === null) status = "empty";
  else if (percentage >= target * 100) status = "safe";
  else if (percentage >= target * 100 - 5) status = "warn";
  else status = "danger";

  return {
    attended,
    missed,
    conducted,
    cancelled,
    pending,
    credited,
    percentage,
    rawPercentage,
    classesNeeded,
    safeMisses,
    status,
  };
}

export function shortInsight(s: ComponentStats, targetPct: number): string {
  if (s.percentage === null && s.pending === 0) return "No classes yet";
  if (s.percentage === null) return `${targetPct}% target`;
  if (s.status === "safe") {
    if (!Number.isFinite(s.safeMisses)) return "Safe";
    return s.safeMisses > 0 ? `Can miss ${s.safeMisses}` : "At target";
  }
  if (!Number.isFinite(s.classesNeeded)) return "At risk";
  return s.classesNeeded > 0 ? `Need ${s.classesNeeded}` : "At risk";
}