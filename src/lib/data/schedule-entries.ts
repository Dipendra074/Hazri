import { supabase } from "@/integrations/supabase/client";
import { scheduleEntriesRepo } from "@/lib/db/repositories";
import type { GuestScheduleEntry } from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import { assertCloudReachable, toFriendlyError } from "@/lib/data/cloud";

export type ScheduleEntryRow = {
  id: string;
  component_id: string;
  weekday: number;
  start_minute: number;
  end_minute: number;
  units: number;
  position: number;
};

function toRow(e: GuestScheduleEntry): ScheduleEntryRow {
  return {
    id: e.id,
    component_id: e.componentId,
    weekday: e.weekday,
    start_minute: e.startMinute,
    end_minute: e.endMinute,
    units: e.units,
    position: e.position,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const scheduleEntriesApi = {
  async list(session: Session): Promise<ScheduleEntryRow[]> {
    if (session.mode === "guest") {
      const rows = await scheduleEntriesRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase
      .from("schedule_entries")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw toFriendlyError(error);
    return (data ?? []) as ScheduleEntryRow[];
  },
  async create(session: Session, input: Omit<ScheduleEntryRow, "id">) {
    assertCloudReachable(session);
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const record = await scheduleEntriesRepo.create({
        ownerId,
        componentId: input.component_id,
        weekday: input.weekday,
        startMinute: input.start_minute,
        endMinute: input.end_minute,
        units: input.units,
        position: input.position,
      });
      return toRow(record);
    }
    const { data, error } = await supabase
      .from("schedule_entries")
      .insert({ ...input, user_id: ownerId })
      .select()
      .single();
    if (error) throw toFriendlyError(error);
    return data as ScheduleEntryRow;
  },
  async update(session: Session, id: string, patch: Partial<ScheduleEntryRow>) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      const dbPatch: Partial<GuestScheduleEntry> = {};
      if (patch.weekday !== undefined) dbPatch.weekday = patch.weekday;
      if (patch.start_minute !== undefined) dbPatch.startMinute = patch.start_minute;
      if (patch.end_minute !== undefined) dbPatch.endMinute = patch.end_minute;
      if (patch.units !== undefined) dbPatch.units = patch.units;
      if (patch.position !== undefined) dbPatch.position = patch.position;
      await scheduleEntriesRepo.update(id, dbPatch);
      return;
    }
    const { error } = await supabase.from("schedule_entries").update(patch).eq("id", id);
    if (error) throw toFriendlyError(error);
  },
  async delete(session: Session, id: string) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await scheduleEntriesRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("schedule_entries").delete().eq("id", id);
    if (error) throw toFriendlyError(error);
  },
};