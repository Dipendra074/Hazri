import { supabase } from "@/integrations/supabase/client";
import { holidaysRepo } from "@/lib/db/repositories";
import type { GuestHoliday } from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import { assertCloudReachable, toFriendlyError } from "@/lib/data/cloud";

export type HolidayRow = {
  id: string;
  date: string;
  label: string | null;
};

function toRow(h: GuestHoliday): HolidayRow {
  return { id: h.id, date: h.date, label: h.label };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const holidaysApi = {
  async list(session: Session): Promise<HolidayRow[]> {
    if (session.mode === "guest") {
      const rows = await holidaysRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase.from("holidays").select("*");
    if (error) throw toFriendlyError(error);
    return (data ?? []) as HolidayRow[];
  },
  async create(session: Session, input: Omit<HolidayRow, "id">) {
    assertCloudReachable(session);
    const ownerId = assertActive(session);
    if (session.mode === "guest") {
      const record = await holidaysRepo.create({
        ownerId,
        date: input.date,
        label: input.label,
      });
      return toRow(record);
    }
    const { data, error } = await supabase
      .from("holidays")
      .insert({ ...input, user_id: ownerId })
      .select()
      .single();
    if (error) throw toFriendlyError(error);
    return data as HolidayRow;
  },
  async update(session: Session, id: string, patch: Partial<Omit<HolidayRow, "id">>) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await holidaysRepo.update(id, patch);
      return;
    }
    const { error } = await supabase.from("holidays").update(patch).eq("id", id);
    if (error) throw toFriendlyError(error);
  },
  async delete(session: Session, id: string) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await holidaysRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) throw toFriendlyError(error);
  },
};