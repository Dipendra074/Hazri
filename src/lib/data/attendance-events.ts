import { supabase } from "@/integrations/supabase/client";
import { attendanceEventsRepo } from "@/lib/db/repositories";
import type { EventStatus, EventType, GuestAttendanceEvent } from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import { assertCloudReachable, toFriendlyError } from "@/lib/data/cloud";

export type AttendanceEventRow = {
  id: string;
  component_id: string;
  schedule_entry_id: string | null;
  date: string;
  status: EventStatus;
  units: number;
  source: string;
  note: string | null;
  event_type?: EventType;
  credit_counts_as_conducted?: boolean;
  start_minute?: number | null;
  end_minute?: number | null;
};

function toRow(e: GuestAttendanceEvent): AttendanceEventRow {
  return {
    id: e.id,
    component_id: e.componentId,
    schedule_entry_id: e.scheduleEntryId,
    date: e.date,
    status: e.status,
    units: e.units,
    source: e.source,
    note: e.note,
    event_type: e.eventType ?? "class",
    credit_counts_as_conducted: e.creditCountsAsConducted ?? true,
    start_minute: e.startMinute ?? null,
    end_minute: e.endMinute ?? null,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const attendanceEventsApi = {
  async list(session: Session): Promise<AttendanceEventRow[]> {
    if (session.mode === "guest") {
      const rows = await attendanceEventsRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase.from("attendance_events").select("*");
    if (error) throw toFriendlyError(error);
    return (data ?? []) as AttendanceEventRow[];
  },
  async listForDate(session: Session, date: string): Promise<AttendanceEventRow[]> {
    if (session.mode === "guest") {
      const rows = await attendanceEventsRepo.listForDate(session.userId, date);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase
      .from("attendance_events")
      .select("*")
      .eq("date", date);
    if (error) throw toFriendlyError(error);
    return (data ?? []) as AttendanceEventRow[];
  },
  async create(session: Session, input: Omit<AttendanceEventRow, "id">) {
    assertCloudReachable(session);
    const ownerId = assertActive(session);
    const withDefaults = {
      event_type: "class" as EventType,
      credit_counts_as_conducted: true,
      start_minute: null as number | null,
      end_minute: null as number | null,
      ...input,
    };
    if (session.mode === "guest") {
      const record = await attendanceEventsRepo.create({
        ownerId,
        componentId: withDefaults.component_id,
        scheduleEntryId: withDefaults.schedule_entry_id,
        date: withDefaults.date,
        status: withDefaults.status,
        units: withDefaults.units,
        source: withDefaults.source,
        note: withDefaults.note,
        eventType: withDefaults.event_type,
        creditCountsAsConducted: withDefaults.credit_counts_as_conducted,
        startMinute: withDefaults.start_minute,
        endMinute: withDefaults.end_minute,
      });
      return toRow(record);
    }
    const { data, error } = await supabase
      .from("attendance_events")
      .insert({ ...withDefaults, user_id: ownerId })
      .select()
      .single();
    if (error) throw toFriendlyError(error);
    return data as AttendanceEventRow;
  },
  async update(session: Session, id: string, patch: Partial<AttendanceEventRow>) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      const dbPatch: Partial<GuestAttendanceEvent> = {};
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.units !== undefined) dbPatch.units = patch.units;
      if (patch.source !== undefined) dbPatch.source = patch.source;
      if (patch.note !== undefined) dbPatch.note = patch.note;
      if (patch.date !== undefined) dbPatch.date = patch.date;
      if (patch.component_id !== undefined) dbPatch.componentId = patch.component_id;
      if (patch.event_type !== undefined) dbPatch.eventType = patch.event_type;
      if (patch.credit_counts_as_conducted !== undefined)
        dbPatch.creditCountsAsConducted = patch.credit_counts_as_conducted;
      if (patch.start_minute !== undefined) dbPatch.startMinute = patch.start_minute;
      if (patch.end_minute !== undefined) dbPatch.endMinute = patch.end_minute;
      await attendanceEventsRepo.update(id, dbPatch);
      return;
    }
    const { error } = await supabase.from("attendance_events").update(patch).eq("id", id);
    if (error) throw toFriendlyError(error);
  },
  async delete(session: Session, id: string) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await attendanceEventsRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("attendance_events").delete().eq("id", id);
    if (error) throw toFriendlyError(error);
  },
};