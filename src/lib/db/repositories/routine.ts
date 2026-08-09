import { v4 as uuid } from "uuid";
import { STORE, type GuestRoutineSlot } from "../schema";
import { now, withDB } from "./base";

export const routineRepo = {
  async list(ownerId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.routineSlots, "byOwner", ownerId);
      return all.sort((a, b) =>
        a.weekday === b.weekday ? a.startMinute - b.startMinute : a.weekday - b.weekday,
      );
    });
  },
  async listForWeekday(ownerId: string, weekday: number) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.routineSlots,
        "byOwnerWeekday",
        [ownerId, weekday] as [string, number],
      ),
    );
  },
  async create(
    input: Omit<GuestRoutineSlot, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestRoutineSlot = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.routineSlots, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestRoutineSlot>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.routineSlots, id);
      if (!existing) return null;
      const next: GuestRoutineSlot = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.routineSlots, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.routineSlots, id));
  },
};