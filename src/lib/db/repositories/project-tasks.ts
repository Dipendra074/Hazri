import { v4 as uuid } from "uuid";
import { STORE, type GuestProjectTask } from "../schema";
import { now, withDB } from "./base";

export const projectTasksRepo = {
  async listForProject(projectId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.projectTasks, "byProject", projectId);
      return all.sort((a, b) => a.position - b.position);
    });
  },
  async listForOwner(ownerId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.projectTasks, "byOwner", ownerId),
    );
  },
  async create(
    input: Omit<GuestProjectTask, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestProjectTask = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.projectTasks, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestProjectTask>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.projectTasks, id);
      if (!existing) return null;
      const next: GuestProjectTask = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.projectTasks, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.projectTasks, id));
  },
  async deleteForProject(projectId: string) {
    await withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.projectTasks, "byProject", projectId);
      const tx = db.transaction(STORE.projectTasks, "readwrite");
      await Promise.all(all.map((t) => tx.store.delete(t.id)));
      await tx.done;
    });
  },
};