import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Pencil, Layers, BookOpen, Sliders, Plus, Wallet, Sparkles, ListChecks } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSession, sessionKey } from "@/lib/session";
import { coursesApi } from "@/lib/data/courses";
import { courseComponentsApi } from "@/lib/data/course-components";
import { scheduleEntriesApi } from "@/lib/data/schedule-entries";
import { attendanceEventsApi } from "@/lib/data/attendance-events";
import { computeCourseStats } from "@/lib/attendance-aggregate";
import { courseIconFor } from "./_authenticated.courses";
import { SubjectIcon } from "@/components/app/subject-icon";
import type { ComponentKind } from "@/lib/db/schema";

export const Route = createFileRoute("/_authenticated/course/$courseId")({
  component: CourseDetail,
  notFoundComponent: () => (
    <div className="p-6 text-center text-sm text-muted-foreground">Course not found.</div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 text-center text-sm text-red-500">{error.message}</div>
  ),
});

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function CourseDetail() {
  const { courseId } = Route.useParams();
  const session = useSession();
  const coursesQ = useQuery({
    queryKey: [...sessionKey(session), "courses"],
    enabled: session.mode !== "none",
    queryFn: () => coursesApi.list(session),
  });
  const compsQ = useQuery({
    queryKey: [...sessionKey(session), "course_components"],
    enabled: session.mode !== "none",
    queryFn: () => courseComponentsApi.list(session),
  });
  const entriesQ = useQuery({
    queryKey: [...sessionKey(session), "schedule_entries"],
    enabled: session.mode !== "none",
    queryFn: () => scheduleEntriesApi.list(session),
  });
  const eventsQ = useQuery({
    queryKey: [...sessionKey(session), "attendance_events"],
    enabled: session.mode !== "none",
    queryFn: () => attendanceEventsApi.list(session),
  });

  const loading = coursesQ.isLoading || compsQ.isLoading || entriesQ.isLoading || eventsQ.isLoading;

  const course = (coursesQ.data ?? []).find((c) => c.id === courseId);
  if (!loading && !course) throw notFound();

  const components = useMemo(
    () => (compsQ.data ?? []).filter((c) => c.course_id === courseId),
    [compsQ.data, courseId],
  );
  const cs = useMemo(
    () => (course ? computeCourseStats(course, components, eventsQ.data ?? []) : null),
    [course, components, eventsQ.data],
  );
  const componentIds = new Set(components.map((c) => c.id));
  const scheduleForCourse = (entriesQ.data ?? []).filter((e) => componentIds.has(e.component_id));
  const eventsForCourse = (eventsQ.data ?? [])
    .filter((e) => componentIds.has(e.component_id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);

  if (loading || !course || !cs) {
    return <div className="h-40 rounded-2xl bg-card border border-border animate-pulse" />;
  }

  const Icon = courseIconFor(course.icon);
  const tone =
    cs.status === "safe" ? "text-green-500"
    : cs.status === "warn" ? "text-amber-400"
    : cs.status === "danger" ? "text-red-500"
    : "text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/attendance" className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="text-sm text-muted-foreground">Back to Attendance</div>
      </div>

      {/* Header */}
      <div className="rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
        <div className="rounded-2xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-4">
          <div className="flex items-center gap-3">
            <SubjectIcon icon={Icon} className="h-12 w-12 rounded-2xl" iconClassName="h-6 w-6" />
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold truncate">{course.name}</div>
              {course.code && <div className="text-xs text-muted-foreground truncate">{course.code}</div>}
            </div>
            <Link to="/courses" aria-label="Edit course" className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
              <Pencil className="h-4 w-4" />
            </Link>
          </div>
          <div className="flex items-baseline justify-between mt-3">
            <div className={`text-3xl font-bold tabular-nums ${tone}`}>
              {cs.percentage === null ? "—" : `${cs.percentage.toFixed(0)}%`}
            </div>
            <div className="text-xs text-muted-foreground">Target {cs.targetPct}%</div>
          </div>
          <div className="h-1.5 mt-2 bg-secondary rounded-full overflow-hidden">
            <div className={`h-full ${
              cs.status === "safe" ? "bg-green-500"
              : cs.status === "warn" ? "bg-amber-500"
              : cs.status === "danger" ? "bg-red-500" : "bg-muted"
            }`} style={{ width: `${Math.min(100, cs.percentage ?? 0)}%` }} />
          </div>
        </div>
      </div>

      {/* Components */}
      <div className="space-y-2">
        {cs.components.map(({ component, stats }) => {
          const kindLabel: Record<ComponentKind, string> = { theory: "Theory", lab: "Lab", tutorial: "Tutorial" };
          const t =
            stats.status === "safe" ? "text-green-500"
            : stats.status === "warn" ? "text-amber-400"
            : stats.status === "danger" ? "text-red-500"
            : "text-muted-foreground";
          const insight =
            stats.percentage === null ? "No classes yet"
            : stats.status === "safe"
              ? (Number.isFinite(stats.safeMisses) && stats.safeMisses > 0 ? `Can miss ${stats.safeMisses}` : "At target")
              : (Number.isFinite(stats.classesNeeded) ? `Need ${stats.classesNeeded}` : "At risk");
          return (
            <div key={component.id} className="rounded-2xl bg-card border border-border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{kindLabel[component.kind]}</div>
                <div className={`text-lg font-bold tabular-nums ${t}`}>
                  {stats.percentage === null ? "—" : `${stats.percentage.toFixed(0)}%`}
                </div>
              </div>
              <div className="h-1 mt-2 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full ${
                  stats.status === "safe" ? "bg-green-500"
                  : stats.status === "warn" ? "bg-amber-500"
                  : stats.status === "danger" ? "bg-red-500" : "bg-muted"
                }`} style={{ width: `${Math.min(100, stats.percentage ?? 0)}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-1 mt-2 text-center text-[10px] text-muted-foreground">
                <StatBlock label="Attended" value={stats.attended} tone="text-green-500" />
                <StatBlock label="Missed" value={stats.missed} tone="text-red-500" />
                <StatBlock label="Conducted" value={stats.conducted} />
                <StatBlock label="Pending" value={stats.pending} tone="text-amber-400" />
                <StatBlock label="Cancelled" value={stats.cancelled} />
                <StatBlock label="Credit" value={stats.credited} tone="text-primary" />
                <StatBlock label="Target" value={`${component.required_pct}%`} />
                <StatBlock label="" value={insight} muted />
              </div>
              {component.kind === "lab" && (
                <div className="text-[10px] text-muted-foreground mt-2">Default session: {course.default_lab_units} units</div>
              )}
              {(component.initial_attended > 0 || component.initial_conducted > 0) && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Imported baseline: {component.initial_attended} attended of {component.initial_conducted} conducted
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly schedule */}
      <SectionCard title="Weekly Schedule" icon={CalendarDays}>
        {scheduleForCourse.length === 0 ? (
          <div className="text-xs text-muted-foreground">No schedule entries for this course.</div>
        ) : (
          <div className="space-y-1">
            {scheduleForCourse.map((s) => {
              const comp = components.find((c) => c.id === s.component_id);
              return (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{DAYS[s.weekday]}</span>
                  <span className="font-medium">{fromMinutes(s.start_minute)}–{fromMinutes(s.end_minute)}</span>
                  <span className="text-muted-foreground">{comp?.kind ?? ""} · {s.units}u</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Recent history */}
      <SectionCard title="Recent History" icon={Layers}>
        {eventsForCourse.length === 0 ? (
          <div className="text-xs text-muted-foreground">Attendance history will appear here.</div>
        ) : (
          <div className="space-y-1">
            {eventsForCourse.map((ev) => {
              const et = ev.event_type ?? "class";
              const source = et === "credit" || ev.status === "credit" ? "CREDIT" : ev.schedule_entry_id ? "SCHEDULE" : "EXTRA";
              const label = parseIso(ev.date).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
              const tone2 =
                ev.status === "attended" ? "text-green-500"
                : ev.status === "missed" ? "text-red-500"
                : ev.status === "cancelled" ? "text-muted-foreground"
                : ev.status === "credit" ? "text-primary"
                : "text-amber-400";
              return (
                <div key={ev.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground w-16">{label}</span>
                  <span className={`font-semibold uppercase ${tone2}`}>{ev.status}</span>
                  <span className="text-muted-foreground">{ev.units}u</span>
                  <span className="rounded bg-secondary px-1 py-px text-[9px] uppercase">{source}</span>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Course Settings" icon={BookOpen}>
        <Link to="/courses" className="text-xs text-primary">Edit course, target and components →</Link>
      </SectionCard>

      <AdjustAttendanceCard courseId={courseId} />
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof CalendarDays; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {title}
      </div>
      {children}
    </div>
  );
}

function StatBlock({
  label, value, tone = "text-foreground", muted = false,
}: { label: string; value: number | string; tone?: string; muted?: boolean }) {
  return (
    <div>
      <div className={`text-xs font-semibold tabular-nums ${muted ? "text-muted-foreground text-[10px] font-normal" : tone}`}>{value}</div>
      {label && <div className="text-[9px] text-muted-foreground">{label}</div>}
    </div>
  );
}

function AdjustAttendanceCard({ courseId: _courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-white/[0.03] transition"
      >
        <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
          <Sliders className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium">Adjust attendance</div>
          <div className="text-[11px] text-muted-foreground">Add extras, credits, or edit baseline</div>
        </div>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Adjust attendance</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <SheetLink to="/courses" icon={Pencil} label="Edit imported baseline" hint="Open course editor to change imported attended/conducted counts" onClose={() => setOpen(false)} />
            <SheetLink to="/today" icon={Wallet} label="Add attendance credit" hint="Grant bonus units or a make-up class" onClose={() => setOpen(false)} />
            <SheetLink to="/today" icon={ListChecks} label="View credits" hint="Review credits recorded on Today" onClose={() => setOpen(false)} />
            <SheetLink to="/today" icon={Sparkles} label="Add extra class" hint="Log an unscheduled class instance" onClose={() => setOpen(false)} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SheetLink({
  to, icon: Icon, label, hint, onClose,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
  hint: string;
  onClose: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex items-center gap-3 rounded-2xl bg-secondary p-3 hover:opacity-90 transition"
    >
      <div className="h-9 w-9 rounded-xl bg-background flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
      </div>
    </Link>
  );
}
