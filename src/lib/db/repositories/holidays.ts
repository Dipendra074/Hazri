import { v4 as uuid } from "uuid";
import { STORE, type GuestHoliday } from "../schema";
import { now, withDB } from "./base";

export const holidaysRepo = {
  async list(ownerId: string) {
    return withDB((db) => db.getAllFromIndex(STORE.holidays, "byOwner", ownerId));
  },
  async getForDate(ownerId: string, date: string) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.holidays,
        "byOwnerDate",
        [ownerId, date] as [string, string],
      ),
    );
  },
  async create(input: Omit<GuestHoliday, "id" | "createdAt" | "updatedAt">) {
    const record: GuestHoliday = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.holidays, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestHoliday>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.holidays, id);
      if (!existing) return null;
      const next: GuestHoliday = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.holidays, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.holidays, id));
  },
};