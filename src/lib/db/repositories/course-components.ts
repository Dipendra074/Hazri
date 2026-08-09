import { v4 as uuid } from "uuid";
import { STORE, type GuestCourseComponent } from "../schema";
import { now, withDB } from "./base";

export const courseComponentsRepo = {
  async list(ownerId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.courseComponents, "byOwner", ownerId),
    );
  },
  async listForCourse(courseId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.courseComponents, "byCourse", courseId),
    );
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.courseComponents, id));
  },
  async create(
    input: Omit<GuestCourseComponent, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestCourseComponent = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.courseComponents, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestCourseComponent>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.courseComponents, id);
      if (!existing) return null;
      const next: GuestCourseComponent = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.courseComponents, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.courseComponents, id));
  },
};