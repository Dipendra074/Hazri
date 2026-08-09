/**
 * IndexedDB schema for Hazri guest / local-first mode.
 *
 * Phase 2: schema + types only. Nothing here is wired into the UI yet;
 * repositories in `./repositories/*` consume these types.
 *
 * Rules:
 * - Forward-only migrations. Never drop a store or a keyPath.
 * - Every record carries an `ownerId` (guest user id) so a single DB can
 *   host multiple guest identities on the same device if we ever need it.
 * - Blobs live in the `images` store; other stores never embed binary data.
 */

import type { DBSchema } from "idb";

export const DB_NAME = "hazri";
export const DB_VERSION = 3;

export type ImageKind = "avatar" | "timetable";

export interface MetaRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface GuestProfile {
  id: string; // === ownerId
  displayName: string;
  avatarImageId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GuestSubject {
  id: string;
  ownerId: string;
  name: string;
  color: string;
  requiredPct: number;
  initialAttended: number;
  initialMissed: number;
  hasLab: boolean;
  labRequiredPct: number | null;
  labInitialAttended: number;
  labInitialMissed: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GuestAttendanceLog {
  id: string;
  ownerId: string;
  subjectId: string;
  date: string; // YYYY-MM-DD (local)
  kind: "lecture" | "lab";
  status: "present" | "absent" | "holiday";
  source: string;
  createdAt: number;
}

export interface GuestRoutineSlot {
  id: string;
  ownerId: string;
  subjectId: string | null;
  label: string | null;
  weekday: number; // 0..6, Sunday-first
  startMinute: number;
  endMinute: number;
  kind: "lecture" | "lab";
  createdAt: number;
  updatedAt: number;
}

/** A section inside a project (e.g. Planning, Design). Stored inline on the project. */
export interface GuestProjectCategory {
  id: string;
  name: string;
  position: number;
}

export interface GuestProject {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  color: string | null;
  status: "active" | "archived" | "done";
  dueAt: string | null; // YYYY-MM-DD
  /** Optional — absent on records written before project categories shipped. */
  categories?: GuestProjectCategory[];
  createdAt: number;
  updatedAt: number;
}

export interface GuestProjectTask {
  id: string;
  ownerId: string;
  projectId: string;
  /** Optional — null/undefined means the task is not filed under a category. */
  categoryId?: string | null;
  title: string;
  done: boolean;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuestTodo {
  id: string;
  ownerId: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuestImage {
  id: string;
  ownerId: string;
  kind: ImageKind;
  blob: Blob;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface GuestSetting {
  key: string; // e.g. `${ownerId}:theme`
  ownerId: string;
  value: unknown;
  updatedAt: number;
}

// ── Phase 1: schedule-based attendance model ──────────────────────────────

export type ComponentKind = "theory" | "lab" | "tutorial";
export type EventStatus =
  | "attended"
  | "missed"
  | "cancelled"
  | "pending"
  | "extra"
  | "credit";
export type EventType = "class" | "credit";

export interface GuestCourse {
  id: string;
  ownerId: string;
  name: string;
  code: string | null;
  color: string | null;
  icon: string | null;
  targetPct: number;
  hasTheory: boolean;
  hasLab: boolean;
  hasTutorial: boolean;
  defaultLabUnits: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GuestCourseComponent {
  id: string;
  ownerId: string;
  courseId: string;
  kind: ComponentKind;
  requiredPct: number;
  initialAttended: number;
  initialConducted: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuestScheduleEntry {
  id: string;
  ownerId: string;
  componentId: string;
  weekday: number; // 0..6 Sun-first
  startMinute: number;
  endMinute: number;
  units: number;
  position: number;
  createdAt: number;
  updatedAt: number;
}

export interface GuestAttendanceEvent {
  id: string;
  ownerId: string;
  componentId: string;
  scheduleEntryId: string | null;
  date: string; // YYYY-MM-DD
  status: EventStatus;
  units: number;
  source: string;
  note: string | null;
  eventType: EventType;
  creditCountsAsConducted: boolean;
  startMinute: number | null;
  endMinute: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface GuestHoliday {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  label: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HazriDB extends DBSchema {
  meta: {
    key: string;
    value: MetaRecord;
  };
  profile: {
    key: string;
    value: GuestProfile;
  };
  subjects: {
    key: string;
    value: GuestSubject;
    indexes: { byOwner: string; byOwnerArchived: [string, number] };
  };
  attendance_logs: {
    key: string;
    value: GuestAttendanceLog;
    indexes: {
      byOwner: string;
      bySubject: string;
      byOwnerSubjectDate: [string, string, string];
    };
  };
  routine_slots: {
    key: string;
    value: GuestRoutineSlot;
    indexes: { byOwner: string; byOwnerWeekday: [string, number] };
  };
  projects: {
    key: string;
    value: GuestProject;
    indexes: { byOwner: string };
  };
  project_tasks: {
    key: string;
    value: GuestProjectTask;
    indexes: { byOwner: string; byProject: string };
  };
  todos: {
    key: string;
    value: GuestTodo;
    indexes: { byOwner: string };
  };
  images: {
    key: string;
    value: GuestImage;
    indexes: { byOwner: string; byOwnerKind: [string, ImageKind] };
  };
  settings: {
    key: string;
    value: GuestSetting;
    indexes: { byOwner: string };
  };
  courses: {
    key: string;
    value: GuestCourse;
    indexes: { byOwner: string };
  };
  course_components: {
    key: string;
    value: GuestCourseComponent;
    indexes: { byOwner: string; byCourse: string };
  };
  schedule_entries: {
    key: string;
    value: GuestScheduleEntry;
    indexes: { byOwner: string; byOwnerWeekday: [string, number] };
  };
  attendance_events: {
    key: string;
    value: GuestAttendanceEvent;
    indexes: {
      byOwner: string;
      byOwnerDate: [string, string];
      byComponent: string;
      bySlotDate: [string, string];
    };
  };
  holidays: {
    key: string;
    value: GuestHoliday;
    indexes: { byOwner: string; byOwnerDate: [string, string] };
  };
}

export const STORE = {
  meta: "meta",
  profile: "profile",
  subjects: "subjects",
  attendanceLogs: "attendance_logs",
  routineSlots: "routine_slots",
  projects: "projects",
  projectTasks: "project_tasks",
  todos: "todos",
  images: "images",
  settings: "settings",
  courses: "courses",
  courseComponents: "course_components",
  scheduleEntries: "schedule_entries",
  attendanceEvents: "attendance_events",
  holidays: "holidays",
} as const;