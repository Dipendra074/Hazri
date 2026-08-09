import { v4 as uuid } from "uuid";
import { STORE, type GuestProject } from "../schema";
import { now, withDB } from "./base";

export const projectsRepo = {
  async list(ownerId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.projects, "byOwner", ownerId);
      return all.sort((a, b) => b.createdAt - a.createdAt);
    });
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.projects, id));
  },
  async create(
    input: Omit<GuestProject, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestProject = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.projects, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestProject>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.projects, id);
      if (!existing) return null;
      const next: GuestProject = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.projects, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.projects, id));
  },
};