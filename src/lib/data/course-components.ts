import { supabase } from "@/integrations/supabase/client";
import { courseComponentsRepo } from "@/lib/db/repositories";
import type { ComponentKind, GuestCourseComponent } from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import { assertCloudReachable, requireOwnerId, toFriendlyError } from "@/lib/data/cloud";

export type ComponentRow = {
  id: string;
  course_id: string;
  kind: ComponentKind;
  required_pct: number;
  initial_attended: number;
  initial_conducted: number;
};

function toRow(c: GuestCourseComponent): ComponentRow {
  return {
    id: c.id,
    course_id: c.courseId,
    kind: c.kind,
    required_pct: c.requiredPct,
    initial_attended: c.initialAttended,
    initial_conducted: c.initialConducted,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const courseComponentsApi = {
  async list(session: Session): Promise<ComponentRow[]> {
    if (session.mode === "guest") {
      const rows = await courseComponentsRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase.from("course_components").select("*");
    if (error) throw toFriendlyError(error);
    return (data ?? []) as ComponentRow[];
  },
  async create(session: Session, input: Omit<ComponentRow, "id">) {
    assertCloudReachable(session);
    assertActive(session);
    const ownerId = await requireOwnerId(session);
    if (session.mode === "guest") {
      const record = await courseComponentsRepo.create({
        ownerId,
        courseId: input.course_id,
        kind: input.kind,
        requiredPct: input.required_pct,
        initialAttended: input.initial_attended,
        initialConducted: input.initial_conducted,
      });
      return toRow(record);
    }
    const { data, error } = await supabase
      .from("course_components")
      .insert({ ...input, user_id: ownerId })
      .select()
      .single();
    if (error) throw toFriendlyError(error);
    return data as ComponentRow;
  },
  async update(session: Session, id: string, patch: Partial<ComponentRow>) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      const dbPatch: Partial<GuestCourseComponent> = {};
      if (patch.kind !== undefined) dbPatch.kind = patch.kind;
      if (patch.required_pct !== undefined) dbPatch.requiredPct = patch.required_pct;
      if (patch.initial_attended !== undefined) dbPatch.initialAttended = patch.initial_attended;
      if (patch.initial_conducted !== undefined) dbPatch.initialConducted = patch.initial_conducted;
      await courseComponentsRepo.update(id, dbPatch);
      return;
    }
    const { error } = await supabase.from("course_components").update(patch).eq("id", id);
    if (error) throw toFriendlyError(error);
  },
  async delete(session: Session, id: string) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await courseComponentsRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("course_components").delete().eq("id", id);
    if (error) throw toFriendlyError(error);
  },
};