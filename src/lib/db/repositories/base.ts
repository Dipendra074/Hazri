/**
 * Shared repository helpers. Each concrete repository wraps one store and
 * scopes reads/writes by `ownerId` (the guest session id).
 */

import type { IDBPDatabase, StoreNames } from "idb";
import { getDB } from "../index";
import type { HazriDB } from "../schema";

export function now() {
  return Date.now();
}

export async function withDB<T>(
  fn: (db: IDBPDatabase<HazriDB>) => Promise<T>,
): Promise<T> {
  const db = await getDB();
  return fn(db);
}

export type OwnedStoreName = Extract<
  StoreNames<HazriDB>,
  | "subjects"
   | "attendance_logs"
   | "routine_slots"
   | "projects"
   | "project_tasks"
   | "todos"
   | "images"
   | "settings"
>;