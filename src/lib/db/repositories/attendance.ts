import { v4 as uuid } from "uuid";
import { STORE, type GuestAttendanceLog } from "../schema";
import { now, withDB } from "./base";

export const attendanceRepo = {
  async list(ownerId: string) {
    return withDB((db) =>
      db.getAllFromIndex(STORE.attendanceLogs, "byOwner", ownerId),
    );
  },
  async listForSubject(ownerId: string, subjectId: string) {
    return withDB(async (db) => {
      const all = await db.getAllFromIndex(STORE.attendanceLogs, "bySubject", subjectId);
      return all.filter((l) => l.ownerId === ownerId);
    });
  },
  async listForDate(ownerId: string, subjectId: string, date: string) {
    return withDB((db) =>
      db.getAllFromIndex(
        STORE.attendanceLogs,
        "byOwnerSubjectDate",
        [ownerId, subjectId, date] as [string, string, string],
      ),
    );
  },
  async create(
    input: Omit<GuestAttendanceLog, "id" | "createdAt">,
  ) {
    const record: GuestAttendanceLog = {
      ...input,
      id: uuid(),
      createdAt: now(),
    };
    await withDB((db) => db.put(STORE.attendanceLogs, record));
    return record;
  },
  async update(id: string, patch: Partial<GuestAttendanceLog>) {
    return withDB(async (db) => {
      const existing = await db.get(STORE.attendanceLogs, id);
      if (!existing) return null;
      const next: GuestAttendanceLog = { ...existing, ...patch, id };
      await db.put(STORE.attendanceLogs, next);
      return next;
    });
  },
  async delete(id: string) {
    await withDB((db) => db.delete(STORE.attendanceLogs, id));
  },
  async deleteForSubject(ownerId: string, subjectId: string) {
    await withDB(async (db) => {
      const all = await db.getAllFromIndex(
        STORE.attendanceLogs,
        "bySubject",
        subjectId,
      );
      const tx = db.transaction(STORE.attendanceLogs, "readwrite");
      await Promise.all(
        all
          .filter((l) => l.ownerId === ownerId)
          .map((l) => tx.store.delete(l.id)),
      );
      await tx.done;
    });
  },
};