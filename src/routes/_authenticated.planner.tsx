import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { FolderKanban, ListTodo } from "lucide-react";
import { ProjectsPanel } from "@/components/planner/projects-panel";
import { TodosPanel } from "@/components/planner/todos-panel";

const search = z.object({
  tab: z.string().catch("projects").default("projects"),
});

export const Route = createFileRoute("/_authenticated/planner")({
  validateSearch: search,
  component: PlannerPage,
});

function PlannerPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const active: "projects" | "todos" = tab === "todos" ? "todos" : "projects";
  const setTab = (t: "projects" | "todos") =>
    navigate({ to: "/planner", search: { tab: t }, replace: true });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight px-1">Planner</h1>
      <div
        role="tablist"
        aria-label="Planner sections"
        className="grid grid-cols-2 gap-1 p-1 rounded-full bg-secondary"
      >
        {[
          { key: "projects", label: "Projects", Icon: FolderKanban },
          { key: "todos", label: "To-do", Icon: ListTodo },
        ].map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setTab(key as "projects" | "todos")}
              className={`flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition ${
                isActive
                  ? "bg-white text-foreground shadow-sm dark:bg-[#252525] dark:text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {active === "projects" ? <ProjectsPanel /> : <TodosPanel />}
      </div>
    </div>
  );
}
