/**
 * Hybrid attendance-logs data layer. Guest → IndexedDB, signed-in → Supabase.
 */

import { supabase } from "@/integrations/supabase/client";
import { attendanceRepo } from "@/lib/db/repositories";
import type { GuestAttendanceLog } from "@/lib/db/schema";
import type { Session } from "@/lib/session";

export type LogRow = {
  id: string;
  subject_id: string;
  date: string;
  kind: "lecture" | "lab";
  status: "present" | "absent" | "holiday";
  source: string;
};

function toRow(g: GuestAttendanceLog): LogRow {
  return {
    id: g.id,
    subject_id: g.subjectId,
    date: g.date,
    kind: g.kind,
    status: g.status,
    source: g.source,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const attendanceApi = {
  async list(session: Session): Promise<LogRow[]> {
    if (session.mode === "guest") {
      const rows = await attendanceRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase.from("attendance_logs").select("*");
    if (error) throw error;
    return (data ?? []) as LogRow[];
  },

  async update(session: Session, id: string, patch: { status: "present" | "absent" }) {
    if (session.mode === "guest") {
      await attendanceRepo.update(id, { status: patch.status });
      return;
    }
    const { error } = await supabase
      .from("attendance_logs")
      .update({ status: patch.status })
      .eq("id", id);
    if (error) throw error;
  },

  async insert(
    session: Session,
    row: {
      subject_id: string;
      date: string;
      kind: "lecture" | "lab";
      status: "present" | "absent";
      source: string;
    },
  ) {
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      await attendanceRepo.create({
        ownerId,
        subjectId: row.subject_id,
        date: row.date,
        kind: row.kind,
        status: row.status,
        source: row.source,
      });
      return;
    }
    const { error } = await supabase.from("attendance_logs").insert({
      subject_id: row.subject_id,
      user_id: ownerId,
      date: row.date,
      kind: row.kind,
      status: row.status,
      source: row.source,
    });
    if (error) throw error;
  },
};