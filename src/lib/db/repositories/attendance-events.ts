import { v4 as uuid } from "uuid";
import { STORE, type GuestAttendanceEvent } from "../schema";
import { now, withDB } from "./base";

export const attendanceEventsRepo = {
  async list(ownerId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.attendanceEvents, "byOwner", ownerId),
    );
  },
  async listForDate(ownerId: string, date: string) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.attendanceEvents,
        "byOwnerDate",
        [ownerId, date] as [string, string],
      ),
    );
  },
  async listForComponent(componentId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.attendanceEvents, "byComponent", componentId),
    );
  },
  async getForSlot(scheduleEntryId: string, date: string) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.attendanceEvents,
        "bySlotDate",
        [scheduleEntryId, date] as [string, string],
      ),
    );
  },
  async get(id: string) {
    return withDB((db) => db.get(STORE.attendanceEvents, id));
  },
  async create(
    input: Omit<GuestAttendanceEvent, "id" | "createdAt" | "updatedAt">,
  ) {
    const record: GuestAttendanceEvent = {
      ...input,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    await withDB((db) => db.put(STORE.attendanceEvents, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestAttendanceEvent>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.attendanceEvents, id);
      if (!existing) return null;
      const next: GuestAttendanceEvent = { ...existing, ...patch, id, updatedAt: now() };
      await db.put(STORE.attendanceEvents, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.attendanceEvents, id));
  },
};