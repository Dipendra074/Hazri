import { supabase } from "@/integrations/supabase/client";
import { coursesRepo } from "@/lib/db/repositories";
import type { GuestCourse } from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import { assertCloudReachable, requireOwnerId, toFriendlyError } from "@/lib/data/cloud";

export type CourseRow = {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  icon: string | null;
  target_pct: number;
  has_theory: boolean;
  has_lab: boolean;
  has_tutorial: boolean;
  default_lab_units: number;
  archived: boolean;
};

function toRow(c: GuestCourse): CourseRow {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    color: c.color,
    icon: c.icon,
    target_pct: c.targetPct,
    has_theory: c.hasTheory,
    has_lab: c.hasLab,
    has_tutorial: c.hasTutorial,
    default_lab_units: c.defaultLabUnits,
    archived: c.archived,
  };
}

function assertActive(s: Session) {
  if (s.mode === "none") throw new Error("No active session");
  return s.userId!;
}

export const coursesApi = {
  async list(session: Session): Promise<CourseRow[]> {
    if (session.mode === "guest") {
      const rows = await coursesRepo.list(session.userId);
      return rows.map(toRow);
    }
    assertActive(session);
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("archived", false)
      .order("created_at", { ascending: true });
    if (error) throw toFriendlyError(error, "courses.list");
    return (data ?? []) as CourseRow[];
  },
  async create(
    session: Session,
    input: Omit<CourseRow, "id" | "archived"> & { archived?: boolean },
  ) {
    assertCloudReachable(session);
    assertActive(session);
    const ownerId = await requireOwnerId(session);
    if (session.mode === "guest") {
      const record = await coursesRepo.create({
        ownerId,
        name: input.name,
        code: input.code,
        color: input.color,
        icon: input.icon,
        targetPct: input.target_pct,
        hasTheory: input.has_theory,
        hasLab: input.has_lab,
        hasTutorial: input.has_tutorial,
        defaultLabUnits: input.default_lab_units,
        archived: input.archived,
      });
      return toRow(record);
    }
    const { data, error } = await supabase
      .from("courses")
      .insert({ ...input, user_id: ownerId })
      .select()
      .maybeSingle();
    if (error) throw toFriendlyError(error, "courses.create");
    if (!data) {
      // Row was written but is not readable back (missing SELECT policy).
      // Surface it rather than pretending nothing happened.
      throw toFriendlyError(
        { message: "Insert returned no row", code: "PGRST116" },
        "courses.create",
      );
    }
    return data as CourseRow;
  },
  async update(session: Session, id: string, patch: Partial<CourseRow>) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      const dbPatch: Partial<GuestCourse> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.code !== undefined) dbPatch.code = patch.code;
      if (patch.color !== undefined) dbPatch.color = patch.color;
      if (patch.icon !== undefined) dbPatch.icon = patch.icon;
      if (patch.target_pct !== undefined) dbPatch.targetPct = patch.target_pct;
      if (patch.has_theory !== undefined) dbPatch.hasTheory = patch.has_theory;
      if (patch.has_lab !== undefined) dbPatch.hasLab = patch.has_lab;
      if (patch.has_tutorial !== undefined) dbPatch.hasTutorial = patch.has_tutorial;
      if (patch.default_lab_units !== undefined) dbPatch.defaultLabUnits = patch.default_lab_units;
      if (patch.archived !== undefined) dbPatch.archived = patch.archived;
      await coursesRepo.update(id, dbPatch);
      return;
    }
    const { error } = await supabase.from("courses").update(patch).eq("id", id);
    if (error) throw toFriendlyError(error, "courses.update");
  },
  async delete(session: Session, id: string) {
    assertCloudReachable(session);
    if (session.mode === "guest") {
      await coursesRepo.delete(id);
      return;
    }
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) throw toFriendlyError(error, "courses.delete");
  },
};