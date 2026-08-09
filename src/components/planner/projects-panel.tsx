import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  FolderKanban,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComingSoon } from "@/components/app/coming-soon";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { projectsApi, type ProjectRow } from "@/lib/data/projects";
import { projectTasksApi, type ProjectTaskRow } from "@/lib/data/project-tasks";
import { GlassCheckbox } from "@/components/planner/glass-checkbox";
import { toUserMessage } from "@/lib/errors";

export function ProjectsPanel() {
  const session = useSession();
  if (session.mode === "signed_in") {
    return (
      <ComingSoon
        icon={FolderKanban}
        title="Projects"
        body="Track academic projects with deadlines, checklists, and auto-computed progress."
        phase="Phase 3"
      />
    );
  }
  if (session.mode !== "guest") return null;
  return <ProjectsList session={session} />;
}

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function ProjectsList({ session }: { session: Session }) {
  const qc = useQueryClient();
  const key = [...sessionKey(session), "projects"] as const;
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: key,
    queryFn: () => projectsApi.list(session),
  });

  const add = useMutation({
    mutationFn: (n: string) => projectsApi.create(session, { name: n }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n) add.mutate(n);
        }}
        className="flex gap-2"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project name…"
          className="h-11 rounded-2xl"
          maxLength={120}
        />
        <Button type="submit" className="h-11 rounded-2xl px-4" disabled={!name.trim() || add.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {projects.length === 0 && (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <FolderKanban className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">No projects yet</div>
          <p className="text-sm text-muted-foreground mt-1">Add your first project above.</p>
        </div>
      )}

      <ul className="space-y-2">
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            session={session}
            project={p}
            expanded={openId === p.id}
            onToggle={() => setOpenId((id) => (id === p.id ? null : p.id))}
            onChanged={() => qc.invalidateQueries({ queryKey: key })}
          />
        ))}
      </ul>
    </div>
  );
}

function ProjectCard({
  session,
  project,
  expanded,
  onToggle,
  onChanged,
}: {
  session: Session;
  project: ProjectRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const tasksKey = [...sessionKey(session), "project-tasks", project.id] as const;
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const [newCategory, setNewCategory] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const { data: tasks = [] } = useQuery({
    queryKey: tasksKey,
    queryFn: () => projectTasksApi.listForProject(session, project.id),
  });

  const refetchTasks = () => qc.invalidateQueries({ queryKey: tasksKey });
  const fail = (e: unknown) => toast.error(toUserMessage(e, "Failed"));

  const rename = useMutation({
    mutationFn: (n: string) => projectsApi.rename(session, project.id, n),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: fail,
  });

  const del = useMutation({
    mutationFn: () => projectsApi.delete(session, project.id),
    onSuccess: () => {
      onChanged();
      refetchTasks();
    },
    onError: fail,
  });

  const addCategory = useMutation({
    mutationFn: (n: string) => projectsApi.addCategory(session, project.id, n),
    onSuccess: () => {
      setNewCategory("");
      onChanged();
    },
    onError: fail,
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const progress = pct(done, total);

  return (
    <li className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <FolderKanban className="h-5 w-5 text-primary shrink-0" />
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 text-left"
          aria-expanded={expanded}
        >
          {editing ? (
            <span className="sr-only">{project.name}</span>
          ) : (
            <span className="font-medium truncate block">{project.name}</span>
          )}
          <span className="text-xs text-muted-foreground">
            {done}/{total} tasks · {progress}%
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setDraftName(project.name);
            setEditing((v) => !v);
          }}
          className="text-muted-foreground/60 hover:text-foreground p-1"
          aria-label="Rename project"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => del.mutate()}
          className="text-muted-foreground/60 hover:text-destructive p-1"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground/60 hover:text-foreground p-1"
          aria-label={expanded ? "Collapse project" : "Expand project"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {editing && (
        <form
          className="flex gap-2 px-4 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = draftName.trim();
            if (n) rename.mutate(n);
          }}
        >
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="h-10 rounded-xl"
            maxLength={120}
            autoFocus
          />
          <Button type="submit" size="icon" className="h-10 w-10 rounded-xl">
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-xl"
            onClick={() => setEditing(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </form>
      )}

      <div className="px-4 pb-4">
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {project.categories.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sections yet — add one like Planning, Design or Testing.
            </p>
          )}

          {project.categories.map((cat) => (
            <CategoryBlock
              key={cat.id}
              session={session}
              projectId={project.id}
              category={cat}
              tasks={tasks.filter((t) => t.categoryId === cat.id)}
              expanded={openCats[cat.id] ?? true}
              onToggle={() =>
                setOpenCats((m) => ({ ...m, [cat.id]: !(m[cat.id] ?? true) }))
              }
              onProjectChanged={onChanged}
              onTasksChanged={refetchTasks}
            />
          ))}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = newCategory.trim();
              if (n) addCategory.mutate(n);
            }}
          >
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New section (e.g. Planning)…"
              className="h-10 rounded-xl"
              maxLength={80}
            />
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              className="h-10 w-10 rounded-xl"
              disabled={!newCategory.trim() || addCategory.isPending}
              aria-label="Add section"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

function CategoryBlock({
  session,
  projectId,
  category,
  tasks,
  expanded,
  onToggle,
  onProjectChanged,
  onTasksChanged,
}: {
  session: Session;
  projectId: string;
  category: { id: string; name: string };
  tasks: ProjectTaskRow[];
  expanded: boolean;
  onToggle: () => void;
  onProjectChanged: () => void;
  onTasksChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [taskTitle, setTaskTitle] = useState("");
  const fail = (e: unknown) => toast.error(toUserMessage(e, "Failed"));

  const rename = useMutation({
    mutationFn: (n: string) => projectsApi.renameCategory(session, projectId, category.id, n),
    onSuccess: () => {
      setEditing(false);
      onProjectChanged();
    },
    onError: fail,
  });

  const del = useMutation({
    mutationFn: () => projectsApi.deleteCategory(session, projectId, category.id),
    onSuccess: () => {
      onProjectChanged();
      onTasksChanged();
    },
    onError: fail,
  });

  const addTask = useMutation({
    mutationFn: (t: string) =>
      projectTasksApi.create(session, { projectId, categoryId: category.id, title: t }),
    onSuccess: () => {
      setTaskTitle("");
      onTasksChanged();
    },
    onError: fail,
  });

  const done = tasks.filter((t) => t.done).length;
  const progress = pct(done, tasks.length);

  return (
    <div className="rounded-xl bg-secondary/40 border border-border">
      <div className="flex items-center gap-2 p-3">
        <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
        {editing ? (
          <form
            className="flex-1 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = draft.trim();
              if (n) rename.mutate(n);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-8 rounded-lg"
              maxLength={80}
              autoFocus
            />
            <Button type="submit" size="icon" className="h-8 w-8 rounded-lg">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left">
            <span className="text-sm font-medium truncate block">{category.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {done}/{tasks.length} · {progress}%
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setDraft(category.name);
            setEditing((v) => !v);
          }}
          className="text-muted-foreground/60 hover:text-foreground p-1"
          aria-label="Rename section"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => del.mutate()}
          className="text-muted-foreground/60 hover:text-destructive p-1"
          aria-label="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground/60 hover:text-foreground p-1"
          aria-label={expanded ? "Collapse section" : "Expand section"}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="h-1 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {tasks.map((t) => (
            <TaskRow key={t.id} session={session} task={t} onChanged={onTasksChanged} />
          ))}

          <form
            className="flex gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              const t = taskTitle.trim();
              if (t) addTask.mutate(t);
            }}
          >
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Add task…"
              className="h-9 rounded-lg"
              maxLength={160}
            />
            <Button
              type="submit"
              size="icon"
              variant="secondary"
              className="h-9 w-9 rounded-lg"
              disabled={!taskTitle.trim() || addTask.isPending}
              aria-label="Add task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  session,
  task,
  onChanged,
}: {
  session: Session;
  task: ProjectTaskRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const fail = (e: unknown) => toast.error(toUserMessage(e, "Failed"));

  const toggle = useMutation({
    mutationFn: () => projectTasksApi.setDone(session, task.id, !task.done),
    onSuccess: onChanged,
    onError: fail,
  });
  const rename = useMutation({
    mutationFn: (t: string) => projectTasksApi.rename(session, task.id, t),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: fail,
  });
  const del = useMutation({
    mutationFn: () => projectTasksApi.delete(session, task.id),
    onSuccess: onChanged,
    onError: fail,
  });

  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = draft.trim();
          if (t) rename.mutate(t);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 rounded-lg"
          maxLength={160}
          autoFocus
        />
        <Button type="submit" size="icon" className="h-9 w-9 rounded-lg">
          <Check className="h-3.5 w-3.5" />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-card border border-border px-2.5 py-2">
      <GlassCheckbox
        checked={task.done}
        onCheckedChange={() => toggle.mutate()}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
      />

      <span
        className={`flex-1 min-w-0 truncate text-sm ${
          task.done ? "line-through opacity-50" : ""
        }`}
      >
        {task.title}
      </span>
      <button
        type="button"
        onClick={() => {
          setDraft(task.title);
          setEditing(true);
        }}
        className="text-muted-foreground/60 hover:text-foreground p-1"
        aria-label="Edit task"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => del.mutate()}
        className="text-muted-foreground/60 hover:text-destructive p-1"
        aria-label="Delete task"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
