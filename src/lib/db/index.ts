/**
 * Hazri IndexedDB bootstrap.
 *
 * Phase 2: opens the DB, runs forward-only migrations, exposes a singleton
 * `getDB()` and typed helpers. No UI wires into this yet.
 */

import { openDB, type IDBPDatabase } from "idb";
import {
  DB_NAME,
  DB_VERSION,
  STORE,
  type HazriDB,
} from "./schema";

let dbPromise: Promise<IDBPDatabase<HazriDB>> | null = null;

function isBrowser() {
  return typeof indexedDB !== "undefined";
}

export function getDB(): Promise<IDBPDatabase<HazriDB>> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<HazriDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Forward-only ladder. Each `if` is one released version.
        if (oldVersion < 1) {
          db.createObjectStore(STORE.meta, { keyPath: "key" });
          db.createObjectStore(STORE.profile, { keyPath: "id" });

          const subjects = db.createObjectStore(STORE.subjects, { keyPath: "id" });
          subjects.createIndex("byOwner", "ownerId");
          // archived stored as 0/1 via keyPath doesn't work with boolean; use separate mapping if needed

          const logs = db.createObjectStore(STORE.attendanceLogs, { keyPath: "id" });
          logs.createIndex("byOwner", "ownerId");
          logs.createIndex("bySubject", "subjectId");
          logs.createIndex("byOwnerSubjectDate", ["ownerId", "subjectId", "date"]);

          const routine = db.createObjectStore(STORE.routineSlots, { keyPath: "id" });
          routine.createIndex("byOwner", "ownerId");
          routine.createIndex("byOwnerWeekday", ["ownerId", "weekday"]);

          const projects = db.createObjectStore(STORE.projects, { keyPath: "id" });
          projects.createIndex("byOwner", "ownerId");

          const tasks = db.createObjectStore(STORE.projectTasks, { keyPath: "id" });
          tasks.createIndex("byOwner", "ownerId");
          tasks.createIndex("byProject", "projectId");

          const todos = db.createObjectStore(STORE.todos, { keyPath: "id" });
          todos.createIndex("byOwner", "ownerId");

          const images = db.createObjectStore(STORE.images, { keyPath: "id" });
          images.createIndex("byOwner", "ownerId");
          images.createIndex("byOwnerKind", ["ownerId", "kind"]);

          const settings = db.createObjectStore(STORE.settings, { keyPath: "key" });
          settings.createIndex("byOwner", "ownerId");
        }

        if (oldVersion < 2) {
          const courses = db.createObjectStore(STORE.courses, { keyPath: "id" });
          courses.createIndex("byOwner", "ownerId");

          const comps = db.createObjectStore(STORE.courseComponents, { keyPath: "id" });
          comps.createIndex("byOwner", "ownerId");
          comps.createIndex("byCourse", "courseId");

          const sched = db.createObjectStore(STORE.scheduleEntries, { keyPath: "id" });
          sched.createIndex("byOwner", "ownerId");
          sched.createIndex("byOwnerWeekday", ["ownerId", "weekday"]);

          const events = db.createObjectStore(STORE.attendanceEvents, { keyPath: "id" });
          events.createIndex("byOwner", "ownerId");
          events.createIndex("byOwnerDate", ["ownerId", "date"]);
          events.createIndex("byComponent", "componentId");
          events.createIndex("bySlotDate", ["scheduleEntryId", "date"]);

          const holidays = db.createObjectStore(STORE.holidays, { keyPath: "id" });
          holidays.createIndex("byOwner", "ownerId");
          holidays.createIndex("byOwnerDate", ["ownerId", "date"]);
        }

        if (oldVersion < 3) {
          // No structural change — new optional fields on attendance_events
          // are absorbed by the existing store. Version bump ensures the
          // upgrade path runs and older records default new fields at read.
        }
      },
      blocked() {
        console.warn("[hazri-db] upgrade blocked by another tab");
      },
      blocking() {
        console.warn("[hazri-db] another tab requested an upgrade; closing");
      },
      terminated() {
        console.warn("[hazri-db] connection terminated; will reopen on next use");
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Test-only helper: wipe every store. Never call from app code. */
export async function __resetHazriDB() {
  const db = await getDB();
  const stores = [
    STORE.meta,
    STORE.profile,
    STORE.subjects,
    STORE.attendanceLogs,
    STORE.routineSlots,
    STORE.projects,
    STORE.projectTasks,
    STORE.todos,
    STORE.images,
    STORE.settings,
    STORE.courses,
    STORE.courseComponents,
    STORE.scheduleEntries,
    STORE.attendanceEvents,
    STORE.holidays,
  ] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}