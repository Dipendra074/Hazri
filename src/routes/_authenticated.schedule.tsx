import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  Pencil,
  Copy,
  Trash2,
  CalendarDays,
  Clock,
  GripVertical,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { coursesApi, type CourseRow } from "@/lib/data/courses";
import { courseComponentsApi, type ComponentRow } from "@/lib/data/course-components";
import { scheduleEntriesApi, type ScheduleEntryRow } from "@/lib/data/schedule-entries";
import type { ComponentKind } from "@/lib/db/schema";
import { courseIconFor } from "./_authenticated.courses";
import { SubjectIcon } from "@/components/app/subject-icon";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/schedule")({
  component: SchedulePage,
});

const DAY_TABS: { label: string; short: string; weekday: number }[] = [
  { label: "Monday", short: "Mon", weekday: 1 },
  { label: "Tuesday", short: "Tue", weekday: 2 },
  { label: "Wednesday", short: "Wed", weekday: 3 },
  { label: "Thursday", short: "Thu", weekday: 4 },
  { label: "Friday", short: "Fri", weekday: 5 },
  { label: "Saturday", short: "Sat", weekday: 6 },
  { label: "Sunday", short: "Sun", weekday: 0 },
];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMinutes(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}
function fromMinutesLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function SchedulePage() {
  const session = useSession();
  const qc = useQueryClient();
  const jsDay = new Date().getDay();
  const defaultTabIdx = DAY_TABS.findIndex((d) => d.weekday === jsDay);
  const [tabIdx, setTabIdx] = useState(defaultTabIdx === -1 ? 0 : defaultTabIdx);
  const activeWeekday = DAY_TABS[tabIdx].weekday;

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEntryRow | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"day" | "week">("week");

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

  const componentsById = useMemo(() => {
    const m = new Map<string, ComponentRow>();
    for (const c of compsQ.data ?? []) m.set(c.id, c);
    return m;
  }, [compsQ.data]);
  const coursesById = useMemo(() => {
    const m = new Map<string, CourseRow>();
    for (const c of coursesQ.data ?? []) m.set(c.id, c);
    return m;
  }, [coursesQ.data]);

  const dayEntries = useMemo(() => {
    const rows = (entriesQ.data ?? []).filter((e) => e.weekday === activeWeekday);
    return rows.sort((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : a.start_minute - b.start_minute,
    );
  }, [entriesQ.data, activeWeekday]);

  // Stable local order used for rendering. Synced from server data only when
  // no drag is in-flight, so neighbors don't re-flow mid-drag or immediately
  // after drop (which caused the flicker).
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const draggingRef = useRef(false);
  useEffect(() => {
    if (draggingRef.current) return;
    const next = dayEntries.map((e) => e.id);
    setOrderedIds((prev) =>
      prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next,
    );
  }, [dayEntries]);
  const entriesById = useMemo(() => {
    const m = new Map<string, ScheduleEntryRow>();
    for (const e of dayEntries) m.set(e.id, e);
    return m;
  }, [dayEntries]);
  const orderedEntries = useMemo(
    () => orderedIds.map((id) => entriesById.get(id)).filter((e): e is ScheduleEntryRow => !!e),
    [orderedIds, entriesById],
  );

  const invalidateEntries = () =>
    qc.invalidateQueries({ queryKey: [...sessionKey(session), "schedule_entries"] });

  const del = useMutation({
    mutationFn: (id: string) => scheduleEntriesApi.delete(session, id),
    onSuccess: () => { invalidateEntries(); toast.success("Entry removed"); },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const duplicate = useMutation({
    mutationFn: async (entry: ScheduleEntryRow) => {
      const maxPos = dayEntries.reduce((m, e) => Math.max(m, e.position), 0);
      await scheduleEntriesApi.create(session, {
        component_id: entry.component_id,
        weekday: entry.weekday,
        start_minute: entry.start_minute,
        end_minute: entry.end_minute,
        units: entry.units,
        position: maxPos + 1,
      });
    },
    onSuccess: () => { invalidateEntries(); toast.success("Duplicated"); },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const idx = orderedEntries.findIndex((e) => e.id === id);
      const target = idx + dir;
      if (idx === -1 || target < 0 || target >= orderedEntries.length) return;
      const a = orderedEntries[idx];
      const b = orderedEntries[target];
      await scheduleEntriesApi.update(session, a.id, { position: b.position });
      await scheduleEntriesApi.update(session, b.id, { position: a.position });
    },
    onSuccess: () => invalidateEntries(),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 1) {
        await scheduleEntriesApi.update(session, ids[i], { position: i + 1 });
      }
    },
    onMutate: async (ids: string[]) => {
      const key = [...sessionKey(session), "schedule_entries"];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ScheduleEntryRow[]>(key);
      if (prev) {
        const posById = new Map(ids.map((id, i) => [id, i + 1]));
        qc.setQueryData<ScheduleEntryRow[]>(
          key,
          prev.map((e) => (posById.has(e.id) ? { ...e, position: posById.get(e.id)! } : e)),
        );
      }
      return { prev, key };
    },
    onError: (e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(toUserMessage(e, "Failed"));
    },
    // Optimistic cache already reflects new order; skip refetch so the
    // list doesn't re-mount and re-play drop animations on neighbors.
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const justDraggedRef = useRef(false);
  const onDragStart = () => {
    draggingRef.current = true;
  };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) {
      draggingRef.current = false;
      return;
    }
    const oldIdx = orderedIds.findIndex((id) => id === active.id);
    const newIdx = orderedIds.findIndex((id) => id === over.id);
    if (oldIdx < 0 || newIdx < 0) {
      draggingRef.current = false;
      return;
    }
    const nextIds = arrayMove(orderedIds, oldIdx, newIdx);
    setOrderedIds(nextIds);
    justDraggedRef.current = true;
    window.setTimeout(() => {
      justDraggedRef.current = false;
    }, 300);
    reorder.mutate(nextIds, {
      onSettled: () => {
        draggingRef.current = false;
      },
    });
  };
  const onDragCancel = () => {
    draggingRef.current = false;
  };

  const clearDay = useMutation({
    mutationFn: async () => {
      for (const e of dayEntries) await scheduleEntriesApi.delete(session, e.id);
    },
    onSuccess: () => { invalidateEntries(); toast.success("Day cleared"); setClearOpen(false); },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const copyDay = useMutation({
    mutationFn: async (targets: number[]) => {
      for (const wd of targets) {
        if (wd === activeWeekday) continue;
        const existing = (entriesQ.data ?? []).filter((e) => e.weekday === wd);
        const basePos = existing.reduce((m, e) => Math.max(m, e.position), 0);
        let i = 1;
        for (const e of dayEntries) {
          await scheduleEntriesApi.create(session, {
            component_id: e.component_id,
            weekday: wd,
            start_minute: e.start_minute,
            end_minute: e.end_minute,
            units: e.units,
            position: basePos + i,
          });
          i += 1;
        }
      }
    },
    onSuccess: () => { invalidateEntries(); toast.success("Day copied"); setCopyOpen(false); },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const courses = coursesQ.data ?? [];
  const hasAnyCourse = courses.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-tour="schedule-edit"
            onClick={() => setViewMode((v) => (v === "day" ? "week" : "day"))}
            aria-pressed={viewMode === "day"}
            aria-label={viewMode === "day" ? "Done editing, show full week" : "Edit schedule"}
            title={viewMode === "day" ? "Done editing" : "Edit schedule"}
            className={`h-8 w-8 rounded-full flex items-center justify-center transition ${
              viewMode === "day"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-8 w-8 rounded-full bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                aria-label="Day actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/courses" search={{ add: true }}>
                  <BookOpen className="h-4 w-4 mr-2" /> Add course
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={dayEntries.length === 0} onClick={() => setCopyOpen(true)}>
                <Copy className="h-4 w-4 mr-2" /> Copy day…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500"
                disabled={dayEntries.length === 0}
                onClick={() => setClearOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Clear day
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="rounded-full" disabled={!hasAnyCourse} onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      </div>

      {viewMode === "day" && (
      <div className="w-full">
        <div className="grid grid-cols-7 gap-1 w-full">
          {DAY_TABS.map((d, i) => {
            const active = i === tabIdx;
            const count = (entriesQ.data ?? []).filter((e) => e.weekday === d.weekday).length;
            return (
              <button
                key={d.weekday}
                type="button"
                onClick={() => setTabIdx(i)}
                aria-pressed={active}
                className={`w-full min-w-0 py-2 px-1 rounded-xl text-[11px] font-medium transition text-center ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <div>{d.short}</div>
                <div className={`text-[9px] mt-0.5 ${active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>
                  {count === 0 ? "—" : count}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {viewMode === "week" ? (
        !hasAnyCourse ? (
          <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-3">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="font-semibold">Create a course first</div>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              You need at least one course before you can build a weekly schedule.
            </p>
            <Link to="/courses" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">
              <Plus className="h-4 w-4" /> Add Course
            </Link>
          </div>
        ) : (
          <WeeklyTimetable
            entries={entriesQ.data ?? []}
            componentsById={componentsById}
            coursesById={coursesById}
            onEntryClick={(e) => setEditing(e)}
            onDayClick={(weekday) => {
              const idx = DAY_TABS.findIndex((d) => d.weekday === weekday);
              if (idx !== -1) setTabIdx(idx);
              setViewMode("day");
            }}
          />
        )
      ) : null}

      {viewMode === "day" && (<>


      {!hasAnyCourse ? (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-3">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="font-semibold">Create a course first</div>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            You need at least one course before you can build a weekly schedule.
          </p>
          <Link to="/courses" className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="h-4 w-4" /> Add Course
          </Link>
        </div>
      ) : dayEntries.length === 0 ? (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <CalendarDays className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">Nothing on {DAY_TABS[tabIdx].label}</div>
          <p className="text-sm text-muted-foreground mt-1">
            Tap Add to slot a class into this day.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {orderedEntries.map((e, i) => {
                const comp = componentsById.get(e.component_id);
                const course = comp ? coursesById.get(comp.course_id) : undefined;
                return (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    component={comp}
                    course={course}
                    onEdit={() => {
                      if (justDraggedRef.current) return;
                      setEditing(e);
                    }}
                    onDuplicate={() => duplicate.mutate(e)}
                    onDelete={() => del.mutate(e.id)}
                    onMoveUp={i === 0 ? undefined : () => move.mutate({ id: e.id, dir: -1 })}
                    onMoveDown={i === orderedEntries.length - 1 ? undefined : () => move.mutate({ id: e.id, dir: 1 })}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
      </>)}



      {addOpen && (
        <EntrySheet
          open={addOpen}
          onOpenChange={setAddOpen}
          session={session}
          weekday={activeWeekday}
          existingCount={dayEntries.length}
          courses={courses}
          components={compsQ.data ?? []}
          entry={null}
        />
      )}
      {editing && (
        <EntrySheet
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          session={session}
          weekday={activeWeekday}
          existingCount={dayEntries.length}
          courses={courses}
          components={compsQ.data ?? []}
          entry={editing}
        />
      )}

      <CopyDayDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        activeWeekday={activeWeekday}
        allEntries={entriesQ.data ?? []}
        onConfirm={(targets) => copyDay.mutate(targets)}
        pending={copyDay.isPending}
      />

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {DAY_TABS[tabIdx].label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {dayEntries.length} entr{dayEntries.length === 1 ? "y" : "ies"} for this day.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white" onClick={() => clearDay.mutate()}>
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryRow({
  entry, component, course,
  onEdit, onDuplicate, onDelete, onMoveUp, onMoveDown,
}: {
  entry: ScheduleEntryRow;
  component: ComponentRow | undefined;
  course: CourseRow | undefined;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useSortable({
    id: entry.id,
    animateLayoutChanges: () => false,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: "none",
    animation: "none",
    transformOrigin: "center",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <EntryCard
        entry={entry}
        component={component}
        course={course}
        handleProps={{ ...attributes, ...listeners }}
        actions={
          <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground p-1 shrink-0"
            aria-label="Entry actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}><Copy className="h-4 w-4 mr-2" /> Duplicate</DropdownMenuItem>
          <DropdownMenuItem disabled={!onMoveUp} onClick={onMoveUp}>
            <ChevronUp className="h-4 w-4 mr-2" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!onMoveDown} onClick={onMoveDown}>
            <ChevronDown className="h-4 w-4 mr-2" /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </div>
  );
}

function EntryCard({
  entry, component, course, handleProps, actions, dragging,
}: {
  entry: ScheduleEntryRow;
  component: ComponentRow | undefined;
  course: CourseRow | undefined;
  handleProps?: React.HTMLAttributes<HTMLButtonElement>;
  actions?: React.ReactNode;
  dragging?: boolean;
}) {
  const Icon = courseIconFor(course?.icon);
  const kind: ComponentKind = component?.kind ?? "theory";
  return (
    <div className={`rounded-2xl bg-card border border-border p-3 flex items-center gap-2.5 touch-none ${dragging ? "shadow-xl" : ""}`}>
      <button
        type="button"
        className="text-muted-foreground/60 shrink-0 cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none"
        aria-label="Drag to reorder"
        {...handleProps}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <SubjectIcon icon={Icon} className="h-10 w-10" iconClassName="h-4 w-4" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-medium text-sm truncate">{course?.name ?? "Unknown"}</div>
          <span className={`shrink-0 text-[9px] font-semibold tracking-wide px-1.5 py-0.5 rounded ring-1 ${badgeStyles(kind)}`}>
            {kind.toUpperCase()}
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-1.5 tabular-nums flex-wrap">
          <Clock className="h-3 w-3" />
          <span>{fromMinutesLabel(entry.start_minute)} – {fromMinutesLabel(entry.end_minute)}</span>
          <span className="opacity-60">·</span>
          <span>{entry.units}u</span>
        </div>
      </div>
      {actions}
    </div>
  );
}

function badgeStyles(kind: ComponentKind): string {
  return {
    theory: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
    lab: "bg-[#6FEC71] text-[#1D1E29] ring-[#6FEC71]",
    tutorial: "bg-[#ECDF6F] text-[#1D1E29] ring-[#ECDF6F]",
  }[kind];
}

function EntrySheet({
  open, onOpenChange, session, weekday, existingCount, courses, components, entry,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: Session;
  weekday: number;
  existingCount: number;
  courses: CourseRow[];
  components: ComponentRow[];
  entry: ScheduleEntryRow | null;
}) {
  const qc = useQueryClient();
  const entryComponent = entry ? components.find((c) => c.id === entry.component_id) : null;

  const [courseId, setCourseId] = useState(entryComponent?.course_id ?? courses[0]?.id ?? "");
  const [componentId, setComponentId] = useState<string>(entry?.component_id ?? "");
  const [start, setStart] = useState(entry ? fromMinutes(entry.start_minute) : "09:00");
  const [end, setEnd] = useState(entry ? fromMinutes(entry.end_minute) : "10:00");
  const [units, setUnits] = useState<number>(entry?.units ?? 1);
  const [unitsTouched, setUnitsTouched] = useState(!!entry);

  const [seededKey, setSeededKey] = useState<string>("");
  const key = `${open ? "o" : "c"}:${entry?.id ?? "new"}`;
  if (open && key !== seededKey) {
    setSeededKey(key);
    setCourseId(entryComponent?.course_id ?? courses[0]?.id ?? "");
    setComponentId(entry?.component_id ?? "");
    setStart(entry ? fromMinutes(entry.start_minute) : "09:00");
    setEnd(entry ? fromMinutes(entry.end_minute) : "10:00");
    setUnits(entry?.units ?? 1);
    setUnitsTouched(!!entry);
  }

  const courseComponents = components.filter((c) => c.course_id === courseId);
  const course = courses.find((c) => c.id === courseId);

  const effectiveComponentId =
    componentId && courseComponents.some((c) => c.id === componentId)
      ? componentId
      : courseComponents[0]?.id ?? "";
  const effectiveComponent = courseComponents.find((c) => c.id === effectiveComponentId);

  const defaultUnitsForComponent = (comp: ComponentRow | undefined) => {
    if (!comp) return 1;
    if (comp.kind === "lab") return course?.default_lab_units ?? 1;
    return 1;
  };
  const displayUnits = unitsTouched ? units : defaultUnitsForComponent(effectiveComponent);

  // Auto-calc end time from start + component kind.
  // Theory/Tutorial = 50 min, Lab = 1h 50m. Wraps at midnight.
  const effectiveKind = effectiveComponent?.kind;
  useEffect(() => {
    if (!open) return;
    if (!effectiveKind) return;
    if (!start) return;
    const s = toMinutes(start);
    if (!Number.isFinite(s)) return;
    const duration = effectiveKind === "lab" ? 110 : 50;
    const next = fromMinutes(((s + duration) % 1440 + 1440) % 1440);
    setEnd((prev) => (prev === next ? prev : next));
  }, [start, effectiveKind, open]);

  const save = useMutation({
    mutationFn: async () => {
      if (!effectiveComponent) throw new Error("Pick a component");
      const s = toMinutes(start);
      let e = toMinutes(end);
      if (e <= s) e += 1440; // handles wrap past midnight
      if (e <= s) throw new Error("End time must be after start time");
      if (displayUnits < 1) throw new Error("Units must be at least 1");
      if (entry) {
        await scheduleEntriesApi.update(session, entry.id, {
          component_id: effectiveComponent.id,
          start_minute: s,
          end_minute: e,
          units: displayUnits,
        });
      } else {
        await scheduleEntriesApi.create(session, {
          component_id: effectiveComponent.id,
          weekday,
          start_minute: s,
          end_minute: e,
          units: displayUnits,
          position: existingCount + 1,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "schedule_entries"] });
      toast.success(entry ? "Entry updated" : "Class added");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{entry ? "Edit class" : "Add class"}</SheetTitle>
        </SheetHeader>
        <form className="mt-4 space-y-3 pb-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Course</Label>
            <Select
              value={courseId}
              onValueChange={(v) => { setCourseId(v); setComponentId(""); setUnitsTouched(false); }}
            >
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.code ? ` · ${c.code}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl bg-card border border-border p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">Component</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["theory", "lab", "tutorial"] as const).map((k) => {
                const c = courseComponents.find((x) => x.kind === k);
                const disabled = !c;
                const active = c && effectiveComponentId === c.id;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    onClick={() => { if (c) { setComponentId(c.id); setUnitsTouched(false); } }}
                    aria-pressed={!!active}
                    className={`h-10 rounded-xl text-xs font-semibold tracking-wide transition ${
                      disabled
                        ? "bg-secondary/40 text-muted-foreground/40 cursor-not-allowed"
                        : active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-3 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s-start" className="text-xs text-muted-foreground">Start</Label>
              <Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label htmlFor="s-end" className="text-xs text-muted-foreground">End</Label>
              <Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-3">
            <Label htmlFor="s-units" className="text-xs text-muted-foreground">Attendance units</Label>
            <Input
              id="s-units"
              type="number"
              min={1}
              max={20}
              step={1}
              value={displayUnits}
              onChange={(e) => {
                setUnitsTouched(true);
                setUnits(Math.max(1, Math.floor(Number(e.target.value) || 1)));
              }}
              className="mt-1 h-10 rounded-xl"
            />
            {effectiveComponent?.kind === "lab" && !unitsTouched && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Defaulting to the lab’s configured {course?.default_lab_units ?? 1} unit
                {(course?.default_lab_units ?? 1) === 1 ? "" : "s"}.
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full rounded-full h-11"
            disabled={save.isPending || !effectiveComponent || toMinutes(end) <= toMinutes(start)}
          >
            {save.isPending ? "Saving…" : entry ? "Save changes" : "Add class"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function CopyDayDialog({
  open, onOpenChange, activeWeekday, allEntries, onConfirm, pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeWeekday: number;
  allEntries: ScheduleEntryRow[];
  onConfirm: (targets: number[]) => void;
  pending: boolean;
}) {
  const [targets, setTargets] = useState<Set<number>>(new Set());

  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) { setSeeded(true); setTargets(new Set()); }
  if (!open && seeded) setSeeded(false);

  const hasConflicts = Array.from(targets).some(
    (wd) => allEntries.some((e) => e.weekday === wd),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy this day to…</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {DAY_TABS.filter((d) => d.weekday !== activeWeekday).map((d) => {
            const has = allEntries.some((e) => e.weekday === d.weekday);
            const selected = targets.has(d.weekday);
            return (
              <label
                key={d.weekday}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary/50 cursor-pointer"
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(v) => {
                    const next = new Set(targets);
                    if (v) next.add(d.weekday); else next.delete(d.weekday);
                    setTargets(next);
                  }}
                />
                <div className="flex-1 text-sm">{d.label}</div>
                {has && <span className="text-[11px] text-amber-400">has entries</span>}
              </label>
            );
          })}
        </div>
        {hasConflicts && (
          <p className="text-[11px] text-amber-400">
            Selected days already have entries. This will add to them, not replace them.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={targets.size === 0 || pending}
            onClick={() => onConfirm(Array.from(targets))}
          >
            {pending ? "Copying…" : `Copy to ${targets.size} day${targets.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function WeeklyTimetable({
  entries,
  componentsById,
  coursesById,
  onEntryClick,
  onDayClick,
}: {
  entries: ScheduleEntryRow[];
  componentsById: Map<string, ComponentRow>;
  coursesById: Map<string, CourseRow>;
  onEntryClick: (e: ScheduleEntryRow) => void;
  onDayClick: (weekday: number) => void;
}) {
  const byDay = useMemo(() => {
    const m = new Map<number, ScheduleEntryRow[]>();
    for (const d of DAY_TABS) m.set(d.weekday, []);
    for (const e of entries) {
      const arr = m.get(e.weekday);
      if (arr) arr.push(e);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) =>
        a.start_minute !== b.start_minute
          ? a.start_minute - b.start_minute
          : a.position - b.position,
      );
    }
    return m;
  }, [entries]);

  const todayWd = new Date().getDay();
  const maxRows = Math.max(1, ...DAY_TABS.map((d) => (byDay.get(d.weekday) ?? []).length));

  return (
    <div className="rounded-2xl border border-border bg-card p-2">
      <div className="grid grid-cols-7 gap-1">
        {DAY_TABS.map((d) => {
          const isToday = d.weekday === todayWd;
          return (
            <button
              key={`h-${d.weekday}`}
              type="button"
              onClick={() => onDayClick(d.weekday)}
              aria-label={`Edit ${d.label}`}
              className={`text-center text-[11px] font-semibold py-1.5 transition hover:text-foreground ${
                isToday ? "text-primary border-b-2 border-primary" : "text-muted-foreground border-b border-border/60"
              }`}
            >
              {d.short}
            </button>
          );
        })}
        {Array.from({ length: maxRows }).flatMap((_, rowIdx) =>
          DAY_TABS.map((d) => {
            const rows = byDay.get(d.weekday) ?? [];
            const e = rows[rowIdx];
            if (!e) {
              return (
                <div
                  key={`${d.weekday}-${rowIdx}`}
                  className="h-16 rounded-md bg-secondary/20"
                />
              );
            }
            const comp = componentsById.get(e.component_id);
            const course = comp ? coursesById.get(comp.course_id) : undefined;
            const color = course?.color ?? "#6366f1";
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onEntryClick(e)}
                style={{ backgroundColor: color }}
                className="h-16 rounded-md px-1 py-1 text-[11px] font-medium leading-tight text-white text-center flex items-center justify-center overflow-hidden hover:opacity-90 transition"
                title={`${course?.name ?? "Class"} · ${fromMinutesLabel(e.start_minute)}–${fromMinutesLabel(e.end_minute)}`}
              >
                <span className="line-clamp-3 break-words">
                  {course?.name ?? "Class"}
                </span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
