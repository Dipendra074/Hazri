/**
 * Hybrid to-dos data layer. Guest → IndexedDB, signed-in → Supabase `todos`.
 * Returns a consistent camelCase shape to the UI so callers don't branch.
 */

import { supabase } from "@/integrations/supabase/client";
import { todosRepo } from "@/lib/db/repositories";
import type { GuestTodo } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type TodoRow = {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  position: number;
};

function fromGuest(g: GuestTodo): TodoRow {
  return {
    id: g.id,
    title: g.title,
    done: g.done,
    dueAt: g.dueAt,
    position: g.position,
  };
}

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const todosApi = {
  async list(session: Session): Promise<TodoRow[]> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const rows = await todosRepo.list(ownerId);
      return rows.map(fromGuest);
    }
    const { data, error } = await supabase
      .from("todos")
      .select("id, title, done, due_at, created_at")
      .order("done", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r, i) => ({
      id: r.id as string,
      title: r.title as string,
      done: !!r.done,
      dueAt: (r.due_at as string | null) ?? null,
      position: i,
    }));
  },

  async create(session: Session, input: { title: string; dueAt?: string | null }): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await todosRepo.create({
        ownerId,
        title: input.title,
        done: false,
        dueAt: input.dueAt ?? null,
        position: Date.now(),
      });
      return;
    }
    const { error } = await supabase.from("todos").insert({
      user_id: ownerId,
      title: input.title,
      due_at: input.dueAt ?? null,
      done: false,
    });
    if (error) throw error;
  },

  async setDone(session: Session, id: string, done: boolean): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await todosRepo.update(id, { done });
      return;
    }
    const { error } = await supabase
      .from("todos")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw error;
  },

  async delete(session: Session, id: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await todosRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("todos").delete().eq("id", id);
    if (error) throw error;
  },
};