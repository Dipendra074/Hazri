import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type DayStatus =
  | "empty" | "attended" | "missed" | "mixed"
  | "cancelled" | "pending" | "credit" | "holiday";

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayIsoLocal() { return toIso(new Date()); }

function DayDot({ status }: { status: DayStatus }) {
  const cls =
    status === "attended" ? "bg-green-500"
    : status === "missed" ? "bg-red-500"
    : status === "mixed" || status === "pending" ? "bg-amber-500"
    : status === "cancelled" ? "bg-muted-foreground/50"
    : status === "credit" ? "bg-primary"
    : status === "holiday" ? "bg-blue-400"
    : "bg-transparent";
  if (status === "empty") return <span className="mt-0.5 h-1.5 w-1.5 rounded-full opacity-0" />;
  return <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${cls}`} />;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${color}`} />{label}</div>;
}

/**
 * Shared attendance calendar used by the Attendance → Calendar tab and by the
 * Today page date picker modal. UI, typography, cells, dots, colors and month
 * navigation are identical in both places.
 */
export function AttendanceCalendar({
  monthAnchor,
  onMonthChange,
  selected,
  onSelect,
  dayStatuses,
}: {
  monthAnchor: Date;
  onMonthChange: (d: Date) => void;
  selected: string;
  onSelect: (iso: string) => void;
  dayStatuses: ReadonlyMap<string, DayStatus>;
}) {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  const dayList = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
    const gs = new Date(monthStart);
    gs.setDate(gs.getDate() - mondayIndex(monthStart));
    const ge = new Date(monthEnd);
    ge.setDate(ge.getDate() + (6 - mondayIndex(monthEnd)));
    const list: string[] = [];
    const cursor = new Date(gs);
    while (cursor <= ge) {
      list.push(toIso(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [year, month]);

  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = todayIsoLocal();

  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onMonthChange(new Date(year, month - 1, 1))}
          className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"
        ><ChevronLeft className="h-4 w-4" /></button>
        <div className="text-sm font-semibold">{monthLabel}</div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onMonthChange(new Date(year, month + 1, 1))}
          className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center"
        ><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 mt-3 mb-1 text-[10px] text-muted-foreground text-center">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dayList.map((iso) => {
          const status = dayStatuses.get(iso) ?? "empty";
          const inMonth = parseIso(iso).getMonth() === month;
          const isToday = iso === today;
          const isSelected = iso === selected;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              aria-label={`${iso} ${status}`}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center relative ${
                isSelected ? "ring-2 ring-primary" : ""
              } ${inMonth ? "bg-secondary/40" : "opacity-40"}`}
            >
              <span className={`text-xs ${isToday ? "font-bold text-primary" : ""}`}>{parseIso(iso).getDate()}</span>
              <DayDot status={status} />
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-y-1.5 gap-x-2 mt-3 text-[10px] text-muted-foreground">
        <Legend color="bg-green-500" label="Attended" />
        <Legend color="bg-red-500" label="Missed" />
        <Legend color="bg-amber-500" label="Mixed / Pending" />
        <Legend color="bg-muted-foreground/50" label="Cancelled" />
        <Legend color="bg-primary" label="Credit" />
        <Legend color="bg-blue-400" label="Holiday" />
      </div>
    </div>
  );
}