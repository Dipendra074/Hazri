/**
 * Hybrid project-tasks data layer.
 * Guest → IndexedDB, signed-in → Supabase `project_tasks`.
 */

import { supabase } from "@/integrations/supabase/client";
import { projectTasksRepo } from "@/lib/db/repositories";
import type { GuestProjectTask } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type ProjectTaskRow = {
  id: string;
  projectId: string;
  categoryId: string | null;
  title: string;
  done: boolean;
  position: number;
};

function fromGuest(g: GuestProjectTask): ProjectTaskRow {
  return {
    id: g.id,
    projectId: g.projectId,
    categoryId: g.categoryId ?? null,
    title: g.title,
    done: g.done,
    position: g.position,
  };
}

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const projectTasksApi = {
  async listForProject(session: Session, projectId: string): Promise<ProjectTaskRow[]> {
    assertActive(session);
    if (session.mode === "guest") {
      const rows = await projectTasksRepo.listForProject(projectId);
      return rows.map(fromGuest);
    }
    const { data, error } = await supabase
      .from("project_tasks")
      .select("id, project_id, title, done, position")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      projectId: r.project_id as string,
      categoryId: null,
      title: r.title as string,
      done: !!r.done,
      position: (r.position as number) ?? 0,
    }));
  },

  async create(
    session: Session,
    input: { projectId: string; categoryId?: string | null; title: string; position?: number },
  ): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await projectTasksRepo.create({
        ownerId,
        projectId: input.projectId,
        categoryId: input.categoryId ?? null,
        title: input.title,
        done: false,
        position: input.position ?? Date.now(),
      });
      return;
    }
    const { error } = await supabase.from("project_tasks").insert({
      user_id: ownerId,
      project_id: input.projectId,
      title: input.title,
      done: false,
      position: input.position ?? 0,
    });
    if (error) throw error;
  },

  async setDone(session: Session, id: string, done: boolean): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await projectTasksRepo.update(id, { done });
      return;
    }
    const { error } = await supabase.from("project_tasks").update({ done }).eq("id", id);
    if (error) throw error;
  },

  async rename(session: Session, id: string, title: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await projectTasksRepo.update(id, { title });
      return;
    }
    const { error } = await supabase.from("project_tasks").update({ title }).eq("id", id);
    if (error) throw error;
  },

  async delete(session: Session, id: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await projectTasksRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("project_tasks").delete().eq("id", id);
    if (error) throw error;
  },
};
