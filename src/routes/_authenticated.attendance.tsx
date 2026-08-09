import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  BookOpen, CalendarDays, Plus,
  MoreVertical, Check, XCircle, Ban, Sparkles, Wallet, CheckCircle2,
  TrendingDown, TrendingUp, PartyPopper, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { coursesApi, type CourseRow } from "@/lib/data/courses";
import { courseComponentsApi, type ComponentRow } from "@/lib/data/course-components";
import { scheduleEntriesApi, type ScheduleEntryRow } from "@/lib/data/schedule-entries";
import { attendanceEventsApi, type AttendanceEventRow } from "@/lib/data/attendance-events";
import { holidaysApi, type HolidayRow } from "@/lib/data/holidays";
import type { EventStatus } from "@/lib/db/schema";
import {
  computeAllCourseStats, computeOverallStats, aggregateRange,
  insightFor, type CourseStats, type DayInfo,
} from "@/lib/attendance-aggregate";
import { courseIconFor } from "./_authenticated.courses";
import { SubjectIcon } from "@/components/app/subject-icon";
import { AttendanceCalendar, type DayStatus } from "@/components/app/attendance-calendar";
import { toUserMessage } from "@/lib/errors";

// Module-level cache: persists across route navigation, resets on full reload.
const overallAnimCache = { pct: undefined as number | undefined };

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendanceOverviewPage,
});

// ── date helpers ────────────────────────────────────────────────────
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
function todayIso() { return toIso(new Date()); }
function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── shared data hook ────────────────────────────────────────────────
function useAttendanceData(session: Session) {
  const courses = useQuery({
    queryKey: [...sessionKey(session), "courses"],
    enabled: session.mode !== "none",
    queryFn: () => coursesApi.list(session),
  });
  const components = useQuery({
    queryKey: [...sessionKey(session), "course_components"],
    enabled: session.mode !== "none",
    queryFn: () => courseComponentsApi.list(session),
  });
  const entries = useQuery({
    queryKey: [...sessionKey(session), "schedule_entries"],
    enabled: session.mode !== "none",
    queryFn: () => scheduleEntriesApi.list(session),
  });
  const events = useQuery({
    queryKey: [...sessionKey(session), "attendance_events"],
    enabled: session.mode !== "none",
    queryFn: () => attendanceEventsApi.list(session),
  });
  const holidays = useQuery({
    queryKey: [...sessionKey(session), "holidays"],
    enabled: session.mode !== "none",
    queryFn: () => holidaysApi.list(session),
  });
  return { courses, components, entries, events, holidays };
}

type Tab = "overview" | "subjects";

function AttendanceOverviewPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const session = useSession();
  const { courses, components, entries, events, holidays } = useAttendanceData(session);

  const courseStats = useMemo(
    () => computeAllCourseStats(courses.data ?? [], components.data ?? [], events.data ?? []),
    [courses.data, components.data, events.data],
  );
  const overall = useMemo(() => computeOverallStats(courseStats), [courseStats]);

  const loading = courses.isLoading || components.isLoading || entries.isLoading || events.isLoading || holidays.isLoading;

  return (
    <div className="space-y-3">
      <TabSwitcher tab={tab} setTab={setTab} />

      {loading ? (
        <SkeletonList />
      ) : tab === "overview" ? (
        <OverviewTab overall={overall} courseStats={courseStats} onOpenSubjects={() => setTab("subjects")} />
      ) : (
        <SubjectsTab courseStats={courseStats} />
      )}
    </div>
  );
}

// ── Tab switcher (matches Today's filter chips) ─────────────────────
function TabSwitcher({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const opts: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "subjects", label: "Subjects" },
  ];
  return (
    <div className="rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
      <div className="rounded-2xl bg-[#111111] border border-border dark:border-transparent p-1">
        <div className="grid grid-cols-2 gap-1">
          {opts.map((o) => {
            const active = tab === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setTab(o.value)}
                aria-pressed={active}
                className={`py-1.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-white text-foreground shadow-sm dark:bg-[#252525] dark:text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ────────────────────────────────────────────────────
function OverviewTab({
  overall, courseStats, onOpenSubjects,
}: {
  overall: ReturnType<typeof computeOverallStats>;
  courseStats: CourseStats[];
  onOpenSubjects: () => void;
}) {
  const pct = overall.percentage;
  const target = courseStats.reduce((s, c) => s + c.targetPct, 0) / Math.max(1, courseStats.length);
  const statusText =
    pct === null ? "No classes yet"
    : pct >= target ? "On track"
    : pct >= target - 5 ? "At risk"
    : "Below target";
  const statusTone =
    pct === null ? "text-muted-foreground"
    : pct >= target ? "text-green-500"
    : pct >= target - 5 ? "text-amber-400"
    : "text-red-500";

  const below = courseStats
    .filter((c) => c.status === "warn" || c.status === "danger")
    .sort((a, b) => (a.percentage ?? 0) - (b.percentage ?? 0));
  const safe = courseStats
    .filter((c) => c.status === "safe")
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));

  const pctRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const displayPct = pct === null ? null : Math.max(0, Math.min(100, pct));


  useGSAP(
    () => {
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const targetPct = displayPct ?? 0;
      const cached = overallAnimCache.pct;
      const shouldAnimate = cached === undefined ? true : cached !== targetPct;
      const fromPct = cached ?? 0;
      overallAnimCache.pct = targetPct;

      if (pctRef.current) {
        if (displayPct === null) {
          pctRef.current.textContent = "—";
        } else if (reduceMotion || !shouldAnimate) {
          pctRef.current.textContent = `${Math.round(targetPct)}%`;
        } else {
          const obj = { v: fromPct };
          gsap.to(obj, {
            v: targetPct,
            duration: 0.7,
            ease: "power2.out",
            onUpdate: () => {
              if (pctRef.current)
                pctRef.current.textContent = `${Math.round(obj.v)}%`;
            },
          });
        }
      }
      if (barRef.current) {
        const targetScale = targetPct / 100;
        if (reduceMotion || !shouldAnimate) {
          gsap.set(barRef.current, { scaleX: targetScale });
        } else {
          gsap.fromTo(
            barRef.current,
            { scaleX: fromPct / 100 },
            { scaleX: targetScale, duration: 0.8, ease: "power2.out" },
          );
        }
      }
    },
    { dependencies: [displayPct] },
  );

  if (courseStats.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No attendance recorded yet"
        hint="Add a course and build your weekly schedule to start tracking."
        cta={
          <div className="flex gap-2 justify-center">
            <Link to="/today" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">Open Today</Link>
            <Link to="/schedule" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-secondary text-foreground text-sm font-medium">Build Schedule</Link>
          </div>
        }
      />
    );
  }



  return (
    <div className="space-y-3">
      {/* Hero */}
      <div className="rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
        <div className="rounded-2xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Overall attendance</div>
              <div
                ref={pctRef}
                className="mt-0.5 font-mingzat text-4xl font-normal leading-none tracking-[-0.08em] tabular-nums text-[#7C8AFF]"
              >
                {pct === null ? "—" : `${pct.toFixed(0)}%`}
              </div>
              <div className="text-xs font-medium mt-1 text-white/70">{statusText} · target {Math.round(target)}%</div>
            </div>
          </div>
          <div className="h-1.5 mt-3 bg-secondary rounded-full overflow-hidden">
            <div
              ref={barRef}
              className="h-full w-full bg-[#7C8AFF] origin-left"
              style={{ transform: "scaleX(0)" }}
            />
          </div>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="Attended" value={overall.attended} tone="text-green-500" />
        <MetricTile label="Missed" value={overall.missed} tone="text-red-500" />
        <MetricTile label="Conducted" value={overall.conducted} />
        <MetricTile label="Cancelled" value={overall.cancelled} tone="text-muted-foreground" />
        <MetricTile label="Pending" value={overall.pending} tone="text-amber-400" />
        <MetricTile label="Credits" value={overall.credited} tone="text-primary" />
      </div>

      {/* Risk and recovery */}
      <SectionHeader
        icon={TrendingDown}
        title="Needs recovery"
        action={below.length > 0 ? <button onClick={onOpenSubjects} className="text-xs text-primary">All subjects</button> : null}
      />
      {below.length === 0 ? (
        <MutedCard>All courses at or above target. </MutedCard>
      ) : (
        <div className="space-y-2">
          {below.slice(0, 5).map((cs) => (
            <CourseListRow key={cs.course.id} cs={cs} />
          ))}
        </div>
      )}

      <SectionHeader icon={TrendingUp} title="Safe to miss" />
      {safe.length === 0 ? (
        <MutedCard>No courses safely above target yet.</MutedCard>
      ) : (
        <div className="space-y-2">
          {safe.slice(0, 5).map((cs) => (
            <CourseListRow key={cs.course.id} cs={cs} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ pct, target }: { pct: number; target: number }) {
  const size = 56, stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * c;
  const tone =
    pct >= target ? "stroke-green-500"
    : pct >= target - 5 ? "stroke-amber-500"
    : "stroke-red-500";
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx={size/2} cy={size/2} r={r} strokeWidth={stroke} className="stroke-secondary" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} strokeWidth={stroke} className={tone} fill="none"
        strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" />
    </svg>
  );
}

function MetricTile({ label, value, tone = "text-foreground" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3 text-center">
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, action }: { icon: typeof BookOpen; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </div>
      {action}
    </div>
  );
}

function MutedCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-card border border-border p-4 text-sm text-muted-foreground">{children}</div>;
}

function CourseListRow({ cs }: { cs: CourseStats }) {
  const Icon = courseIconFor(cs.course.icon);
  const insight = insightFor(cs);
  const tone =
    cs.status === "safe" ? "text-green-500"
    : cs.status === "warn" ? "text-amber-400"
    : cs.status === "danger" ? "text-red-500"
    : "text-muted-foreground";
  return (
    <Link
      to="/course/$courseId"
      params={{ courseId: cs.course.id }}
      className="block rounded-2xl bg-card border border-border p-3 hover:bg-secondary/40 transition"
    >
      <div className="flex items-center gap-3">
        <SubjectIcon icon={Icon} className="h-9 w-9" iconClassName="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{cs.course.name}</div>
          <div className="text-xs text-muted-foreground truncate">{insight}</div>
        </div>
        <div className={`text-lg font-bold tabular-nums ${tone}`}>
          {cs.percentage === null ? "—" : `${cs.percentage.toFixed(0)}%`}
        </div>
      </div>
    </Link>
  );
}

// ── Subjects tab ────────────────────────────────────────────────────
type SubjectFilter = "all" | "below" | "safe" | "empty";
type SortKey = "default" | "low" | "high" | "name";

function SubjectsTab({ courseStats }: { courseStats: CourseStats[] }) {
  const [filter, setFilter] = useState<SubjectFilter>("all");
  const [sort, setSort] = useState<SortKey>("default");

  const filtered = useMemo(() => {
    let rows = courseStats;
    if (filter === "below") rows = rows.filter((c) => c.status === "warn" || c.status === "danger");
    else if (filter === "safe") rows = rows.filter((c) => c.status === "safe");
    else if (filter === "empty") rows = rows.filter((c) => c.status === "empty");
    if (sort === "low") rows = [...rows].sort((a, b) => (a.percentage ?? 200) - (b.percentage ?? 200));
    else if (sort === "high") rows = [...rows].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));
    else if (sort === "name") rows = [...rows].sort((a, b) => a.course.name.localeCompare(b.course.name));
    return rows;
  }, [courseStats, filter, sort]);

  if (courseStats.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Add your first course"
        hint="Create a course to track its attendance."
        cta={<Link to="/courses" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium"><Plus className="h-4 w-4" /> Add Course</Link>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(["all", "below", "safe", "empty"] as SubjectFilter[]).map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "below" ? "Below target" : f === "safe" ? "Safe" : "No data"}
          </FilterChip>
        ))}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className="text-xs px-3 py-1.5 rounded-full bg-card border border-border">
              Sort: {sort === "default" ? "Default" : sort === "low" ? "Lowest" : sort === "high" ? "Highest" : "Name"}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSort("default")}>Default order</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("low")}>Lowest attendance</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("high")}>Highest attendance</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("name")}>Name</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {filtered.length === 0 ? (
        <MutedCard>No courses match this filter.</MutedCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((cs) => <SubjectCard key={cs.course.id} cs={cs} />)}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SubjectCard({ cs }: { cs: CourseStats }) {
  const Icon = courseIconFor(cs.course.icon);
  const insight = insightFor(cs);
  const theory = cs.components.find(({ component }) => component.kind === "theory");
  const lab = cs.components.find(({ component }) => component.kind === "lab");
  const tone =
    cs.status === "safe" ? "text-green-500"
    : cs.status === "warn" ? "text-amber-400"
    : cs.status === "danger" ? "text-red-500"
    : "text-muted-foreground";
  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center gap-3">
        <SubjectIcon icon={Icon} className="h-10 w-10" iconClassName="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/course/$courseId"
              params={{ courseId: cs.course.id }}
              className="text-sm font-semibold truncate hover:underline"
            >{cs.course.name}</Link>
            {cs.course.code && (
              <span className="text-[10px] text-muted-foreground truncate">{cs.course.code}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{insight}</div>
        </div>
        <div className={`text-lg font-bold tabular-nums ${tone}`}>
          {cs.percentage === null ? "—" : `${cs.percentage.toFixed(0)}%`}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Course actions" className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/course/$courseId" params={{ courseId: cs.course.id }}>View details</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/courses">Edit course</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="h-1 mt-2.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${
            cs.status === "safe" ? "bg-green-500"
            : cs.status === "warn" ? "bg-amber-500"
            : cs.status === "danger" ? "bg-red-500" : "bg-muted"
          }`}
          style={{ width: `${Math.min(100, cs.percentage ?? 0)}%` }}
        />
      </div>
      {(theory || lab) && (
        <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
          {theory && (
            <span>Theory <span className="text-foreground font-medium">
              {theory.stats.percentage === null ? "—" : `${theory.stats.percentage.toFixed(0)}%`}
            </span></span>
          )}
          {lab && (
            <span>Lab <span className="text-foreground font-medium">
              {lab.stats.percentage === null ? "—" : `${lab.stats.percentage.toFixed(0)}%`}
            </span></span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Calendar tab ────────────────────────────────────────────────────
function CalendarTab({
  entries, events, components, courses, holidays, session,
}: {
  entries: ScheduleEntryRow[];
  events: AttendanceEventRow[];
  components: ComponentRow[];
  courses: CourseRow[];
  holidays: HolidayRow[];
  session: Session;
}) {
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [selected, setSelected] = useState<string>(todayIso());

  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();

  // Grid boundaries are pure functions of (year, month); memoise so their
  // identity is stable across renders and downstream memos actually hit.
  const { gridStartIso, gridEndIso } = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
    const gs = new Date(monthStart);
    gs.setDate(gs.getDate() - mondayIndex(monthStart));
    const ge = new Date(monthEnd);
    ge.setDate(ge.getDate() + (6 - mondayIndex(monthEnd)));
    return { gridStartIso: toIso(gs), gridEndIso: toIso(ge) };
  }, [year, month]);

  const entriesByWeekday = useMemo(() => {
    const m = new Map<number, ScheduleEntryRow[]>();
    for (const e of entries) {
      const arr = m.get(e.weekday) ?? []; arr.push(e); m.set(e.weekday, arr);
    }
    return m;
  }, [entries]);
  const componentsById = useMemo(() => {
    const m = new Map<string, ComponentRow>();
    for (const c of components) m.set(c.id, c);
    return m;
  }, [components]);
  const coursesById = useMemo(() => {
    const m = new Map<string, CourseRow>();
    for (const c of courses) m.set(c.id, c);
    return m;
  }, [courses]);
  const eventsByDate = useMemo(() => {
    const m = new Map<string, AttendanceEventRow[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? []; arr.push(e); m.set(e.date, arr);
    }
    return m;
  }, [events]);
  const holidaysByDate = useMemo(() => {
    const m = new Map<string, HolidayRow>();
    for (const h of holidays) m.set(h.date, h);
    return m;
  }, [holidays]);

  const days = useMemo(
    () => aggregateRange(gridStartIso, gridEndIso, entriesByWeekday, eventsByDate, componentsById, holidaysByDate, todayIso()),
    [gridStartIso, gridEndIso, entriesByWeekday, eventsByDate, componentsById, holidaysByDate],
  );

  const selectedInfo = days.get(selected);
  const dayStatuses = useMemo(() => {
    const m = new Map<string, DayStatus>();
    for (const [iso, info] of days) m.set(iso, info.status);
    return m;
  }, [days]);

  return (
    <div className="space-y-3">
      <AttendanceCalendar
        monthAnchor={monthAnchor}
        onMonthChange={setMonthAnchor}
        selected={selected}
        onSelect={setSelected}
        dayStatuses={dayStatuses}
      />

      {selectedInfo && (
        <DateSheetInline
          info={selectedInfo}
          coursesById={coursesById}
          componentsById={componentsById}
          session={session}
        />
      )}
    </div>
  );
}

function DateSheetInline({
  info, coursesById, componentsById, session,
}: {
  info: DayInfo;
  coursesById: Map<string, CourseRow>;
  componentsById: Map<string, ComponentRow>;
  session: Session;
}) {
  const qc = useQueryClient();
  const eventsKey = [...sessionKey(session), "attendance_events"] as const;
  const isFuture = info.date > todayIso();
  const canMark = !isFuture;

  type MarkVars = {
    entry: DayInfo["entries"][number];
    status: "attended" | "missed" | "cancelled" | "pending";
  };

  const mark = useMutation({
    mutationFn: async ({ entry, status }: MarkVars) => {
      if (!canMark) throw new Error("Future dates can't be marked");
      if (entry.isCredit) return null;
      if (entry.isExtra) {
        if (!entry.extraEventId) return null;
        await attendanceEventsApi.update(session, entry.extraEventId, { status: status as EventStatus });
        return null;
      }
      if (status === "pending") {
        if (entry.eventId) await attendanceEventsApi.delete(session, entry.eventId);
        return null;
      }
      if (entry.eventId) {
        await attendanceEventsApi.update(session, entry.eventId, { status: status as EventStatus });
        return null;
      }
      const created = await attendanceEventsApi.create(session, {
        component_id: entry.componentId,
        schedule_entry_id: entry.scheduleEntryId,
        date: info.date,
        status: status as EventStatus,
        units: entry.units,
        source: "schedule",
        note: null,
      });
      return created;
    },
    onMutate: async ({ entry, status }) => {
      await qc.cancelQueries({ queryKey: eventsKey });
      const prev = qc.getQueryData<AttendanceEventRow[]>(eventsKey) ?? [];
      let tempId: string | null = null;
      let next: AttendanceEventRow[] = prev;
      if (entry.isCredit) {
        // no-op
      } else if (entry.isExtra) {
        if (entry.extraEventId) {
          next = prev.map((r) => (r.id === entry.extraEventId ? { ...r, status: status as EventStatus } : r));
        }
      } else if (status === "pending") {
        if (entry.eventId) next = prev.filter((r) => r.id !== entry.eventId);
      } else if (entry.eventId) {
        next = prev.map((r) => (r.id === entry.eventId ? { ...r, status: status as EventStatus } : r));
      } else {
        tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const optimistic: AttendanceEventRow = {
          id: tempId,
          component_id: entry.componentId,
          schedule_entry_id: entry.scheduleEntryId,
          date: info.date,
          status: status as EventStatus,
          units: entry.units,
          source: "schedule",
          note: null,
          event_type: "class",
          credit_counts_as_conducted: true,
          start_minute: entry.startMinute,
          end_minute: entry.endMinute,
        };
        next = [...prev, optimistic];
      }
      qc.setQueryData<AttendanceEventRow[]>(eventsKey, next);
      return { prev, tempId };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(eventsKey, ctx.prev);
      toast.error(toUserMessage(e, "Failed"));
    },
    onSuccess: (created, _v, ctx) => {
      if (created && ctx?.tempId) {
        qc.setQueryData<AttendanceEventRow[]>(eventsKey, (curr) =>
          (curr ?? []).map((r) => (r.id === ctx.tempId ? (created as AttendanceEventRow) : r)),
        );
      }
    },
  });

  const removeExtra = useMutation({
    mutationFn: async (id: string) => attendanceEventsApi.delete(session, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: eventsKey });
      const prev = qc.getQueryData<AttendanceEventRow[]>(eventsKey) ?? [];
      qc.setQueryData<AttendanceEventRow[]>(eventsKey, prev.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(eventsKey, ctx.prev);
      toast.error(toUserMessage(e, "Failed"));
    },
    onSuccess: () => toast.success("Removed"),
  });

  const dateLabel = parseIso(info.date).toLocaleDateString(undefined, {
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{dateLabel}</div>
          {info.holiday && <div className="text-xs text-blue-400">Holiday{info.holiday.label ? ` · ${info.holiday.label}` : ""}</div>}
        </div>
        <div className="flex gap-1.5 text-[11px]">
          {info.attended > 0 && <Pill tone="text-green-500">A {info.attended}</Pill>}
          {info.missed > 0 && <Pill tone="text-red-500">M {info.missed}</Pill>}
          {info.pending > 0 && <Pill tone="text-amber-400">P {info.pending}</Pill>}
          {info.cancelled > 0 && <Pill tone="text-muted-foreground">C {info.cancelled}</Pill>}
          {info.credits > 0 && <Pill tone="text-primary">+{info.credits}</Pill>}
        </div>
      </div>
      {info.entries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">No activity on this day.</div>
      ) : (
        <div className="space-y-1.5">
          {info.entries.map((e, i) => {
            const comp = componentsById.get(e.componentId);
            const course = comp ? coursesById.get(comp.course_id) : null;
            const Icon = courseIconFor(course?.icon);
            const statusTone =
              e.status === "attended" ? "text-green-500"
              : e.status === "missed" ? "text-red-500"
              : e.status === "cancelled" ? "text-muted-foreground"
              : e.status === "credit" ? "text-primary"
              : "text-amber-400";
            const source = e.isCredit ? "CREDIT" : e.isExtra ? "EXTRA" : "SCHEDULE";
            return (
              <div key={e.eventId ?? `${e.scheduleEntryId}-${i}`} className="rounded-xl bg-secondary/40 p-2 flex items-center gap-2">
                <SubjectIcon icon={Icon} className="h-7 w-7 rounded-lg" iconClassName="h-4 w-4" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{course?.name ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {comp?.kind ?? ""} · {e.units}u
                    {e.startMinute !== null && e.endMinute !== null && ` · ${fromMinutes(e.startMinute)}–${fromMinutes(e.endMinute)}`}
                    <span className="ml-1 rounded bg-secondary px-1 py-px text-[9px] uppercase">{source}</span>
                  </div>
                </div>
                <div className={`text-[11px] font-semibold ${statusTone} uppercase`}>{e.status}</div>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label="Change" className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!e.isCredit && (
                      <>
                        <DropdownMenuItem disabled={!canMark} onClick={() => mark.mutate({ entry: e, status: "attended" })}>
                          <Check className="h-4 w-4 mr-2 text-green-500" /> Attended
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canMark} onClick={() => mark.mutate({ entry: e, status: "missed" })}>
                          <XCircle className="h-4 w-4 mr-2 text-red-500" /> Missed
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!canMark} onClick={() => mark.mutate({ entry: e, status: "cancelled" })}>
                          <Ban className="h-4 w-4 mr-2" /> Cancelled
                        </DropdownMenuItem>
                        {!e.isExtra && (
                          <DropdownMenuItem disabled={!canMark || !e.eventId} onClick={() => mark.mutate({ entry: e, status: "pending" })}>
                            Clear override
                          </DropdownMenuItem>
                        )}
                        {e.isExtra && e.extraEventId && (
                          <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => removeExtra.mutate(e.extraEventId!)}>
                            <Trash2 className="h-4 w-4 mr-2" /> Delete extra
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    {e.isCredit && e.eventId && (
                      <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={() => removeExtra.mutate(e.eventId!)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Delete credit
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Link to="/today" className="text-xs text-primary">Open Today</Link>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`rounded-full bg-secondary px-2 py-0.5 font-semibold ${tone ?? ""}`}>{children}</span>;
}

// ── shared bits ─────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, hint, cta }: { icon: typeof BookOpen; title: string; hint: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-3">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1 mb-3">{hint}</p>
      {cta}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0,1,2,3].map((i) => (
        <div key={i} className="h-16 rounded-2xl bg-card border border-border animate-pulse" />
      ))}
    </div>
  );
}
