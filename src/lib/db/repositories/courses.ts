import { v4 as uuid } from "uuid";
import { STORE, type GuestCourse } from "../schema";
import { now, withDB } from "./base";

export const coursesRepo = {
  async list(ownerId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.courses, "byOwner", ownerId);
      return all
        .filter((c) => !c.archived)
        .sort((a, b) => a.createdAt - b.createdAt);
    });
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.courses, id));
  },
  async create(
    input: Omit<GuestCourse, "id" | "createdAt" | "updatedAt" | "archived"> &
      Partial<Pick<GuestCourse, "archived">>,
  ) {
    const record: GuestCourse = {
      ...input,
      id: uuid(),
      archived: input.archived ?? false,
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.courses, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestCourse>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.courses, id);
      if (!existing) return null;
      const next: GuestCourse = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.courses, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.courses, id));
  },
};