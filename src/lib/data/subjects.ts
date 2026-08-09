/**
 * Hybrid subjects data layer. Guest → IndexedDB, signed-in → Supabase.
 * Returned shape matches the existing UI (snake_case) so the attendance
 * page can consume both without branching.
 */

import { supabase } from "@/integrations/supabase/client";
import { subjectsRepo, attendanceRepo } from "@/lib/db/repositories";
import type { GuestSubject } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type SubjectRow = {
  id: string;
  name: string;
  color: string;
  required_pct: number;
  initial_attended: number;
  initial_missed: number;
  has_lab: boolean;
  lab_required_pct: number | null;
  lab_initial_attended: number;
  lab_initial_missed: number;
};

export type NewSubject = {
  name: string;
  required_pct?: number;
  initial_attended: number;
  initial_missed: number;
  has_lab: boolean;
  lab_required_pct: number | null;
  lab_initial_attended: number;
  lab_initial_missed: number;
};

function toRow(g: GuestSubject): SubjectRow {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    required_pct: g.requiredPct,
    initial_attended: g.initialAttended,
    initial_missed: g.initialMissed,
    has_lab: g.hasLab,
    lab_required_pct: g.labRequiredPct,
    lab_initial_attended: g.labInitialAttended,
    lab_initial_missed: g.labInitialMissed,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const subjectsApi = {
  async list(session: Session): Promise<SubjectRow[]> {
    if (session.mode === "guest") {
      const rows = await subjectsRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase
      .from("subjects")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SubjectRow[];
  },

  async create(session: Session, input: NewSubject): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await subjectsRepo.create({
        ownerId,
        name: input.name,
        color: "#7c3aed",
        requiredPct: input.required_pct ?? 75,
        initialAttended: input.initial_attended,
        initialMissed: input.initial_missed,
        hasLab: input.has_lab,
        labRequiredPct: input.lab_required_pct,
        labInitialAttended: input.lab_initial_attended,
        labInitialMissed: input.lab_initial_missed,
      });
      return;
    }
    const { error } = await supabase.from("subjects").insert({
      user_id: ownerId,
      name: input.name,
      required_pct: input.required_pct ?? 75,
      initial_attended: input.initial_attended,
      initial_missed: input.initial_missed,
      has_lab: input.has_lab,
      lab_required_pct: input.lab_required_pct,
      lab_initial_attended: input.lab_initial_attended,
      lab_initial_missed: input.lab_initial_missed,
    });
    if (error) throw error;
  },

  async delete(session: Session, id: string): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await subjectsRepo.delete(id);
      await attendanceRepo.deleteForSubject(ownerId, id);
      return;
    }
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) throw error;
  },
};