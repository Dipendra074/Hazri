import { v4 as uuid } from "uuid";
import { STORE, type GuestSubject } from "../schema";
import { now, withDB } from "./base";

export const subjectsRepo = {
  async list(ownerId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.subjects, "byOwner", ownerId);
      return all
        .filter((s) => !s.archived)
        .sort((a, b) => a.createdAt - b.createdAt);
    });
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.subjects, id));
  },
  async create(
    input: Omit<GuestSubject, "id" | "createdAt" | "updatedAt" | "archived"> &
      Partial<Pick<GuestSubject, "archived">>,
  ) {
    const record: GuestSubject = {
      ...input,
      id: uuid(),
      archived: input.archived ?? false,
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.subjects, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestSubject>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.subjects, id);
      if (!existing) return null;
      const next: GuestSubject = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.subjects, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.subjects, id));
  },
};