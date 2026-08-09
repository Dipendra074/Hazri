/**
 * Hybrid routine-slots data layer.
 * Guest → IndexedDB (minute-based), signed-in → Supabase `routine_slots`
 * (HH:MM time columns).
 */

import { supabase } from "@/integrations/supabase/client";
import { routineRepo } from "@/lib/db/repositories";
import type { GuestRoutineSlot } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type RoutineSlotRow = {
  id: string;
  subjectId: string | null;
  label: string | null;
  weekday: number; // 0..6, Sunday-first
  startMinute: number;
  endMinute: number;
  kind: "lecture" | "lab";
};

function fromGuest(g: GuestRoutineSlot): RoutineSlotRow {
  return {
    id: g.id,
    subjectId: g.subjectId,
    label: g.label,
    weekday: g.weekday,
    startMinute: g.startMinute,
    endMinute: g.endMinute,
    kind: g.kind,
  };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toTime(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}:00`;
}

function assertActive(s: Session): string {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const routineApi = {
  async list(session: Session): Promise<RoutineSlotRow[]> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const rows = await routineRepo.list(ownerId);
      return rows.map(fromGuest);
    }
    const { data, error } = await supabase
      .from("routine_slots")
      .select("id, subject_id, day_of_week, start_time, end_time, kind, room")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id as string,
      subjectId: (r.subject_id as string | null) ?? null,
      label: (r.room as string | null) ?? null,
      weekday: (r.day_of_week as number) ?? 0,
      startMinute: toMin(String(r.start_time).slice(0, 5)),
      endMinute: toMin(String(r.end_time).slice(0, 5)),
      kind: ((r.kind as string) === "lab" ? "lab" : "lecture"),
    }));
  },

  async create(
    session: Session,
    input: Omit<RoutineSlotRow, "id">,
  ): Promise<void> {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await routineRepo.create({
        ownerId,
        subjectId: input.subjectId,
        label: input.label,
        weekday: input.weekday,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        kind: input.kind,
      });
      return;
    }
    const { error } = await supabase.from("routine_slots").insert({
      user_id: ownerId,
      subject_id: input.subjectId ?? (() => { throw new Error("subject_id required"); })(),
      day_of_week: input.weekday,
      start_time: toTime(input.startMinute),
      end_time: toTime(input.endMinute),
      kind: input.kind,
      room: input.label ?? null,
    });
    if (error) throw error;
  },

  async delete(session: Session, id: string): Promise<void> {
    assertActive(session);
    if (session.mode === "guest") {
      await routineRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("routine_slots").delete().eq("id", id);
    if (error) throw error;
  },
};