export type SubjectStats = {
  attended: number;
  missed: number;
  total: number;
  pct: number;
};

export function computeStats(attended: number, missed: number): SubjectStats {
  const total = attended + missed;
  const pct = total === 0 ? 100 : (attended / total) * 100;
  return { attended, missed, total, pct };
}

export type Status = "safe" | "warn" | "danger";

export function statusFor(pct: number, required: number): Status {
  if (pct >= required) return "safe";
  if (pct >= required - 5) return "warn";
  return "danger";
}

export function statusColor(s: Status): string {
  if (s === "safe") return "text-safe";
  if (s === "warn") return "text-warn";
  return "text-danger";
}

export function bgStatus(s: Status): string {
  if (s === "safe") return "bg-safe";
  if (s === "warn") return "bg-warn";
  return "bg-danger";
}

export function bufferInfo(
  attended: number,
  missed: number,
  required: number,
): { canMiss: number; mustAttend: number } {
  const total = attended + missed;
  const pct = total === 0 ? 100 : (attended / total) * 100;
  const r = required / 100;
  if (pct >= required) {
    if (r === 0) return { canMiss: Infinity, mustAttend: 0 };
    const n = Math.floor(attended / r - total);
    return { canMiss: Math.max(0, n), mustAttend: 0 };
  }
  const n = Math.ceil((r * total - attended) / (1 - r));
  return { canMiss: 0, mustAttend: Math.max(0, n) };
}

export function projectedPct(attended: number, missed: number, addAbsent = 1): number {
  const total = attended + missed + addAbsent;
  return total === 0 ? 100 : (attended / total) * 100;
}