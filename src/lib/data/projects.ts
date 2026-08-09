/**
 * Hybrid projects data layer. Guest → IndexedDB, signed-in → Supabase `projects`.
 *
 * Categories (Planning / Design / …) live inline on the guest project record,
 * so they persist and get picked up by the existing backup pipeline for free.
 */

import { v4 as uuid } from "uuid";
import { supabase } from "@/integrations/supabase/client";
import { projectsRepo, projectTasksRepo } from "@/lib/db/repositories";
import type { GuestProject, GuestProjectCategory } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type ProjectCategory = GuestProjectCategory;

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived" | "done";
  dueAt: string | null;
  categories: ProjectCategory[];
};

function sortCats(cats: ProjectCategory[] | undefined): ProjectCategory[] {
  return [...(cats ?? [])].sort((a, b) => a.position - b.position);
}

function fromGuest(g: GuestProject): ProjectRow {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    dueAt: g.dueAt,
    categories: sortCats(g.categories),
  };
}

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

function assertGuest(s: Session) {
  if (s.mode !== "guest") throw new Error("Project categories are local-only");
}

export const projectsApi = {
  async list(session: Session): Promise<ProjectRow[]> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const rows = await projectsRepo.list(ownerId);
      return rows.map(fromGuest);
    }
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, deadline")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      status: "active" as const,
      dueAt: (r.deadline as string | null) ?? null,
      categories: [],
    }));
  },

  async create(
    session: Session,
    input: { name: string; description?: string | null; dueAt?: string | null },
  ): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await projectsRepo.create({
        ownerId,
        name: input.name,
        description: input.description ?? null,
        color: null,
        status: "active",
        dueAt: input.dueAt ?? null,
        categories: [],
      });
      return;
    }
    const { error } = await supabase.from("projects").insert({
      user_id: ownerId,
      name: input.name,
      description: input.description ?? null,
      deadline: input.dueAt ?? null,
    });
    if (error) throw error;
  },

  async rename(session: Session, id: string, name: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await projectsRepo.update(id, { name });
      return;
    }
    const { error } = await supabase.from("projects").update({ name }).eq("id", id);
    if (error) throw error;
  },

  async delete(session: Session, id: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await projectTasksRepo.deleteForProject(id);
      await projectsRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  },

  // ── categories (local-first only) ───────────────────────────────────────
  async addCategory(session: Session, projectId: string, name: string): Promise<void> {
    assertGuest(session);
    const project = await projectsRepo.get(projectId);
    if (!project) return;
    const cats = sortCats(project.categories);
    cats.push({ id: uuid(), name, position: cats.length });
    await projectsRepo.update(projectId, { categories: cats });
  },

  async renameCategory(
    session: Session,
    projectId: string,
    categoryId: string,
    name: string,
  ): Promise<void> {
    assertGuest(session);
    const project = await projectsRepo.get(projectId);
    if (!project) return;
    const cats = sortCats(project.categories).map((c) =>
      c.id === categoryId ? { ...c, name } : c,
    );
    await projectsRepo.update(projectId, { categories: cats });
  },

  async deleteCategory(
    session: Session,
    projectId: string,
    categoryId: string,
  ): Promise<void> {
    assertGuest(session);
    const project = await projectsRepo.get(projectId);
    if (!project) return;
    const cats = sortCats(project.categories)
      .filter((c) => c.id !== categoryId)
      .map((c, i) => ({ ...c, position: i }));
    await projectsRepo.update(projectId, { categories: cats });
    const tasks = await projectTasksRepo.listForProject(projectId);
    await Promise.all(
      tasks.filter((t) => t.categoryId === categoryId).map((t) => projectTasksRepo.delete(t.id)),
    );
  },
};
