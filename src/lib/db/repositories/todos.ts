import { v4 as uuid } from "uuid";
import { STORE, type GuestTodo } from "../schema";
import { now, withDB } from "./base";

export const todosRepo = {
  async list(ownerId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.todos, "byOwner", ownerId);
      return all.sort((a, b) => a.position - b.position);
    });
  },
  async create(
    input: Omit<GuestTodo, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestTodo = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.todos, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestTodo>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.todos, id);
      if (!existing) return null;
      const next: GuestTodo = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.todos, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.todos, id));
  },
};