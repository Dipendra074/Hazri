import { v4 as uuid } from "uuid";
import { STORE, type GuestScheduleEntry } from "../schema";
import { now, withDB } from "./base";

export const scheduleEntriesRepo = {
  async list(ownerId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.scheduleEntries, "byOwner", ownerId),
    );
  },
  async listForDay(ownerId: string, weekday: number) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.scheduleEntries,
        "byOwnerWeekday",
        [ownerId, weekday] as [string, number],
      ),
    );
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.scheduleEntries, id));
  },
  async create(
    input: Omit<GuestScheduleEntry, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestScheduleEntry = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.scheduleEntries, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestScheduleEntry>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.scheduleEntries, id);
      if (!existing) return null;
      const next: GuestScheduleEntry = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.scheduleEntries, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.scheduleEntries, id));
  },
};