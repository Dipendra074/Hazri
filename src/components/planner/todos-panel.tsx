import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListTodo, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComingSoon } from "@/components/app/coming-soon";
import { useSession, sessionKey, type Session } from "@/lib/session";
import { todosApi } from "@/lib/data/todos";
import { toUserMessage } from "@/lib/errors";
import { GlassCheckbox } from "@/components/planner/glass-checkbox";


export function TodosPanel() {
  const session = useSession();
  if (session.mode === "signed_in") {
    return (
      <ComingSoon
        icon={ListTodo}
        title="To-do"
        body="Quick tasks with due dates, priorities, categories, and swipe-to-complete."
        phase="Phase 3"
      />
    );
  }
  if (session.mode !== "guest") return null;
  return <TodosList session={session} />;
}

function TodosList({ session }: { session: Session }) {
  const qc = useQueryClient();
  const key = [...sessionKey(session), "todos"] as const;
  const [title, setTitle] = useState("");

  const { data: todos = [] } = useQuery({
    queryKey: key,
    queryFn: () => todosApi.list(session),
  });

  const add = useMutation({
    mutationFn: (t: string) => todosApi.create(session, { title: t }),
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(toUserMessage(e, "Failed")),
  });

  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      todosApi.setDone(session, id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const del = useMutation({
    mutationFn: (id: string) => todosApi.delete(session, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (t) add.mutate(t);
        }}
        className="flex gap-2"
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="h-11 rounded-2xl"
          maxLength={200}
        />
        <Button
          type="submit"
          className="h-11 rounded-2xl px-4"
          disabled={!title.trim() || add.isPending}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {todos.length === 0 && (
        <div className="rounded-3xl bg-card border border-border border-dashed p-8 text-center">
          <ListTodo className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="font-semibold">No tasks yet</div>
          <p className="text-sm text-muted-foreground mt-1">Add your first task above.</p>
        </div>
      )}

      <ul className="space-y-2">
        {todos.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-card border border-border p-3">
            <GlassCheckbox
              checked={t.done}
              onCheckedChange={(next) => toggle.mutate({ id: t.id, done: next })}
              size={20}
              aria-label={t.done ? "Mark as not done" : "Mark as done"}
            />

            <span className={`flex-1 text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>
              {t.title}
            </span>
            <button
              type="button"
              onClick={() => del.mutate(t.id)}
              className="text-muted-foreground/60 hover:text-destructive p-1"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}