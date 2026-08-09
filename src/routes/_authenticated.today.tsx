import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, MoreVertical,
  Check, XCircle, Ban, Clock, BookOpen, Sparkles, Wallet, Trash2, PartyPopper, Pencil,
  Power, MinusCircle, CheckCircle2, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { coursesApi, type CourseRow } from "@/lib/data/courses";
import { courseComponentsApi, type ComponentRow } from "@/lib/data/course-components";
import { scheduleEntriesApi, type ScheduleEntryRow } from "@/lib/data/schedule-entries";
import { attendanceEventsApi, type AttendanceEventRow } from "@/lib/data/attendance-events";
import { holidaysApi, type HolidayRow } from "@/lib/data/holidays";
import type { ComponentKind, EventStatus, EventType } from "@/lib/db/schema";
import { computeComponentStats, shortInsight, type ComponentStats } from "@/lib/attendance-stats";
import { courseIconFor } from "./_authenticated.courses";
import { SubjectIcon } from "@/components/app/subject-icon";
import { loadPreferences, DEFAULT_PREFS, PREF_QUERY_KEY } from "@/lib/preferences";
import { runSmartPresent } from "@/lib/smart-present";
import { AttendanceCalendar, type DayStatus } from "@/components/app/attendance-calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { aggregateRange } from "@/lib/attendance-aggregate";
import { toUserMessage } from "@/lib/errors";

// Module-level cache: survives route navigation but resets on full page reload.
// Keyed by instance.key so each subject card animates independently, and only
// when its own percentage actually changes (e.g. user taps Attended/Missed/Off).
const animatedPctCache = new Map<string, number>();

export const Route = createFileRoute("/_authenticated/today")({
  component: TodayPage,
});

// ── local date helpers ──────────────────────────────────────────────
function toLocalIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseLocalIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayIso() { return toLocalIso(new Date()); }
function addDays(iso: string, n: number) {
  const d = parseLocalIso(iso); d.setDate(d.getDate() + n); return toLocalIso(d);
}
function fromMinutes(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}
function nowMinutesLocal() {
  const d = new Date(); return d.getHours() * 60 + d.getMinutes();
}

// ── generated class instance ────────────────────────────────────────
type UiStatus = EventStatus | "pending";
type Instance = {
  key: string;                    // `${scheduleEntryId|extraEventId}:${date}`
  scheduleEntryId: string | null;
  isExtra: boolean;
  extraEventId: string | null;
  componentId: string;
  courseId: string;
  date: string;
  course: CourseRow;
  component: ComponentRow;
  kind: ComponentKind;
  startMinute: number;
  endMinute: number;
  units: number;
  position: number;
  targetPct: number;
  status: UiStatus;
  eventId: string | null;
  note: string | null;
};

function TodayPage() {
  const session = useSession();
  const qc = useQueryClient();

  const [date, setDate] = useState<string>(todayIso());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => parseLocalIso(todayIso()));
  const smartRanRef = useRef<string>("");
  const { data: prefs = DEFAULT_PREFS } = useQuery({
    queryKey: [...sessionKey(session), PREF_QUERY_KEY],
    enabled: session.mode !== "none",
    queryFn: () => loadPreferences(session),
  });
  useEffect(() => {
    if (!prefs.smartPresentEnabled || session.mode === "none") return;
    if (date !== todayIso()) return;
    const stamp = `${session.userId}:${date}`;
    if (smartRanRef.current === stamp) return;
    smartRanRef.current = stamp;
    let cancelled = false;
    const go = () => {
      runSmartPresent(session, prefs, { date }).then((r) => {
        if (cancelled) return;
        if (r.created > 0) {
          toast.success(`Marked ${r.created} class${r.created === 1 ? "" : "es"} attended`);
          qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
        }
      }).catch(() => {});
    };
    go();
    const onFocus = () => {
      smartRanRef.current = "";
      go();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [prefs, session, date, qc]);
  const [filter, setFilter] = useState<"all" | "theory" | "lab">("all");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditsListOpen, setCreditsListOpen] = useState(false);
  const [editExtra, setEditExtra] = useState<Instance | null>(null);
  const [deleteExtra, setDeleteExtra] = useState<Instance | null>(null);
  const [editCredit, setEditCredit] = useState<AttendanceEventRow | null>(null);
  const [deleteCredit, setDeleteCredit] = useState<AttendanceEventRow | null>(null);

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
  const holidaysQ = useQuery({
    queryKey: [...sessionKey(session), "holidays"],
    enabled: session.mode !== "none",
    queryFn: () => holidaysApi.list(session),
  });

  const courses = coursesQ.data ?? [];
  const components = compsQ.data ?? [];
  const entries = entriesQ.data ?? [];
  const events = eventsQ.data ?? [];
  const holidays = holidaysQ.data ?? [];

  const holiday = useMemo(
    () => holidays.find((h) => h.date === date) ?? null,
    [holidays, date],
  );

  const isToday = date === todayIso();
  const isFuture = parseLocalIso(date) > parseLocalIso(todayIso());
  const canMark = !isFuture;

  // Index helpers
  const coursesById = useMemo(() => {
    const m = new Map<string, CourseRow>(); for (const c of courses) m.set(c.id, c); return m;
  }, [courses]);
  const componentsById = useMemo(() => {
    const m = new Map<string, ComponentRow>(); for (const c of components) m.set(c.id, c); return m;
  }, [components]);
  const eventsByComponent = useMemo(() => {
    const m = new Map<string, AttendanceEventRow[]>();
    for (const e of events) {
      const arr = m.get(e.component_id) ?? [];
      arr.push(e); m.set(e.component_id, arr);
    }
    return m;
  }, [events]);
  const eventBySlotDate = useMemo(() => {
    const m = new Map<string, AttendanceEventRow>();
    for (const e of events) {
      if (!e.schedule_entry_id) continue;
      m.set(`${e.schedule_entry_id}:${e.date}`, e);
    }
    return m;
  }, [events]);

  // Day-status map for the date-picker calendar dots (same semantics as
  // the Attendance calendar tab). Covers ±120 days around the viewed date.
  const entriesByWeekday = useMemo(() => {
    const m = new Map<number, ScheduleEntryRow[]>();
    for (const e of entries) {
      const arr = m.get(e.weekday) ?? []; arr.push(e); m.set(e.weekday, arr);
    }
    return m;
  }, [entries]);
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
  const dayStatuses = useMemo(() => {
    const anchor = parseLocalIso(date);
    const start = new Date(anchor); start.setDate(start.getDate() - 120);
    const end = new Date(anchor); end.setDate(end.getDate() + 120);
    const toIso = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    const info = aggregateRange(
      toIso(start), toIso(end),
      entriesByWeekday, eventsByDate, componentsById, holidaysByDate, todayIso(),
    );
    const out = new Map<string, DayStatus>();
    for (const [iso, di] of info) out.set(iso, di.status);
    return out;
  }, [date, entriesByWeekday, eventsByDate, componentsById, holidaysByDate]);

  const weekday = parseLocalIso(date).getDay();

  const instances = useMemo<Instance[]>(() => {
    if (holiday) return [];
    const rows = entries.filter((e) => e.weekday === weekday);
    const out: Instance[] = [];
    for (const entry of rows) {
      const comp = componentsById.get(entry.component_id);
      if (!comp) continue;
      const course = coursesById.get(comp.course_id);
      if (!course) continue;
      const key = `${entry.id}:${date}`;
      const ev = eventBySlotDate.get(key);
      out.push({
        key,
        scheduleEntryId: entry.id,
        isExtra: false,
        extraEventId: null,
        componentId: comp.id,
        courseId: course.id,
        date,
        course,
        component: comp,
        kind: comp.kind,
        startMinute: entry.start_minute,
        endMinute: entry.end_minute,
        units: entry.units,
        position: entry.position,
        targetPct: Number(course.target_pct),
        status: (ev?.status as UiStatus) ?? "pending",
        eventId: ev?.id ?? null,
        note: ev?.note ?? null,
      });
    }
    // Merge extra-class events for this date.
    for (const ev of events) {
      if (ev.date !== date) continue;
      if (ev.schedule_entry_id) continue;
      const et = ev.event_type ?? "class";
      if (et !== "class") continue;
      const comp = componentsById.get(ev.component_id);
      if (!comp) continue;
      const course = coursesById.get(comp.course_id);
      if (!course) continue;
      out.push({
        key: `extra:${ev.id}`,
        scheduleEntryId: null,
        isExtra: true,
        extraEventId: ev.id,
        componentId: comp.id,
        courseId: course.id,
        date,
        course,
        component: comp,
        kind: comp.kind,
        startMinute: ev.start_minute ?? 0,
        endMinute: ev.end_minute ?? (ev.start_minute ?? 0),
        units: ev.units,
        position: 9999,
        targetPct: Number(course.target_pct),
        status: (ev.status as UiStatus) ?? "pending",
        eventId: ev.id,
        note: ev.note,
      });
    }
    out.sort((a, b) =>
      a.startMinute !== b.startMinute
        ? a.startMinute - b.startMinute
        : a.position !== b.position
          ? a.position - b.position
          : a.key.localeCompare(b.key),
    );
    return out;
  }, [entries, componentsById, coursesById, eventBySlotDate, events, date, weekday, holiday]);

  const visibleInstances = useMemo(() => {
    if (filter === "all") return instances;
    if (filter === "lab") return instances.filter((i) => i.kind === "lab");
    // theory shows theory + tutorial
    return instances.filter((i) => i.kind === "theory" || i.kind === "tutorial");
  }, [instances, filter]);

  // Choose default expanded key deterministically.
  const defaultKey = useMemo(() => {
    if (visibleInstances.length === 0) return null;
    if (isToday) {
      const now = nowMinutesLocal();
      const current = visibleInstances.find((i) => i.startMinute <= now && now < i.endMinute);
      if (current) return current.key;
      const next = visibleInstances.find((i) => i.startMinute > now);
      if (next) return next.key;
      return visibleInstances[visibleInstances.length - 1].key; // most recent
    }
    if (isFuture) return visibleInstances[0].key;
    // historical
    return (visibleInstances.find((i) => i.status === "pending") ?? visibleInstances[0]).key;
  }, [visibleInstances, isToday, isFuture]);

  const effectiveExpanded =
    expandedKey && visibleInstances.some((i) => i.key === expandedKey)
      ? expandedKey
      : defaultKey;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
  };

  const mark = useMutation({
    mutationFn: async ({ inst, status }: { inst: Instance; status: UiStatus }) => {
      if (!canMark) throw new Error("Future dates can’t be marked");
      // Extra events: pending must remain a persisted event.
      if (inst.isExtra) {
        const target: UiStatus =
          status === "pending"
            ? "pending"
            : inst.status === status
              ? "pending"
              : status;
        if (!inst.extraEventId) return;
        await attendanceEventsApi.update(session, inst.extraEventId, {
          status: target as EventStatus,
        });
        return;
      }
      // Schedule-generated: pending == delete override.
      if (status === "pending") {
        if (inst.eventId) await attendanceEventsApi.delete(session, inst.eventId);
        return;
      }
      if (inst.status === status && inst.eventId) {
        await attendanceEventsApi.delete(session, inst.eventId);
        return;
      }
      const existing = inst.scheduleEntryId
        ? eventBySlotDate.get(`${inst.scheduleEntryId}:${inst.date}`) ?? null
        : null;
      if (existing) {
        await attendanceEventsApi.update(session, existing.id, {
          status: status as EventStatus,
          units: inst.units,
          source: "schedule",
          component_id: inst.componentId,
          date: inst.date,
        });
      } else {
        await attendanceEventsApi.create(session, {
          component_id: inst.componentId,
          schedule_entry_id: inst.scheduleEntryId!,
          date: inst.date,
          status: status as EventStatus,
          units: inst.units,
          source: "schedule",
          note: null,
        });
      }
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const anyLoading =
    coursesQ.isLoading || compsQ.isLoading || entriesQ.isLoading ||
    eventsQ.isLoading || holidaysQ.isLoading;

  const dateLabel = parseLocalIso(date).toLocaleDateString(undefined, {
    weekday: "long", day: "2-digit", month: "short",
  });

  const hasCourses = courses.length > 0;
  const hasSchedule = entries.length > 0;
  const hasScheduleForDay = entries.some((e) => e.weekday === weekday);
  const pendingInstances = instances.filter((i) => i.status === "pending");

  return (
    <div className="space-y-3">
      {/* Date bar */}
      <div className="rounded-2xl bg-card border border-border p-2 flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => { setDate(addDays(date, -1)); setExpandedKey(null); }}
          className="h-8 w-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Pick a date"
          onClick={() => {
            const a = parseLocalIso(date); a.setDate(1);
            setCalendarAnchor(a);
            setCalendarOpen(true);
          }}
          className="flex-1 min-w-0 text-center rounded-lg px-2 py-1 hover:bg-secondary/60 active:scale-[0.98] transition-transform focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <div className="text-sm font-semibold truncate">{dateLabel}</div>
          <div className="text-[11px] text-muted-foreground">
            {isToday ? "Today" : isFuture ? "Upcoming" : "Past"}
          </div>
        </button>
        <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
          <DialogContent className="max-w-[340px] p-3 bg-transparent border-0 shadow-none">
            <DialogTitle className="sr-only">Pick a date</DialogTitle>
            <AttendanceCalendar
              monthAnchor={calendarAnchor}
              onMonthChange={setCalendarAnchor}
              selected={date}
              onSelect={(iso) => {
                setDate(iso);
                setExpandedKey(null);
                setCalendarOpen(false);
              }}
              dayStatuses={dayStatuses}
            />
          </DialogContent>
        </Dialog>
        {!isToday && (
          <button
            type="button"
            onClick={() => { setDate(todayIso()); setExpandedKey(null); }}
            className="rounded-full bg-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-primary/90"
          >
            Today
          </button>
        )}
        <button
          type="button"
          aria-label="Next day"
          onClick={() => { setDate(addDays(date, 1)); setExpandedKey(null); }}
          className="h-8 w-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Day actions"
              className="h-8 w-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {holiday ? (
              <>
                <DropdownMenuItem onClick={() => setHolidayOpen(true)}>
                  <CalendarDays className="h-4 w-4 mr-2" /> Edit holiday
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onClick={() => removeHoliday(session, qc, holiday)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Remove holiday
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onClick={() => setHolidayOpen(true)}>
                <PartyPopper className="h-4 w-4 mr-2" /> Mark date as holiday
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filter chips */}
      <div className="rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
        <div className="rounded-2xl bg-[#111111] border border-border dark:border-transparent p-1">
          <div className="grid grid-cols-3 gap-1">
            {(["all", "theory", "lab"] as const).map((v) => {
              const active = filter === v;
              const label = v === "all" ? "All" : v === "theory" ? "Theory" : "Lab";
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFilter(v)}
                  aria-pressed={active}
                  className={`py-1.5 rounded-xl text-sm font-medium transition ${
                    active
                      ? "bg-white text-foreground shadow-sm dark:bg-[#252525] dark:text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {anyLoading ? (
        <SkeletonList />
      ) : holiday ? (
        <HolidayCard holiday={holiday} onEdit={() => setHolidayOpen(true)} />
      ) : !hasCourses ? (
        <EmptyState
          icon={BookOpen}
          title="Add your first course"
          hint="Create a course to start tracking attendance."
          cta={<Link to="/courses" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Course
          </Link>}
        />
      ) : !hasSchedule ? (
        <EmptyState
          icon={CalendarDays}
          title="No weekly schedule yet"
          hint="Slot your classes into the weekly timetable to see them here."
          cta={<Link to="/schedule" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">
            Open Schedule
          </Link>}
        />
      ) : !hasScheduleForDay && instances.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No scheduled classes today"
          hint="Add classes for this weekday in Schedule."
          cta={<Link to="/schedule" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-secondary text-foreground text-sm font-medium">
            Open Schedule
          </Link>}
        />
      ) : visibleInstances.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={`No ${filter === "lab" ? "Lab" : "Theory"} classes today`}
          hint="Change the filter to see other classes."
        />
      ) : (
        <div className="relative left-1/2 w-[calc(100%+8px)] max-w-[388px] -translate-x-1/2 space-y-1.5">
          {visibleInstances.map((inst) => {
            const stats = computeStatsFor(inst, eventsByComponent);
            return (
              <ExpandedCard
                key={inst.key}
                instance={inst}
                stats={stats}
                canMark={canMark}
                pending={mark.isPending}
                animate={isToday}
                onMark={(status) => {
                  mark.mutate({ inst, status });
                }}

                onEditExtra={inst.isExtra ? () => setEditExtra(inst) : undefined}
                onDeleteExtra={inst.isExtra ? () => setDeleteExtra(inst) : undefined}
              />
            );
          })}

          {isToday || (!isFuture && !isToday) ? (
            pendingInstances.length > 0 && (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="w-full mt-2 rounded-2xl bg-card border border-border p-3 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" /> Mark remaining as attended
              </button>
            )
          ) : null}
        </div>
      )}

      <AddSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        onAddExtra={() => { setAddOpen(false); setExtraOpen(true); }}
        onAddCredit={() => { setAddOpen(false); setCreditOpen(true); }}
        onViewCredits={() => { setAddOpen(false); setCreditsListOpen(true); }}
        onMarkHoliday={() => { setAddOpen(false); setHolidayOpen(true); }}
      />
      <HolidaySheet
        open={holidayOpen}
        onOpenChange={setHolidayOpen}
        session={session}
        date={date}
        existing={holiday}
      />
      <BulkMarkSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        instances={pendingInstances}
        session={session}
      />
      <ExtraSheet
        open={extraOpen || !!editExtra}
        onOpenChange={(o) => { if (!o) { setExtraOpen(false); setEditExtra(null); } }}
        session={session}
        courses={courses}
        components={components}
        defaultDate={date}
        editing={editExtra}
      />
      <CreditSheet
        open={creditOpen || !!editCredit}
        onOpenChange={(o) => { if (!o) { setCreditOpen(false); setEditCredit(null); } }}
        session={session}
        courses={courses}
        components={components}
        defaultDate={date}
        editing={editCredit}
      />
      <CreditsListSheet
        open={creditsListOpen}
        onOpenChange={setCreditsListOpen}
        events={events}
        coursesById={coursesById}
        componentsById={componentsById}
        onEdit={(ev) => { setCreditsListOpen(false); setEditCredit(ev); }}
        onDelete={(ev) => setDeleteCredit(ev)}
      />
      <ConfirmDialog
        open={!!deleteExtra}
        onOpenChange={(o) => { if (!o) setDeleteExtra(null); }}
        title="Delete extra class?"
        description="This removes the extra class and its attendance from statistics."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteExtra?.extraEventId) return;
          try {
            await attendanceEventsApi.delete(session, deleteExtra.extraEventId);
            qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
            toast.success("Extra class deleted");
          } catch (e) {
            toast.error(toUserMessage(e, "Failed"));
          } finally {
            setDeleteExtra(null);
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteCredit}
        onOpenChange={(o) => { if (!o) setDeleteCredit(null); }}
        title="Delete credit?"
        description="This removes the adjustment from statistics."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteCredit) return;
          try {
            await attendanceEventsApi.delete(session, deleteCredit.id);
            qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
            toast.success("Credit deleted");
          } catch (e) {
            toast.error(toUserMessage(e, "Failed"));
          } finally {
            setDeleteCredit(null);
          }
        }}
      />
    </div>
  );
}

// ── stats per instance (all events for its component, all dates) ─────
function computeStatsFor(
  inst: Instance,
  eventsByComponent: Map<string, AttendanceEventRow[]>,
): ComponentStats {
  const list = eventsByComponent.get(inst.componentId) ?? [];
  return computeComponentStats(
    {
      initial_attended: inst.component.initial_attended,
      initial_conducted: inst.component.initial_conducted,
      required_pct: Number(inst.component.required_pct),
    },
    list,
  );
}

function badgeStyles(kind: ComponentKind): string {
  return {
    theory: "bg-[#3C7CFF] text-white ring-[#3C7CFF]",
    lab: "bg-[#6FEC71] text-[#1D1E29] ring-[#6FEC71]",
    tutorial: "bg-[#ECDF6F]/15 text-[#ECDF6F] ring-[#ECDF6F]/30",
  }[kind];
}
function statusPillStyles(s: UiStatus): { cls: string; label: string } {
  if (s === "attended") return { cls: "bg-green-500/15 text-green-400 ring-green-500/30", label: "Attended" };
  if (s === "missed") return { cls: "bg-red-500/15 text-red-400 ring-red-500/30", label: "Missed" };
  if (s === "cancelled") return { cls: "bg-amber-500/15 text-amber-400 ring-amber-500/30", label: "Cancelled" };
  return { cls: "bg-muted text-muted-foreground ring-border", label: "Pending" };
}
function pctColor(stats: ComponentStats) {
  if (stats.status === "safe") return "text-green-400";
  if (stats.status === "warn") return "text-amber-400";
  if (stats.status === "danger") return "text-red-400";
  return "text-muted-foreground";
}
function pctBar(stats: ComponentStats) {
  if (stats.status === "safe") return "bg-green-500";
  if (stats.status === "warn") return "bg-amber-500";
  if (stats.status === "danger") return "bg-red-500";
  return "bg-muted-foreground/40";
}

function ExpandedCard({
  instance, stats, canMark, pending, animate, onMark, onEditExtra, onDeleteExtra,
}: {
  instance: Instance;
  stats: ComponentStats;
  canMark: boolean;
  pending: boolean;
  animate: boolean;
  onMark: (status: UiStatus) => void;
  onEditExtra?: () => void;
  onDeleteExtra?: () => void;
}) {
  const Icon = courseIconFor(instance.course.icon);
  const pctText = stats.percentage === null ? "—" : `${stats.percentage.toFixed(0)}%`;
  const insight = shortInsight(stats, instance.targetPct);
  const standing =
    stats.status === "safe" ? { text: "Good standing", dot: "bg-[#6F7DEC]" }
    : stats.status === "warn" ? { text: "Watch closely", dot: "bg-amber-400" }
    : stats.status === "danger" ? { text: "Below target", dot: "bg-red-500" }
    : { text: "No data yet", dot: "bg-muted-foreground" };
  const insightMsg =
    stats.percentage === null
      ? "No classes recorded yet."
      : stats.status === "safe"
        ? "Great job! You're above the required attendance."
        : insight;
  const pctFrac = stats.percentage === null ? 0 : Math.max(0, Math.min(1, stats.percentage / 100));
  const displayPct = stats.percentage === null ? null : Math.max(0, Math.min(100, stats.percentage));
  const subjectTagColor =
    instance.kind === "lab" ? "bg-[#6FEC71] text-[#1D1E29] border-[#6FEC71]"
    : instance.kind === "tutorial" ? "bg-[#ECDF6F]/15 text-[#ECDF6F] border-[#ECDF6F]/30"
    : "bg-[#3C7CFF] text-white border-[#3C7CFF]";
  const pctRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const targetPct = displayPct ?? 0;
      const cached = animatedPctCache.get(instance.key);
      // No animation when the value hasn't changed since last render
      // (e.g. returning to Today after navigating away).
      const shouldAnimate =
        animate && (cached === undefined ? true : cached !== targetPct);
      const fromPct = cached ?? 0;
      animatedPctCache.set(instance.key, targetPct);

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
    { dependencies: [displayPct, instance.key] },
  );

  return (
    <div className="@container w-full">
      {(instance.isExtra || onEditExtra || onDeleteExtra) && (
        <div className="mb-[1.5cqw] flex items-center justify-end gap-1.5">
          {instance.isExtra && (
            <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-purple-300 ring-1 ring-purple-500/30">
              EXTRA
            </span>
          )}
          {(onEditExtra || onDeleteExtra) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Extra actions" className="p-1 text-muted-foreground/70 hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEditExtra && (
                  <DropdownMenuItem onClick={onEditExtra}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                )}
                {onDeleteExtra && (
                  <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={onDeleteExtra}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {/* Figma source of truth: every measurement scales from a 388×150 canvas. */}
      <div data-tour="subject-card" className="rounded-[6.186cqw] p-px bg-[linear-gradient(178deg,#7D7D7D_0%,#1D1E29_65%)]">
      <div
        data-testid="today-subject-card"
        className="relative aspect-[388/150] w-full overflow-hidden rounded-[6.186cqw] bg-[#1D1E29]"
      >
        <SubjectIcon
          icon={Icon}
          className="absolute left-[2.577cqw] top-[3.608cqw] h-[14.948cqw] w-[15.464cqw] rounded-[4.381cqw]"
          iconClassName="h-[7.227cqw] w-[6.054cqw]"
        />

        <div className="absolute left-[20.876cqw] top-[4.381cqw] w-[41.495cqw]">
          <div
            className="h-[7.474cqw] truncate whitespace-nowrap text-[6.264cqw] font-normal leading-[7.474cqw] tracking-[-0.02em] text-white"
            title={instance.course.name}
          >
            {instance.course.name}
          </div>
          <div className="absolute left-[0.773cqw] top-[7.216cqw] h-[3.351cqw] w-[32.99cqw] truncate lowercase text-[2.835cqw] font-normal leading-[3.351cqw] tracking-[0.03em] text-[#9F9F9F]">
            {insight}
          </div>
        </div>
        {instance.kind !== "theory" && (
        <span
          className={`absolute left-[10.309cqw] top-[21.907cqw] inline-flex h-[3.866cqw] min-w-[6.701cqw] -translate-x-1/2 items-center justify-center whitespace-nowrap rounded-[1.031cqw] border px-[1.031cqw] font-semibold leading-none tracking-wide ${subjectTagColor} ${
            instance.kind === "lab" ? "text-[3.24cqw]" : "text-[2.2cqw]"
          }`}
        >
          {instance.kind.toUpperCase()}
        </span>
        )}


        <div className="absolute left-[21.649cqw] top-[21.649cqw] h-[2.835cqw] w-[13.144cqw] whitespace-nowrap text-[2.32cqw] font-normal leading-[2.835cqw] tracking-[0.03em] text-[#9F9F9F]">
          Attended - {stats.attended}
        </div>
        <div className="absolute left-[21.649cqw] top-[24.485cqw] h-[2.835cqw] w-[11.082cqw] whitespace-nowrap text-[2.32cqw] font-normal leading-[2.835cqw] tracking-[0.03em] text-[#9F9F9F]">
          Missed - {stats.missed}
        </div>

        <div className="absolute left-[66.302cqw] top-[6.508cqw] h-[17.655cqw] w-[0.5px] bg-[#545454]" />

        <div className="absolute left-[69.588cqw] top-[5.67cqw] h-[0.773cqw] w-[25cqw] overflow-hidden rounded-full bg-[#474747]">
          <div
            ref={barRef}
            className="h-full w-[78.351%] origin-left rounded-full bg-[#6F7DEC]"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
        <div
          ref={pctRef}
          data-testid="today-subject-percentage"
          data-tour="attendance-percent"
          className="absolute left-[69.072cqw] top-[7.474cqw] mt-[2px] flex h-[8.505cqw] w-[29.897cqw] items-center gap-0 rounded-none whitespace-nowrap font-mingzat text-[10.529cqw] font-normal leading-[22.165cqw] tracking-[-0.08em] text-[#7C8AFF] tabular-nums"
        >
          {pctText}
        </div>
        <div className="absolute left-[69.845cqw] top-[17.783cqw] flex h-[2.835cqw] items-center whitespace-nowrap">
          <span className={`h-[1.26cqw] w-[1.26cqw] shrink-0 rounded-full ${standing.dot}`} />
          <span className="ml-[0.629cqw] text-[2.429cqw] font-normal leading-[2.835cqw] tracking-[0.02em] text-white">
            {standing.text}
          </span>
        </div>

        <div data-tour="attendance-actions" className="absolute left-[1.031cqw] top-[29.124cqw] grid h-[7.99cqw] w-[97.165cqw] grid-cols-4 gap-[2.062cqw]">
          <FigmaPill active={instance.status === "pending"} disabled={!canMark || pending} onClick={() => onMark("pending")} icon={<Sparkles />} label="Clear" activeCls="border-white/25 bg-white/10" />
          <FigmaPill active={instance.status === "cancelled"} disabled={!canMark || pending} onClick={() => onMark("cancelled")} icon={<Power />} label="Off" activeCls="border-amber-400/50 bg-amber-500/25" />
          <FigmaPill active={instance.status === "missed"} disabled={!canMark || pending} onClick={() => onMark("missed")} icon={<MinusCircle />} label="Missed" activeCls="border-red-400/50 bg-red-500/25" />
          <FigmaPill active={instance.status === "attended"} disabled={!canMark || pending} onClick={() => onMark("attended")} icon={<CheckCircle2 />} label="Attended" activeCls="border-emerald-400/50 bg-emerald-500/25" />
        </div>
      </div>
      </div>
    </div>
  );
}
function FigmaPill({
  active, disabled, onClick, icon, label, activeCls,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeCls: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex h-full min-w-0 items-center justify-center gap-[1.031cqw] rounded-[4.124cqw] border-[0.5px] px-[1.031cqw] text-white transition disabled:opacity-40 ${
        active ? activeCls : "border-white/25 bg-black/20 hover:bg-white/5"
      }`}
    >
      <span className="shrink-0 [&>svg]:h-[2.577cqw] [&>svg]:w-[2.577cqw]">{icon}</span>
      <span className="whitespace-nowrap text-[2.759cqw] font-normal leading-[3.351cqw] tracking-[-0.02em]">
        {label}
      </span>
    </button>
  );
}
function StatusButtons({
  status, canMark, pending, onMark,
}: {
  status: UiStatus;
  canMark: boolean;
  pending: boolean;
  onMark: (s: UiStatus) => void;
}) {
  const btn = (
    key: UiStatus,
    label: string,
    icon: React.ReactNode,
    activeCls: string,
  ) => {
    const isActive = status === key;
    return (
      <button
        type="button"
        disabled={!canMark || pending}
        onClick={() => onMark(key)}
        aria-pressed={isActive}
        aria-label={label}
        className={`h-8 rounded-full text-[11px] font-normal flex items-center justify-center gap-1.5 text-white/90 transition disabled:opacity-40 ring-1 ${
          isActive
            ? activeCls
            : "bg-black/40 ring-white/5 hover:bg-black/60"
        }`}
      >
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="tracking-tight">{label}</span>
      </button>
    );
  };
  return (
    <div className="grid grid-cols-4 gap-2">
      {btn("pending", "Clear", <Sparkles />, "bg-white/10 ring-white/20")}
      {btn("cancelled", "Off", <Power />, "bg-amber-500/25 ring-amber-400/40")}
      {btn("missed", "Missed", <MinusCircle />, "bg-red-500/25 ring-red-400/40")}
      {btn("attended", "Attended", <CheckCircle2 />, "bg-emerald-500/25 ring-emerald-400/40")}
    </div>
  );
}

function CompactRow({
  instance, stats, onExpand, canMark, pending, onMark, onEditExtra, onDeleteExtra,
}: {
  instance: Instance;
  stats: ComponentStats;
  onExpand: () => void;
  canMark: boolean;
  pending: boolean;
  onMark: (s: UiStatus) => void;
  onEditExtra?: () => void;
  onDeleteExtra?: () => void;
}) {
  const Icon = courseIconFor(instance.course.icon);
  const pctText = stats.percentage === null ? "—" : `${stats.percentage.toFixed(0)}%`;
  const pill = statusPillStyles(instance.status);
  return (
    <div className="rounded-2xl bg-card border border-border p-2.5 flex items-center gap-2.5">
      <button
        type="button"
        onClick={onExpand}
        aria-label={`Expand ${instance.course.name}`}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
      >
        <SubjectIcon icon={Icon} className="h-9 w-9" iconClassName="h-4 w-4" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-medium text-sm truncate">{instance.course.name}</div>
            {instance.isExtra && (
              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded ring-1 font-semibold bg-purple-500/15 text-purple-300 ring-purple-500/30">
                EXTRA
              </span>
            )}
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded ring-1 font-semibold ${badgeStyles(instance.kind)}`}>
              {instance.kind.toUpperCase()}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1.5 tabular-nums">
            <Clock className="h-3 w-3" />
            {fromMinutes(instance.startMinute)}–{fromMinutes(instance.endMinute)}
            {instance.units > 1 && <><span className="opacity-60">·</span><span>{instance.units}u</span></>}
            <span className="opacity-60">·</span>
            <span className={`px-1.5 py-0.5 rounded ring-1 text-[9px] font-semibold ${pill.cls}`}>
              {pill.label}
            </span>
          </div>
        </div>
        <div className={`shrink-0 pr-[11px] text-sm font-semibold tabular-nums ${pctColor(stats)}`}>{pctText}</div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Class actions"
            className="text-muted-foreground/70 hover:text-foreground p-1 shrink-0"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canMark || pending} onClick={() => onMark("attended")}>
            <Check className="h-4 w-4 mr-2 text-green-500" /> Attended
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMark || pending} onClick={() => onMark("missed")}>
            <XCircle className="h-4 w-4 mr-2 text-red-500" /> Missed
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMark || pending} onClick={() => onMark("cancelled")}>
            <Ban className="h-4 w-4 mr-2 text-amber-500" /> Cancelled
          </DropdownMenuItem>
          {instance.status !== "pending" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!canMark || pending} onClick={() => onMark("pending")}>
                Clear status
              </DropdownMenuItem>
            </>
          )}
          {(onEditExtra || onDeleteExtra) && <DropdownMenuSeparator />}
          {onEditExtra && (
            <DropdownMenuItem onClick={onEditExtra}>
              <Pencil className="h-4 w-4 mr-2" /> Edit extra
            </DropdownMenuItem>
          )}
          {onDeleteExtra && (
            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={onDeleteExtra}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete extra
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyState({
  icon: Icon, title, hint, cta,
}: {
  icon: typeof BookOpen;
  title: string;
  hint: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-3">
        <Icon className="h-6 w-6" />
      </div>
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1 mb-4">{hint}</p>
      {cta}
    </div>
  );
}

function HolidayCard({ holiday, onEdit }: { holiday: HolidayRow; onEdit: () => void }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30 flex items-center justify-center">
          <PartyPopper className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{holiday.label || "Holiday"}</div>
          <div className="text-[11px] text-muted-foreground">No scheduled classes today.</div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      <div className="rounded-2xl bg-card border border-border h-32 animate-pulse" />
      <div className="rounded-2xl bg-card border border-border h-16 animate-pulse" />
      <div className="rounded-2xl bg-card border border-border h-16 animate-pulse" />
    </div>
  );
}

// ── Add sheet ────────────────────────────────────────────────────────
function AddSheet({
  open, onOpenChange, onMarkHoliday, onAddExtra, onAddCredit, onViewCredits,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMarkHoliday: () => void;
  onAddExtra: () => void;
  onAddCredit: () => void;
  onViewCredits: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Add</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-6">
          <button
            type="button"
            onClick={onAddExtra}
            className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-secondary/40 transition text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Add extra class</div>
              <div className="text-[11px] text-muted-foreground">One-off class for this date</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onAddCredit}
            className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-secondary/40 transition text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Add attendance credit</div>
              <div className="text-[11px] text-muted-foreground">Adjust attended / conducted</div>
            </div>
          </button>
          <button
            type="button"
            onClick={onViewCredits}
            className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-secondary/40 transition text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Manage credits</div>
              <div className="text-[11px] text-muted-foreground">Edit or delete adjustments</div>
            </div>
          </button>
          <Link
            to="/courses"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-secondary/40 transition"
          >
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Add course</div>
              <div className="text-[11px] text-muted-foreground">Manage your courses</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onMarkHoliday}
            className="w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 hover:bg-secondary/40 transition text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
              <PartyPopper className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Mark date as holiday</div>
              <div className="text-[11px] text-muted-foreground">Suppresses generated classes for this date</div>
            </div>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddRow({
  icon: Icon, title, hint, disabled,
}: { icon: typeof Sparkles; title: string; hint: string; disabled?: boolean }) {
  return (
    <div className={`w-full rounded-2xl bg-card border border-border p-3 flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}>
      <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}

// ── Holiday sheet ───────────────────────────────────────────────────
function HolidaySheet({
  open, onOpenChange, session, date, existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: Session;
  date: string;
  existing: HolidayRow | null;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState(existing?.label ?? "Holiday");
  const [dateVal, setDateVal] = useState(existing?.date ?? date);
  const [seededKey, setSeededKey] = useState<string>("");
  const k = `${open ? "o" : "c"}:${existing?.id ?? "new"}:${date}`;
  if (open && k !== seededKey) {
    setSeededKey(k);
    setLabel(existing?.label ?? "Holiday");
    setDateVal(existing?.date ?? date);
  }
  const save = useMutation({
    mutationFn: async () => {
      const cleanLabel = label.trim() || null;
      if (existing) {
        await holidaysApi.update(session, existing.id, {
          date: dateVal,
          label: cleanLabel,
        });
      } else {
        await holidaysApi.create(session, { date: dateVal, label: cleanLabel });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "holidays"] });
      toast.success(existing ? "Holiday updated" : "Holiday marked");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (existing) await holidaysApi.delete(session, existing.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "holidays"] });
      toast.success("Holiday removed");
      onOpenChange(false);
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{existing ? "Edit holiday" : "Mark holiday"}</SheetTitle>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 pb-6"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        >
          <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
            <Label htmlFor="h-date" className="text-xs text-muted-foreground">Date</Label>
            <Input
              id="h-date"
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              className="h-10 rounded-xl"
              required
            />
          </div>
          <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
            <Label htmlFor="h-label" className="text-xs text-muted-foreground">Title (optional)</Label>
            <Input
              id="h-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Public holiday"
              maxLength={80}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {existing && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full h-11 col-span-1"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
              >
                Remove
              </Button>
            )}
            <Button
              type="submit"
              className={`rounded-full h-11 ${existing ? "" : "col-span-2"}`}
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : existing ? "Save" : "Mark holiday"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

async function removeHoliday(
  session: Session,
  qc: ReturnType<typeof useQueryClient>,
  holiday: HolidayRow,
) {
  try {
    await holidaysApi.delete(session, holiday.id);
    qc.invalidateQueries({ queryKey: [...sessionKey(session), "holidays"] });
    toast.success("Holiday removed");
  } catch (e) {
    toast.error(toUserMessage(e, "Failed"));
  }
}

// ── Bulk-mark sheet ─────────────────────────────────────────────────
function BulkMarkSheet({
  open, onOpenChange, instances, session,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instances: Instance[];
  session: Session;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) { setSeeded(true); setPicked(new Set(instances.map((i) => i.key))); }
  if (!open && seeded) setSeeded(false);

  const confirm = useMutation({
    mutationFn: async () => {
      for (const inst of instances) {
        if (!picked.has(inst.key)) continue;
        if (inst.status !== "pending") continue;
        if (inst.isExtra && inst.extraEventId) {
          await attendanceEventsApi.update(session, inst.extraEventId, {
            status: "attended",
          });
        } else if (inst.scheduleEntryId) {
          await attendanceEventsApi.create(session, {
            component_id: inst.componentId,
            schedule_entry_id: inst.scheduleEntryId,
            date: inst.date,
            status: "attended",
            units: inst.units,
            source: "bulk",
            note: null,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
      toast.success("Marked as attended");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Mark remaining as attended</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-6">
          {instances.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              Nothing pending on this day.
            </div>
          )}
          {instances.map((inst) => {
            const on = picked.has(inst.key);
            return (
              <label
                key={inst.key}
                className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border cursor-pointer"
              >
                <Checkbox
                  checked={on}
                  onCheckedChange={(v) => {
                    const next = new Set(picked);
                    if (v) next.add(inst.key); else next.delete(inst.key);
                    setPicked(next);
                  }}
                />
                {(() => {
                  const I = courseIconFor(inst.course.icon);
                  return <SubjectIcon icon={I} className="h-8 w-8" iconClassName="h-4 w-4" />;
                })()}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{inst.course.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {inst.kind.toUpperCase()} · {fromMinutes(inst.startMinute)}–{fromMinutes(inst.endMinute)}
                    {inst.units > 1 && ` · ${inst.units}u`}
                  </div>
                </div>
              </label>
            );
          })}
          <Button
            type="button"
            className="w-full rounded-full h-11 mt-2"
            disabled={confirm.isPending || picked.size === 0 || instances.length === 0}
            onClick={() => confirm.mutate()}
          >
            {confirm.isPending
              ? "Marking…"
              : `Confirm (${picked.size}/${instances.length})`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers for time inputs ─────────────────────────────────────────
function minutesToHHMM(mins: number | null | undefined): string {
  if (mins == null) return "";
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function hhmmToMinutes(s: string): number | null {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// ── Extra class sheet ───────────────────────────────────────────────
function ExtraSheet({
  open, onOpenChange, session, courses, components, defaultDate, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: Session;
  courses: CourseRow[];
  components: ComponentRow[];
  defaultDate: string;
  editing: Instance | null;
}) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState<string>("");
  const [componentId, setComponentId] = useState<string>("");
  const [dateVal, setDateVal] = useState<string>(defaultDate);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("10:00");
  const [units, setUnits] = useState<number>(1);
  const [status, setStatus] = useState<UiStatus>("pending");
  const [note, setNote] = useState<string>("");
  const [seed, setSeed] = useState("");

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);
  const compsForCourse = useMemo(
    () => components.filter((c) => c.course_id === courseId),
    [components, courseId],
  );

  const k = `${open ? "o" : "c"}:${editing?.extraEventId ?? "new"}:${defaultDate}`;
  if (open && k !== seed) {
    setSeed(k);
    if (editing) {
      setCourseId(editing.courseId);
      setComponentId(editing.componentId);
      setDateVal(editing.date);
      setStartTime(minutesToHHMM(editing.startMinute));
      setEndTime(minutesToHHMM(editing.endMinute));
      setUnits(editing.units);
      setStatus(editing.status);
      setNote(editing.note ?? "");
    } else {
      const first = activeCourses[0];
      setCourseId(first?.id ?? "");
      const firstComp = first ? components.find((c) => c.course_id === first.id) : undefined;
      setComponentId(firstComp?.id ?? "");
      setDateVal(defaultDate);
      setStartTime("09:00");
      setEndTime("10:00");
      setUnits(firstComp?.kind === "lab" ? Math.max(1, first?.default_lab_units ?? 1) : 1);
      setStatus("pending");
      setNote("");
    }
  }

  // Keep componentId consistent with the selected course.
  if (courseId && compsForCourse.length > 0 && !compsForCourse.some((c) => c.id === componentId)) {
    setComponentId(compsForCourse[0].id);
  }

  const isFutureDate = parseLocalIso(dateVal) > parseLocalIso(todayIso());

  const save = useMutation({
    mutationFn: async () => {
      if (!courseId) throw new Error("Choose a course");
      if (!componentId) throw new Error("Choose a component");
      const sm = hhmmToMinutes(startTime);
      const em = hhmmToMinutes(endTime);
      if (sm == null || em == null) throw new Error("Enter valid times");
      if (em <= sm) throw new Error("End time must be after start time");
      if (!Number.isInteger(units) || units < 1) throw new Error("Units must be a positive whole number");
      let finalStatus: EventStatus = status as EventStatus;
      if (isFutureDate && (finalStatus === "attended" || finalStatus === "missed")) {
        finalStatus = "pending";
      }
      if (editing?.extraEventId) {
        await attendanceEventsApi.update(session, editing.extraEventId, {
          component_id: componentId,
          date: dateVal,
          status: finalStatus,
          units,
          source: "extra",
          note: note.trim() || null,
          start_minute: sm,
          end_minute: em,
          event_type: "class",
        });
      } else {
        await attendanceEventsApi.create(session, {
          component_id: componentId,
          schedule_entry_id: null,
          date: dateVal,
          status: finalStatus,
          units,
          source: "extra",
          note: note.trim() || null,
          start_minute: sm,
          end_minute: em,
          event_type: "class",
          credit_counts_as_conducted: true,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
      toast.success(editing ? "Extra class updated" : "Extra class added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit extra class" : "Add extra class"}</SheetTitle>
        </SheetHeader>
        {activeCourses.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Create a course first to add an extra class.
          </div>
        ) : (
          <form
            className="mt-4 space-y-3 pb-6"
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          >
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Course" /></SelectTrigger>
                <SelectContent>
                  {activeCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Component</Label>
              <Select value={componentId} onValueChange={setComponentId} disabled={compsForCourse.length === 0}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Component" /></SelectTrigger>
                <SelectContent>
                  {compsForCourse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.kind[0].toUpperCase() + c.kind.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="ex-date" className="text-xs text-muted-foreground">Date</Label>
              <Input id="ex-date" type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className="h-10 rounded-xl" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
                <Label htmlFor="ex-start" className="text-xs text-muted-foreground">Start</Label>
                <Input id="ex-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10 rounded-xl" required />
              </div>
              <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
                <Label htmlFor="ex-end" className="text-xs text-muted-foreground">End</Label>
                <Input id="ex-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10 rounded-xl" required />
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="ex-units" className="text-xs text-muted-foreground">Attendance units</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setUnits(n)}
                    className={`h-9 px-3 rounded-full text-xs font-medium ${units === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                  >
                    {n}
                  </button>
                ))}
                <Input
                  id="ex-units"
                  type="number"
                  min={1}
                  step={1}
                  value={units}
                  onChange={(e) => setUnits(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="h-9 rounded-xl w-20"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Initial status</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["pending", "attended", "missed", "cancelled"] as UiStatus[]).map((s) => {
                  const disabled = isFutureDate && (s === "attended" || s === "missed");
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={disabled}
                      onClick={() => setStatus(s)}
                      className={`h-9 rounded-full text-xs font-medium capitalize disabled:opacity-40 ${
                        active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {isFutureDate && (
                <p className="text-[11px] text-muted-foreground">Future dates start as Pending.</p>
              )}
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="ex-note" className="text-xs text-muted-foreground">Note (optional)</Label>
              <Textarea id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-xl" />
            </div>
            <Button type="submit" className="w-full rounded-full h-11" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Add extra class"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Credit sheet ────────────────────────────────────────────────────
function CreditSheet({
  open, onOpenChange, session, courses, components, defaultDate, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: Session;
  courses: CourseRow[];
  components: ComponentRow[];
  defaultDate: string;
  editing: AttendanceEventRow | null;
}) {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState<string>("");
  const [componentId, setComponentId] = useState<string>("");
  const [dateVal, setDateVal] = useState<string>(defaultDate);
  const [units, setUnits] = useState<number>(1);
  const [countsAsConducted, setCountsAsConducted] = useState<boolean>(true);
  const [note, setNote] = useState<string>("");
  const [seed, setSeed] = useState("");

  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);
  const compsForCourse = useMemo(
    () => components.filter((c) => c.course_id === courseId),
    [components, courseId],
  );
  const editingCourseId = useMemo(() => {
    if (!editing) return null;
    return components.find((c) => c.id === editing.component_id)?.course_id ?? null;
  }, [editing, components]);

  const k = `${open ? "o" : "c"}:${editing?.id ?? "new"}:${defaultDate}`;
  if (open && k !== seed) {
    setSeed(k);
    if (editing) {
      setCourseId(editingCourseId ?? "");
      setComponentId(editing.component_id);
      setDateVal(editing.date);
      setUnits(editing.units);
      setCountsAsConducted(editing.credit_counts_as_conducted ?? true);
      setNote(editing.note ?? "");
    } else {
      const first = activeCourses[0];
      setCourseId(first?.id ?? "");
      const firstComp = first ? components.find((c) => c.course_id === first.id) : undefined;
      setComponentId(firstComp?.id ?? "");
      setDateVal(defaultDate);
      setUnits(1);
      setCountsAsConducted(true);
      setNote("");
    }
  }

  if (courseId && compsForCourse.length > 0 && !compsForCourse.some((c) => c.id === componentId)) {
    setComponentId(compsForCourse[0].id);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!componentId) throw new Error("Choose a component");
      if (!Number.isInteger(units) || units < 1) throw new Error("Units must be a positive whole number");
      if (editing) {
        await attendanceEventsApi.update(session, editing.id, {
          component_id: componentId,
          date: dateVal,
          units,
          credit_counts_as_conducted: countsAsConducted,
          note: note.trim() || null,
          source: "credit",
          status: "credit",
          event_type: "credit",
        });
      } else {
        await attendanceEventsApi.create(session, {
          component_id: componentId,
          schedule_entry_id: null,
          date: dateVal,
          status: "credit",
          units,
          source: "credit",
          note: note.trim() || null,
          event_type: "credit",
          credit_counts_as_conducted: countsAsConducted,
          start_minute: null,
          end_minute: null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "attendance_events"] });
      toast.success(editing ? "Credit updated" : "Credit added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit credit" : "Add attendance credit"}</SheetTitle>
        </SheetHeader>
        {activeCourses.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Create a course first to add a credit.
          </div>
        ) : (
          <form
            className="mt-4 space-y-3 pb-6"
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          >
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Course" /></SelectTrigger>
                <SelectContent>
                  {activeCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label className="text-xs text-muted-foreground">Component</Label>
              <Select value={componentId} onValueChange={setComponentId} disabled={compsForCourse.length === 0}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Component" /></SelectTrigger>
                <SelectContent>
                  {compsForCourse.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.kind[0].toUpperCase() + c.kind.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="cr-date" className="text-xs text-muted-foreground">Date</Label>
              <Input id="cr-date" type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} className="h-10 rounded-xl" required />
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="cr-units" className="text-xs text-muted-foreground">Credit units</Label>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setUnits(n)}
                    className={`h-9 px-3 rounded-full text-xs font-medium ${units === n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                  >
                    +{n}
                  </button>
                ))}
                <Input
                  id="cr-units"
                  type="number"
                  min={1}
                  step={1}
                  value={units}
                  onChange={(e) => setUnits(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className="h-9 rounded-xl w-20"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="cr-count" className="text-sm">Counts as conducted</Label>
                <p className="text-[11px] text-muted-foreground">Off increases attended only; percentage caps at 100%.</p>
              </div>
              <Switch id="cr-count" checked={countsAsConducted} onCheckedChange={setCountsAsConducted} />
            </div>
            <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
              <Label htmlFor="cr-note" className="text-xs text-muted-foreground">Reason (optional)</Label>
              <Textarea id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-xl" />
            </div>
            <Button type="submit" className="w-full rounded-full h-11" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Add credit"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Credits list sheet ──────────────────────────────────────────────
function CreditsListSheet({
  open, onOpenChange, events, coursesById, componentsById, onEdit, onDelete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  events: AttendanceEventRow[];
  coursesById: Map<string, CourseRow>;
  componentsById: Map<string, ComponentRow>;
  onEdit: (ev: AttendanceEventRow) => void;
  onDelete: (ev: AttendanceEventRow) => void;
}) {
  const credits = useMemo(
    () => events
      .filter((e) => (e.event_type ?? (e.status === "credit" ? "credit" : "class")) === "credit")
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [events],
  );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Attendance credits</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2 pb-6">
          {credits.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">No credits yet.</div>
          )}
          {credits.map((ev) => {
            const comp = componentsById.get(ev.component_id);
            const course = comp ? coursesById.get(comp.course_id) : undefined;
            return (
              <div key={ev.id} className="rounded-2xl bg-card border border-border p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {course?.name ?? "Course"} · +{ev.units}
                    {ev.credit_counts_as_conducted === false && " (bonus)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {comp?.kind.toUpperCase()} · {ev.date}
                    {ev.note ? ` · ${ev.note}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Edit credit"
                  onClick={() => onEdit(ev)}
                  className="p-2 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete credit"
                  onClick={() => onDelete(ev)}
                  className="p-2 text-red-500 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Confirm dialog ──────────────────────────────────────────────────
function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}