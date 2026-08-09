import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Beaker,
  GraduationCap,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  CalendarDays,
  Layers,
  FlaskConical,
  Calculator,
  Languages,
  Code2,
  Palette,
  Music2,
  Globe2,
  Flame,
  Droplets,
  Cog,
  Wrench,
  Gauge,
  Car,
  Wind,
  Snowflake,
  Factory,
  Box,
  Hammer,
  Building,
  Waypoints,
  Mountain,
  Zap,
  CircuitBoard,
  Radio,
  Cpu,
  Database,
  BrainCircuit,
  Network,
  ShieldCheck,
  Atom,
  Dna,
  ChartNoAxesCombined,
  Compass,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SubjectIcon } from "@/components/app/subject-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { coursesApi, type CourseRow } from "@/lib/data/courses";
import { courseComponentsApi, type ComponentRow } from "@/lib/data/course-components";
import type { ComponentKind } from "@/lib/db/schema";
import { toUserMessage } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/courses")({
  validateSearch: (search: Record<string, unknown>) => ({
    add: search.add === true || search.add === "true" ? true : undefined,
  }),
  component: CoursesPage,
});

const COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#F43F5E",
  "#F97316", "#F59E0B", "#22C55E", "#10B981",
  "#06B6D4", "#3B82F6", "#94A3B8", "#EAB308",
];

const ICONS: { key: string; icon: LucideIcon }[] = [
  { key: "book", icon: BookOpen },
  { key: "beaker", icon: Beaker },
  { key: "flask", icon: FlaskConical },
  { key: "graduation", icon: GraduationCap },
  { key: "layers", icon: Layers },
  { key: "calculator", icon: Calculator },
  { key: "code", icon: Code2 },
  { key: "languages", icon: Languages },
  { key: "palette", icon: Palette },
  { key: "music", icon: Music2 },
  { key: "globe", icon: Globe2 },
  { key: "flame", icon: Flame },
  { key: "droplets", icon: Droplets },
  { key: "cog", icon: Cog },
  { key: "wrench", icon: Wrench },
  { key: "gauge", icon: Gauge },
  { key: "car", icon: Car },
  { key: "wind", icon: Wind },
  { key: "snowflake", icon: Snowflake },
  { key: "factory", icon: Factory },
  { key: "box", icon: Box },
  { key: "hammer", icon: Hammer },
  { key: "building", icon: Building },
  { key: "bridge", icon: Waypoints },
  { key: "mountain", icon: Mountain },
  { key: "zap", icon: Zap },
  { key: "circuit", icon: CircuitBoard },
  { key: "radio", icon: Radio },
  { key: "cpu", icon: Cpu },
  { key: "database", icon: Database },
  { key: "ai", icon: BrainCircuit },
  { key: "network", icon: Network },
  { key: "shield", icon: ShieldCheck },
  { key: "atom", icon: Atom },
  { key: "dna", icon: Dna },
  { key: "chart", icon: ChartNoAxesCombined },
  { key: "compass", icon: Compass },
  { key: "presentation", icon: Presentation },
];

function iconFor(key: string | null | undefined): LucideIcon {
  return ICONS.find((i) => i.key === key)?.icon ?? BookOpen;
}

function useCourseData(session: Session) {
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
  return { courses, components };
}

function CoursesPage() {
  const session = useSession();
  const { add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    if (add) {
      setAddOpen(true);
      navigate({ search: {}, replace: true });
    }
  }, [add, navigate]);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const { courses, components } = useCourseData(session);
  const qc = useQueryClient();

  const del = useMutation({
    mutationFn: async (id: string) => coursesApi.delete(session, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "courses"] });
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "course_components"] });
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "schedule_entries"] });
      toast.success("Course deleted");
      setDeleting(null);
    },
    onError: (e) => toast.error(toUserMessage(e, "Course could not be deleted. Please try again.")),
  });

  const compsByCourse = useMemo(() => {
    const map = new Map<string, ComponentRow[]>();
    for (const c of components.data ?? []) {
      const arr = map.get(c.course_id) ?? [];
      arr.push(c);
      map.set(c.course_id, arr);
    }
    return map;
  }, [components.data]);

  const list = courses.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Courses</h1>
        <Button data-tour="add-course" size="sm" className="rounded-full" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {courses.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl bg-card border border-border h-20 animate-pulse" />
          ))}
        </div>
      )}

      {!courses.isLoading && list.length === 0 && (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white mb-3">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="font-semibold">Add your first course</div>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Courses power your schedule and attendance stats.
          </p>
          <Button data-tour="add-course-empty" className="rounded-full" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Course
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {list.map((c) => (
          <CourseListItem
            key={c.id}
            course={c}
            components={compsByCourse.get(c.id) ?? []}
            onEdit={() => setEditing(c)}
            onDelete={() => setDeleting(c)}
          />
        ))}
      </div>

      {list.length > 0 && (
        <div className="pt-2 text-center">
          <Link
            to="/schedule"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Add classes to your weekly schedule
          </Link>
        </div>
      )}

      <CourseSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        session={session}
        course={null}
        existingComponents={[]}
      />
      <CourseSheet
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        session={session}
        course={editing}
        existingComponents={editing ? (compsByCourse.get(editing.id) ?? []) : []}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the course, its components, its schedule entries and its attendance history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white"
              onClick={() => deleting && del.mutate(deleting.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CourseListItem({
  course,
  components,
  onEdit,
  onDelete,
}: {
  course: CourseRow;
  components: ComponentRow[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = iconFor(course.icon);
  const kinds = components.map((c) => c.kind);
  const theory = components.find((c) => c.kind === "theory");
  const lab = components.find((c) => c.kind === "lab");
  return (
    <div className="rounded-2xl p-px dark:bg-[linear-gradient(178deg,#7D7D7D_0%,#111111_65%)]">
    <div className="rounded-2xl bg-card border border-border dark:border-transparent dark:bg-[#111111] p-3.5 flex items-center gap-3">
      <SubjectIcon icon={Icon} className="h-11 w-11" iconClassName="h-5 w-5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-semibold truncate">{course.name}</div>
          {course.code && (
            <div className="text-[11px] text-muted-foreground shrink-0">· {course.code}</div>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
          {kinds.includes("theory") && <KindBadge kind="theory" />}
          {kinds.includes("lab") && <KindBadge kind="lab" />}
          {kinds.includes("tutorial") && <KindBadge kind="tutorial" />}
          <span className="text-muted-foreground ml-1">Target {course.target_pct}%</span>
        </div>
        {(theory || lab) && (
          <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
            {theory && theory.initial_conducted > 0 && (
              <span>Theory {theory.initial_attended}/{theory.initial_conducted}</span>
            )}
            {lab && lab.initial_conducted > 0 && (
              <span>Lab {lab.initial_attended}/{lab.initial_conducted}</span>
            )}
          </div>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/70 hover:text-foreground p-1"
            aria-label="Course actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: ComponentKind }) {
  const styles: Record<ComponentKind, string> = {
    theory: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
    lab: "bg-[#6FEC71]/15 text-[#6FEC71] ring-[#6FEC71]/30",
    tutorial: "bg-[#ECDF6F]/15 text-[#ECDF6F] ring-[#ECDF6F]/30",
  };
  const label: Record<ComponentKind, string> = {
    theory: "THEORY",
    lab: "LAB",
    tutorial: "TUTORIAL",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded-md ring-1 font-semibold tracking-wide ${styles[kind]}`}>
      {label[kind]}
    </span>
  );
}

type FormState = {
  name: string;
  code: string;
  color: string;
  icon: string;
  targetPct: number;
  theory: boolean;
  lab: boolean;
  tutorial: boolean;
  labUnitsPreset: "1" | "2" | "3" | "custom";
  labUnitsCustom: number;
  importOpen: boolean;
  theoryAttended: number;
  theoryConducted: number;
  labAttended: number;
  labConducted: number;
  tutorialAttended: number;
  tutorialConducted: number;
};

function initialForm(course: CourseRow | null, existing: ComponentRow[]): FormState {
  const t = existing.find((c) => c.kind === "theory");
  const l = existing.find((c) => c.kind === "lab");
  const u = existing.find((c) => c.kind === "tutorial");
  const units = course?.default_lab_units ?? 1;
  const preset: FormState["labUnitsPreset"] =
    units === 1 || units === 2 || units === 3 ? (String(units) as "1" | "2" | "3") : "custom";
  return {
    name: course?.name ?? "",
    code: course?.code ?? "",
    color: course?.color ?? COLORS[0],
    icon: course?.icon ?? "book",
    targetPct: Number(course?.target_pct ?? 75),
    theory: course ? !!t : true,
    lab: course ? !!l : false,
    tutorial: course ? !!u : false,
    labUnitsPreset: preset,
    labUnitsCustom: preset === "custom" ? units : 4,
    importOpen: false,
    theoryAttended: t?.initial_attended ?? 0,
    theoryConducted: t?.initial_conducted ?? 0,
    labAttended: l?.initial_attended ?? 0,
    labConducted: l?.initial_conducted ?? 0,
    tutorialAttended: u?.initial_attended ?? 0,
    tutorialConducted: u?.initial_conducted ?? 0,
  };
}

function CourseSheet({
  open,
  onOpenChange,
  session,
  course,
  existingComponents,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: Session;
  course: CourseRow | null;
  existingComponents: ComponentRow[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(course, existingComponents));

  // Rebuild when opening a new/different course.
  const [openKey, setOpenKey] = useState<string>("");
  const key = `${open ? "o" : "c"}:${course?.id ?? "new"}`;
  if (open && key !== openKey) {
    setOpenKey(key);
    setForm(initialForm(course, existingComponents));
  }

  const labUnitsResolved =
    form.labUnitsPreset === "custom" ? form.labUnitsCustom : Number(form.labUnitsPreset);

  const anyComponent = form.theory || form.lab || form.tutorial;

  function validateComponent(kind: ComponentKind): string | null {
    const a =
      kind === "theory" ? form.theoryAttended :
      kind === "lab" ? form.labAttended : form.tutorialAttended;
    const c =
      kind === "theory" ? form.theoryConducted :
      kind === "lab" ? form.labConducted : form.tutorialConducted;
    if (a < 0 || c < 0) return "Values cannot be negative";
    if (!Number.isInteger(a) || !Number.isInteger(c)) return "Values must be whole numbers";
    if (a > c) return "Attended cannot exceed conducted";
    return null;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (!anyComponent) throw new Error("Enable at least one component");
      if (form.lab && labUnitsResolved < 1) throw new Error("Lab units must be at least 1");
      for (const kind of ["theory", "lab", "tutorial"] as const) {
        const enabled =
          kind === "theory" ? form.theory : kind === "lab" ? form.lab : form.tutorial;
        if (!enabled) continue;
        const err = validateComponent(kind);
        if (err) throw new Error(`${kind[0].toUpperCase() + kind.slice(1)}: ${err}`);
      }

      const coursePayload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        color: form.color,
        icon: form.icon,
        target_pct: form.targetPct,
        has_theory: form.theory,
        has_lab: form.lab,
        has_tutorial: form.tutorial,
        default_lab_units: form.lab ? labUnitsResolved : 1,
      };

      let courseId: string;
      if (course) {
        await coursesApi.update(session, course.id, coursePayload);
        courseId = course.id;
      } else {
        const created = await coursesApi.create(session, coursePayload);
        courseId = created.id;
      }

      const desired: { kind: ComponentKind; attended: number; conducted: number; enabled: boolean }[] = [
        { kind: "theory", enabled: form.theory, attended: form.theoryAttended, conducted: form.theoryConducted },
        { kind: "lab", enabled: form.lab, attended: form.labAttended, conducted: form.labConducted },
        { kind: "tutorial", enabled: form.tutorial, attended: form.tutorialAttended, conducted: form.tutorialConducted },
      ];

      for (const d of desired) {
        const existing = existingComponents.find((c) => c.kind === d.kind);
        if (d.enabled && !existing) {
          await courseComponentsApi.create(session, {
            course_id: courseId,
            kind: d.kind,
            required_pct: form.targetPct,
            initial_attended: d.attended,
            initial_conducted: d.conducted,
          });
        } else if (d.enabled && existing) {
          await courseComponentsApi.update(session, existing.id, {
            required_pct: form.targetPct,
            initial_attended: d.attended,
            initial_conducted: d.conducted,
          });
        } else if (!d.enabled && existing) {
          await courseComponentsApi.delete(session, existing.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "courses"] });
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "course_components"] });
      qc.invalidateQueries({ queryKey: [...sessionKey(session), "schedule_entries"] });
      toast.success(course ? "Course updated" : "Course created");
      onOpenChange(false);
    },
    onError: (e) => toast.error(toUserMessage(e, "Course could not be saved. Please try again.")),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{course ? "Edit course" : "Add course"}</SheetTitle>
        </SheetHeader>
        <form
          className="mt-4 space-y-3 pb-6"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        >
          <Tile>
            <Label htmlFor="c-name" className="text-xs text-muted-foreground">Course name</Label>
            <Input
              id="c-name"
              data-tour="course-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Data Structures"
              className="mt-2 h-10 rounded-xl"
              maxLength={80}
              required
              autoFocus
            />
          </Tile>

          <Tile>
            <IconPicker
              value={form.icon}
              onChange={(key) => setForm({ ...form, icon: key })}
            />
          </Tile>

          <Tile>
            <div className="flex items-center justify-between">
              <Label htmlFor="c-target" className="text-xs text-muted-foreground">Attendance target</Label>
              <span className="tabular-nums text-sm font-semibold">{form.targetPct}%</span>
            </div>
            <input
              id="c-target"
              data-tour="course-target"
              type="range"
              min={40}
              max={100}
              step={1}
              value={form.targetPct}
              onChange={(e) => setForm({ ...form, targetPct: Number(e.target.value) })}
              className="w-full mt-2 accent-primary"
            />
          </Tile>

          <Tile>
            <div className="text-xs text-muted-foreground mb-2">Components</div>
            <div className="grid grid-cols-3 gap-2">
              <KindToggle label="Theory" icon={BookOpen} active={form.theory} onClick={() => setForm({ ...form, theory: !form.theory })} />
              <KindToggle label="Lab" icon={Beaker} active={form.lab} onClick={() => setForm({ ...form, lab: !form.lab })} />
              <KindToggle label="Tutorial" icon={GraduationCap} active={form.tutorial} onClick={() => setForm({ ...form, tutorial: !form.tutorial })} />
            </div>
            {!anyComponent && (
              <p className="text-[11px] text-red-400 mt-2">Select at least one.</p>
            )}
          </Tile>

          {form.lab && (
            <Tile>
              <div className="text-xs text-muted-foreground mb-2">Default lab attendance units</div>
              <div className="grid grid-cols-4 gap-2">
                {(["1", "2", "3", "custom"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm({ ...form, labUnitsPreset: v })}
                    className={`h-9 rounded-xl text-sm font-medium transition ${
                      form.labUnitsPreset === v
                        ? "bg-white text-foreground dark:bg-[#252525] dark:text-white"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {v === "custom" ? "Custom" : v}
                  </button>
                ))}
              </div>
              {form.labUnitsPreset === "custom" && (
                <Input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={form.labUnitsCustom}
                  onChange={(e) =>
                    setForm({ ...form, labUnitsCustom: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                  }
                  className="mt-2 h-10 rounded-xl"
                />
              )}
            </Tile>
          )}

          <Collapsible open={form.importOpen} onOpenChange={(o) => setForm({ ...form, importOpen: o })}>
            <div className="rounded-2xl bg-card border border-border p-3">
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center justify-between text-sm font-medium">
                  <span>Import existing attendance (optional)</span>
                  <span className="text-xs text-muted-foreground">{form.importOpen ? "Hide" : "Show"}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                {form.theory && (
                  <ImportRow
                    label="Theory"
                    attended={form.theoryAttended}
                    conducted={form.theoryConducted}
                    onAttended={(v) => setForm({ ...form, theoryAttended: v })}
                    onConducted={(v) => setForm({ ...form, theoryConducted: v })}
                  />
                )}
                {form.lab && (
                  <ImportRow
                    label="Lab"
                    attended={form.labAttended}
                    conducted={form.labConducted}
                    onAttended={(v) => setForm({ ...form, labAttended: v })}
                    onConducted={(v) => setForm({ ...form, labConducted: v })}
                  />
                )}
                {form.tutorial && (
                  <ImportRow
                    label="Tutorial"
                    attended={form.tutorialAttended}
                    conducted={form.tutorialConducted}
                    onAttended={(v) => setForm({ ...form, tutorialAttended: v })}
                    onConducted={(v) => setForm({ ...form, tutorialConducted: v })}
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  Imported values only affect stats — they don’t appear in Today or Calendar.
                </p>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+8px)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Button
              type="submit"
              data-tour="create-course"
              className="w-full rounded-full h-11"
              disabled={save.isPending || !form.name.trim() || !anyComponent}
            >
              {save.isPending ? "Saving…" : course ? "Save changes" : "Create course"}
            </Button>
          </div>

        </form>
      </SheetContent>
    </Sheet>
  );
}

function KindToggle({
  label, icon: Icon, active, onClick,
}: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition text-xs font-medium ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ImportRow({
  label, attended, conducted, onAttended, onConducted,
}: {
  label: string;
  attended: number;
  conducted: number;
  onAttended: (v: number) => void;
  onConducted: (v: number) => void;
}) {
  const invalid = attended > conducted || attended < 0 || conducted < 0;
  return (
    <div>
      <div className="text-xs font-medium mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">Attended</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={attended}
            onChange={(e) => onAttended(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="mt-1 h-10 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Conducted</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={conducted}
            onChange={(e) => onConducted(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className="mt-1 h-10 rounded-xl"
          />
        </div>
      </div>
      {invalid && (
        <p className="text-[11px] text-red-400 mt-1">
          Attended cannot exceed conducted and values must be non-negative.
        </p>
      )}
    </div>
  );
}

function Tile({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-card border border-border p-3">{children}</div>;
}

function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const Selected = iconFor(value);
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">Icon</div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full h-11 rounded-xl bg-secondary flex items-center justify-between px-3"
      >
        <span className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg border-[0.3px] border-[#404040] bg-[#191919] flex items-center justify-center">
            <Selected className="h-4 w-4 text-white" strokeWidth={1.5} />
          </span>
          <span className="text-sm">Selected icon</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="grid grid-cols-6 gap-2 mt-3">
          {ICONS.map(({ key, icon: Icon }) => {
            const active = value === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { onChange(key); setOpen(false); }}
                aria-pressed={active}
                className={`h-10 rounded-xl flex items-center justify-center transition ${
                  active
                    ? "border-[0.3px] border-[#404040] bg-[#191919] text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { iconFor as courseIconFor };