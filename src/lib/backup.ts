/**
 * Hazri guest backup + restore.
 *
 * File formats
 * ------------
 * Preferred output:  `Hazri-Backup-YYYY-MM-DD[-HHMM].hazri`
 *   → gzip-compressed UTF-8 JSON (via CompressionStream("gzip")).
 * Fallback output:   `Hazri-Backup-YYYY-MM-DD.json`
 *   → plain JSON when CompressionStream is unavailable.
 *
 * Import auto-detects gzip vs JSON by magic bytes and accepts legacy
 * v1 / v2 JSON backups produced by earlier Hazri versions.
 *
 * Envelope (formatVersion 2):
 *   { format:"hazri-backup", formatVersion:2, databaseName:"hazri",
 *     databaseVersion:3, appVersion, exportedAt, backupId, ownerId,
 *     checksum:"sha256:<hex>", counts:{...}, data:{...}, images:[...] }
 *
 * Import modes
 * ------------
 *   Replace — destructive; snapshots current data in-memory first and
 *             rolls back automatically on failure.
 *   Merge   — id-conflict → keep current row; non-conflicting rows added;
 *             rows with dangling foreign keys dropped and counted.
 *
 * Everything runs entirely offline against IndexedDB. No Supabase, no
 * network, no service-worker cache changes, no auth tokens.
 */

import { getDB } from "@/lib/db";
import { STORE, DB_NAME, DB_VERSION, type HazriDB } from "@/lib/db/schema";
import { revokeAllImageUrls } from "@/lib/images";
import { isAndroidApp } from "@/lib/platform";
import type { StoreNames } from "idb";

export const BACKUP_FORMAT = "hazri-backup";
export const CURRENT_FORMAT_VERSION = 2;
export const APP_VERSION =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env
      ?.VITE_APP_VERSION) ||
  "dev";

type OwnedStore = Extract<
  StoreNames<HazriDB>,
  | "subjects"
  | "attendance_logs"
  | "routine_slots"
  | "projects"
  | "project_tasks"
  | "todos"
  | "settings"
  | "courses"
  | "course_components"
  | "schedule_entries"
  | "attendance_events"
  | "holidays"
>;

const OWNED_STORES: readonly OwnedStore[] = [
  STORE.subjects,
  STORE.attendanceLogs,
  STORE.routineSlots,
  STORE.projects,
  STORE.projectTasks,
  STORE.todos,
  STORE.settings,
  STORE.courses,
  STORE.courseComponents,
  STORE.scheduleEntries,
  STORE.attendanceEvents,
  STORE.holidays,
] as const;

/** Stores that hold live user data (excludes the legacy trio below). */
const LIVE_DATA_STORES: readonly OwnedStore[] = [
  STORE.courses,
  STORE.courseComponents,
  STORE.scheduleEntries,
  STORE.attendanceEvents,
  STORE.holidays,
  STORE.projects,
  STORE.projectTasks,
  STORE.todos,
];

export interface BackupCounts {
  subjects: number;
  attendanceLogs: number;
  routineSlots: number;
  projects: number;
  projectTasks: number;
  todos: number;
  settings: number;
  courses: number;
  courseComponents: number;
  scheduleEntries: number;
  attendanceEvents: number;
  holidays: number;
  images: number;
}

export interface BackupImage {
  id: string;
  ownerId: string;
  kind: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: number;
  dataBase64: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  databaseName: string;
  databaseVersion: number;
  appVersion: string;
  exportedAt: string;
  backupId: string;
  ownerId: string;
  checksum?: string;
  counts: BackupCounts;
  data: {
    profile: unknown;
    settings: unknown[];
    courses: unknown[];
    course_components: unknown[];
    schedule_entries: unknown[];
    holidays: unknown[];
    attendance_events: unknown[];
    projects: unknown[];
    project_tasks: unknown[];
    todos: unknown[];
    // Legacy stores. Exported only when the user still has rows here.
    subjects: unknown[];
    attendance_logs: unknown[];
    routine_slots: unknown[];
  };
  images: BackupImage[];
}

/* -------------------------------------------------------------------------- */
/* base64 helpers                                                             */
/* -------------------------------------------------------------------------- */

function bytesToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000;
  let s = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    s += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* -------------------------------------------------------------------------- */
/* gzip helpers (feature-detected)                                            */
/* -------------------------------------------------------------------------- */

export function isCompressionSupported(): boolean {
  return (
    typeof (globalThis as unknown as { CompressionStream?: unknown })
      .CompressionStream === "function"
  );
}

async function gzipEncode(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new (globalThis as unknown as {
    CompressionStream: new (fmt: string) => TransformStream<Uint8Array, Uint8Array>;
  }).CompressionStream("gzip");
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecode(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as unknown as {
    DecompressionStream: new (
      fmt: string,
    ) => TransformStream<Uint8Array, Uint8Array>;
  }).DecompressionStream("gzip");
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/* -------------------------------------------------------------------------- */
/* checksum                                                                   */
/* -------------------------------------------------------------------------- */

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable, dependency-free canonical JSON for checksum. Sorts object keys. */
function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalJson((v as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

async function computeChecksum(
  data: BackupFile["data"],
  images: BackupImage[],
): Promise<string> {
  const hex = await sha256Hex(canonicalJson({ data, images }));
  return `sha256:${hex}`;
}

/* -------------------------------------------------------------------------- */
/* export                                                                     */
/* -------------------------------------------------------------------------- */

export async function detectHasLocalData(ownerId: string): Promise<boolean> {
  const db = await getDB();
  for (const store of LIVE_DATA_STORES) {
    const key = await db
      .transaction(store)
      .store.index("byOwner")
      .getKey(ownerId);
    if (key !== undefined) return true;
  }
  const profile = await db.get(STORE.profile, ownerId);
  return !!profile;
}

export async function exportGuestBackup(ownerId: string): Promise<BackupFile> {
  const db = await getDB();

  const profile = await db.get(STORE.profile, ownerId);

  async function listOwned<T>(store: OwnedStore): Promise<T[]> {
    return (await db.getAllFromIndex(store, "byOwner", ownerId)) as T[];
  }

  const [
    subjects,
    logs,
    routine,
    projects,
    tasks,
    todos,
    settings,
    courses,
    courseComponents,
    scheduleEntries,
    attendanceEvents,
    holidays,
    images,
  ] = await Promise.all([
    listOwned(STORE.subjects),
    listOwned(STORE.attendanceLogs),
    listOwned(STORE.routineSlots),
    listOwned(STORE.projects),
    listOwned(STORE.projectTasks),
    listOwned(STORE.todos),
    listOwned(STORE.settings),
    listOwned(STORE.courses),
    listOwned(STORE.courseComponents),
    listOwned(STORE.scheduleEntries),
    listOwned(STORE.attendanceEvents),
    listOwned(STORE.holidays),
    db.getAllFromIndex(STORE.images, "byOwner", ownerId),
  ]);

  const encodedImages: BackupImage[] = [];
  for (const img of images) {
    encodedImages.push({
      id: img.id,
      ownerId: img.ownerId,
      kind: img.kind,
      mime: img.mime,
      size: img.size,
      width: img.width,
      height: img.height,
      createdAt: img.createdAt,
      dataBase64: await blobToBase64(img.blob),
    });
  }

  const data: BackupFile["data"] = {
    profile: profile ?? null,
    settings,
    courses,
    course_components: courseComponents,
    schedule_entries: scheduleEntries,
    holidays,
    attendance_events: attendanceEvents,
    projects,
    project_tasks: tasks,
    todos,
    subjects,
    attendance_logs: logs,
    routine_slots: routine,
  };

  const counts: BackupCounts = {
    subjects: subjects.length,
    attendanceLogs: logs.length,
    routineSlots: routine.length,
    projects: projects.length,
    projectTasks: tasks.length,
    todos: todos.length,
    settings: settings.length,
    courses: courses.length,
    courseComponents: courseComponents.length,
    scheduleEntries: scheduleEntries.length,
    attendanceEvents: attendanceEvents.length,
    holidays: holidays.length,
    images: encodedImages.length,
  };

  const checksum = await computeChecksum(data, encodedImages);

  return {
    format: BACKUP_FORMAT,
    formatVersion: CURRENT_FORMAT_VERSION,
    databaseName: DB_NAME,
    databaseVersion: DB_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    backupId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ownerId,
    checksum,
    counts,
    data,
    images: encodedImages,
  };
}

function stamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export async function downloadGuestBackup(ownerId: string): Promise<string> {
  const backup = await exportGuestBackup(ownerId);
  const json = JSON.stringify(backup);
  const useGzip = isCompressionSupported();
  const filename = useGzip
    ? `Hazri-Backup-${stamp()}.hazri`
    : `Hazri-Backup-${stamp()}.json`;
  const body = useGzip
    ? new Uint8Array(await gzipEncode(new TextEncoder().encode(json)))
    : json;
  const mime = useGzip ? "application/gzip" : "application/json";

  if (isAndroidApp()) {
    const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const result = await Filesystem.writeFile({
      path: "Hazri/" + filename,
      data: typeof body === "string" ? body : bytesToBase64(body),
      directory: Directory.Cache,
      recursive: true,
      ...(typeof body === "string" ? { encoding: Encoding.UTF8 } : {}),
    });
    await Share.share({
      title: "Hazri backup",
      text: "Save this Hazri backup somewhere safe.",
      files: [result.uri],
      dialogTitle: "Save or share Hazri backup",
    });
    return filename;
  }

  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

/* -------------------------------------------------------------------------- */
/* validate + parse                                                           */
/* -------------------------------------------------------------------------- */

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Accepts:
 *  - v1/v2 legacy shape: { format, version, data:{...}, images, ownerId }
 *  - v2 current shape:   { format, formatVersion, ..., data:{...}, images }
 * Normalizes to a full BackupFile with defaults filled in.
 */
function normalizeAndValidate(parsed: unknown): BackupFile {
  if (!isRecord(parsed)) throw new BackupValidationError("Backup must be an object.");
  if (parsed.format !== BACKUP_FORMAT) {
    throw new BackupValidationError("Not a Hazri backup file.");
  }

  const legacyVersion =
    typeof parsed.version === "number" ? parsed.version : undefined;
  const rawFormatVersion =
    typeof parsed.formatVersion === "number"
      ? parsed.formatVersion
      : legacyVersion !== undefined
        ? 1
        : undefined;
  if (rawFormatVersion === undefined) {
    throw new BackupValidationError("Backup is missing formatVersion.");
  }
  if (rawFormatVersion > CURRENT_FORMAT_VERSION) {
    throw new BackupValidationError(
      "This backup was created by a newer version of Hazri. Update Hazri before importing it.",
    );
  }
  if (rawFormatVersion < 1) {
    throw new BackupValidationError(
      `Unsupported backup formatVersion ${rawFormatVersion}.`,
    );
  }

  if (typeof parsed.ownerId !== "string" || !parsed.ownerId) {
    throw new BackupValidationError("Backup is missing ownerId.");
  }

  const data = parsed.data;
  if (!isRecord(data)) throw new BackupValidationError("Backup data is missing.");

  const arrayKeys = [
    "subjects",
    "attendance_logs",
    "routine_slots",
    "projects",
    "project_tasks",
    "todos",
    "settings",
    "courses",
    "course_components",
    "schedule_entries",
    "attendance_events",
    "holidays",
  ] as const;
  for (const key of arrayKeys) {
    if (data[key] === undefined) data[key] = [];
    else if (!Array.isArray(data[key])) {
      throw new BackupValidationError(`Backup data.${key} must be an array.`);
    }
  }

  if (!Array.isArray(parsed.images)) {
    throw new BackupValidationError("Backup images must be an array.");
  }
  for (const img of parsed.images as unknown[]) {
    if (
      !isRecord(img) ||
      typeof img.id !== "string" ||
      typeof img.mime !== "string" ||
      typeof img.dataBase64 !== "string"
    ) {
      throw new BackupValidationError("An image entry is malformed.");
    }
  }

  const dbName =
    typeof parsed.databaseName === "string" ? parsed.databaseName : DB_NAME;
  if (dbName !== DB_NAME) {
    throw new BackupValidationError(`Unexpected databaseName '${dbName}'.`);
  }
  const dbVersion =
    typeof parsed.databaseVersion === "number"
      ? parsed.databaseVersion
      : DB_VERSION;
  if (dbVersion > DB_VERSION) {
    throw new BackupValidationError(
      "This backup was created by a newer database version of Hazri. Update Hazri before importing it.",
    );
  }

  const counts: BackupCounts = {
    subjects: (data.subjects as unknown[]).length,
    attendanceLogs: (data.attendance_logs as unknown[]).length,
    routineSlots: (data.routine_slots as unknown[]).length,
    projects: (data.projects as unknown[]).length,
    projectTasks: (data.project_tasks as unknown[]).length,
    todos: (data.todos as unknown[]).length,
    settings: (data.settings as unknown[]).length,
    courses: (data.courses as unknown[]).length,
    courseComponents: (data.course_components as unknown[]).length,
    scheduleEntries: (data.schedule_entries as unknown[]).length,
    attendanceEvents: (data.attendance_events as unknown[]).length,
    holidays: (data.holidays as unknown[]).length,
    images: (parsed.images as unknown[]).length,
  };

  const envelope: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: rawFormatVersion,
    databaseName: dbName,
    databaseVersion: dbVersion,
    appVersion:
      typeof parsed.appVersion === "string" ? parsed.appVersion : "unknown",
    exportedAt:
      typeof parsed.exportedAt === "string"
        ? parsed.exportedAt
        : new Date(0).toISOString(),
    backupId: typeof parsed.backupId === "string" ? parsed.backupId : "",
    ownerId: parsed.ownerId,
    checksum: typeof parsed.checksum === "string" ? parsed.checksum : undefined,
    counts,
    data: data as BackupFile["data"],
    images: parsed.images as BackupImage[],
  };

  return envelope;
}

/**
 * Read a chosen File, decompress if gzip, parse JSON, validate structure,
 * verify checksum when present. Throws BackupValidationError on any problem;
 * the caller is guaranteed IndexedDB is untouched.
 */
export async function readBackupFile(file: File): Promise<BackupFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let jsonText: string;
  if (isGzip(bytes)) {
    if (!isCompressionSupported()) {
      throw new BackupValidationError(
        "This browser cannot open compressed .hazri backups.",
      );
    }
    try {
      const decoded = await gzipDecode(bytes);
      jsonText = new TextDecoder().decode(decoded);
    } catch {
      throw new BackupValidationError("Backup file is corrupted (gzip).");
    }
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new BackupValidationError("File is not valid JSON.");
  }
  const envelope = normalizeAndValidate(parsed);

  if (envelope.checksum) {
    const expected = await computeChecksum(envelope.data, envelope.images);
    if (expected !== envelope.checksum) {
      throw new BackupValidationError(
        "Backup checksum does not match — file may be corrupted or tampered with.",
      );
    }
  }
  return envelope;
}

export function parseAndValidateBackup(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupValidationError("File is not valid JSON.");
  }
  return normalizeAndValidate(parsed);
}

/** Parse JSON, validate its schema, and verify its content hash when present. */
export async function parseAndVerifyBackup(raw: string): Promise<BackupFile> {
  const envelope = parseAndValidateBackup(raw);
  if (envelope.checksum) {
    const expected = await computeChecksum(envelope.data, envelope.images);
    if (expected !== envelope.checksum) {
      throw new BackupValidationError(
        "Backup checksum does not match — file may be corrupted or tampered with.",
      );
    }
  }
  return envelope;
}

export function summarizeBackup(b: BackupFile) {
  return {
    exportedAt: b.exportedAt,
    appVersion: b.appVersion,
    formatVersion: b.formatVersion,
    ...b.counts,
  };
}

/* -------------------------------------------------------------------------- */
/* destructive replace (owner-scoped) + safety snapshot                        */
/* -------------------------------------------------------------------------- */

function reownRow<T extends { ownerId?: string }>(row: T, targetOwner: string): T {
  return { ...row, ownerId: targetOwner };
}

async function clearOwnerRows(ownerId: string): Promise<void> {
  const db = await getDB();
  await Promise.all(
    OWNED_STORES.map(async (name) => {
      const tx = db.transaction(name, "readwrite");
      const idx = tx.store.index("byOwner");
      let cursor = await idx.openCursor(ownerId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }),
  );
  {
    const tx = db.transaction(STORE.images, "readwrite");
    const idx = tx.store.index("byOwner");
    let cursor = await idx.openCursor(ownerId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
  await db.delete(STORE.profile, ownerId);
  revokeAllImageUrls();
}

async function writeBackupContents(
  backup: BackupFile,
  targetOwnerId: string,
): Promise<void> {
  const db = await getDB();

  const profile = backup.data.profile as
    | (Record<string, unknown> & { id?: string })
    | null;
  if (profile && isRecord(profile)) {
    await db.put(STORE.profile, { ...profile, id: targetOwnerId } as never);
  }

  const inserts: Array<[OwnedStore, unknown[]]> = [
    [STORE.subjects, backup.data.subjects],
    [STORE.attendanceLogs, backup.data.attendance_logs],
    [STORE.routineSlots, backup.data.routine_slots],
    [STORE.projects, backup.data.projects],
    [STORE.projectTasks, backup.data.project_tasks],
    [STORE.todos, backup.data.todos],
    [STORE.courses, backup.data.courses],
    [STORE.courseComponents, backup.data.course_components],
    [STORE.scheduleEntries, backup.data.schedule_entries],
    [STORE.attendanceEvents, backup.data.attendance_events],
    [STORE.holidays, backup.data.holidays],
  ];
  await Promise.all(
    inserts.map(async ([name, rows]) => {
      const tx = db.transaction(name, "readwrite");
      for (const row of rows) {
        if (isRecord(row)) {
          await tx.store.put(
            reownRow(row as { ownerId?: string }, targetOwnerId) as never,
          );
        }
      }
      await tx.done;
    }),
  );

  {
    const tx = db.transaction(STORE.settings, "readwrite");
    for (const row of backup.data.settings) {
      if (isRecord(row) && typeof row.key === "string") {
        const suffix = row.key.includes(":")
          ? row.key.split(":").slice(1).join(":")
          : row.key;
        await tx.store.put({
          ...row,
          ownerId: targetOwnerId,
          key: `${targetOwnerId}:${suffix}`,
        } as never);
      }
    }
    await tx.done;
  }

  {
    const tx = db.transaction(STORE.images, "readwrite");
    for (const img of backup.images) {
      const blob = base64ToBlob(img.dataBase64, img.mime);
      await tx.store.put({
        id: img.id,
        ownerId: targetOwnerId,
        kind: img.kind as "avatar" | "timetable",
        blob,
        mime: img.mime,
        size: img.size,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
      });
    }
    await tx.done;
  }
}

/**
 * Destructively replace all owner-scoped data with the backup contents.
 * Automatically snapshots the current data first and rolls back on failure.
 */
export async function replaceGuestBackup(
  backup: BackupFile,
  targetOwnerId: string,
): Promise<BackupCounts> {
  const safety = await exportGuestBackup(targetOwnerId);
  try {
    await clearOwnerRows(targetOwnerId);
    await writeBackupContents(backup, targetOwnerId);
    return backup.counts;
  } catch (err) {
    // rollback
    try {
      await clearOwnerRows(targetOwnerId);
      await writeBackupContents(safety, targetOwnerId);
    } catch {
      // If rollback itself fails, surface original error to the user.
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Legacy alias — old callers used `restoreGuestBackup`. */
export const restoreGuestBackup = replaceGuestBackup;

/* -------------------------------------------------------------------------- */
/* merge                                                                      */
/* -------------------------------------------------------------------------- */

export interface MergeResult {
  added: number;
  skippedExisting: number;
  droppedDangling: number;
  perStore: Record<string, { added: number; skipped: number; dropped: number }>;
}

async function existingIds(
  store: OwnedStore,
  ownerId: string,
): Promise<Set<string>> {
  const db = await getDB();
  const rows = await db.getAllFromIndex(store, "byOwner", ownerId);
  return new Set(rows.map((r) => (r as { id: string }).id));
}

/**
 * Merge policy:
 *   - id-in-current → keep current, skip imported.
 *   - id not in current → insert re-owned.
 *   - dangling FK → drop and count under `droppedDangling`.
 */
export async function mergeGuestBackup(
  backup: BackupFile,
  targetOwnerId: string,
): Promise<MergeResult> {
  const db = await getDB();
  const result: MergeResult = {
    added: 0,
    skippedExisting: 0,
    droppedDangling: 0,
    perStore: {},
  };

  const bump = (
    name: string,
    key: "added" | "skipped" | "dropped",
    n = 1,
  ): void => {
    const cur = result.perStore[name] ?? { added: 0, skipped: 0, dropped: 0 };
    cur[key] += n;
    result.perStore[name] = cur;
    if (key === "added") result.added += n;
    if (key === "skipped") result.skippedExisting += n;
    if (key === "dropped") result.droppedDangling += n;
  };

  async function insertUniqueRows(
    store: OwnedStore,
    rows: unknown[],
    predicate?: (row: Record<string, unknown>) => boolean,
  ): Promise<Set<string>> {
    const existing = await existingIds(store, targetOwnerId);
    const kept = new Set<string>(existing);
    const tx = db.transaction(store, "readwrite");
    for (const raw of rows) {
      if (!isRecord(raw) || typeof raw.id !== "string") continue;
      if (existing.has(raw.id)) {
        bump(store, "skipped");
        continue;
      }
      if (predicate && !predicate(raw)) {
        bump(store, "dropped");
        continue;
      }
      await tx.store.put(
        reownRow(raw as { ownerId?: string }, targetOwnerId) as never,
      );
      kept.add(raw.id);
      bump(store, "added");
    }
    await tx.done;
    return kept;
  }

  // Profile: only insert if none exists locally.
  const existingProfile = await db.get(STORE.profile, targetOwnerId);
  if (!existingProfile && isRecord(backup.data.profile)) {
    await db.put(STORE.profile, {
      ...(backup.data.profile as Record<string, unknown>),
      id: targetOwnerId,
    } as never);
    bump("profile", "added");
  } else if (backup.data.profile) {
    bump("profile", "skipped");
  }

  // Independent stores.
  await insertUniqueRows(STORE.subjects, backup.data.subjects);
  await insertUniqueRows(STORE.attendanceLogs, backup.data.attendance_logs);
  await insertUniqueRows(STORE.routineSlots, backup.data.routine_slots);
  await insertUniqueRows(STORE.todos, backup.data.todos);
  await insertUniqueRows(STORE.holidays, backup.data.holidays);

  // Courses first, then dependents.
  const courseIds = await insertUniqueRows(STORE.courses, backup.data.courses);
  const componentIds = await insertUniqueRows(
    STORE.courseComponents,
    backup.data.course_components,
    (row) => typeof row.courseId === "string" && courseIds.has(row.courseId),
  );
  const scheduleIds = await insertUniqueRows(
    STORE.scheduleEntries,
    backup.data.schedule_entries,
    (row) =>
      typeof row.componentId === "string" && componentIds.has(row.componentId),
  );
  await insertUniqueRows(
    STORE.attendanceEvents,
    backup.data.attendance_events,
    (row) => {
      const cid = row.componentId;
      const sid = row.scheduleEntryId;
      if (typeof cid !== "string" || !componentIds.has(cid)) return false;
      if (sid !== null && (typeof sid !== "string" || !scheduleIds.has(sid))) {
        return false;
      }
      return true;
    },
  );

  const projectIds = await insertUniqueRows(
    STORE.projects,
    backup.data.projects,
  );
  await insertUniqueRows(
    STORE.projectTasks,
    backup.data.project_tasks,
    (row) => typeof row.projectId === "string" && projectIds.has(row.projectId),
  );

  // Settings: skip conflicting keys.
  {
    const tx = db.transaction(STORE.settings, "readwrite");
    for (const raw of backup.data.settings) {
      if (!isRecord(raw) || typeof raw.key !== "string") continue;
      const suffix = raw.key.includes(":")
        ? raw.key.split(":").slice(1).join(":")
        : raw.key;
      const newKey = `${targetOwnerId}:${suffix}`;
      const existing = await tx.store.get(newKey);
      if (existing) {
        bump(STORE.settings, "skipped");
        continue;
      }
      await tx.store.put({
        ...raw,
        ownerId: targetOwnerId,
        key: newKey,
      } as never);
      bump(STORE.settings, "added");
    }
    await tx.done;
  }

  // Images.
  {
    const existing = new Set(
      (await db.getAllFromIndex(STORE.images, "byOwner", targetOwnerId)).map(
        (i) => i.id,
      ),
    );
    const tx = db.transaction(STORE.images, "readwrite");
    for (const img of backup.images) {
      if (existing.has(img.id)) {
        bump(STORE.images, "skipped");
        continue;
      }
      await tx.store.put({
        id: img.id,
        ownerId: targetOwnerId,
        kind: img.kind as "avatar" | "timetable",
        blob: base64ToBlob(img.dataBase64, img.mime),
        mime: img.mime,
        size: img.size,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
      });
      bump(STORE.images, "added");
    }
    await tx.done;
  }

  revokeAllImageUrls();
  return result;
}

/* -------------------------------------------------------------------------- */
/* legacy back-compat aliases                                                 */
/* -------------------------------------------------------------------------- */

export const BACKUP_VERSION = CURRENT_FORMAT_VERSION;

/* -------------------------------------------------------------------------- */
/* local data status (Settings → "Stored on this device")                     */
/* -------------------------------------------------------------------------- */

export interface LocalDataStatus {
  /** Total number of backup-relevant records stored on this device. */
  records: number;
  /** Most recent `updatedAt`/`createdAt` across local records, or null. */
  lastUpdatedAt: number | null;
}

/**
 * Cheap read-only scan of every owned store. Used purely to show the user
 * what is stored locally — it never writes or migrates anything.
 */
export async function getLocalDataStatus(ownerId: string): Promise<LocalDataStatus> {
  const db = await getDB();
  let records = 0;
  let lastUpdatedAt: number | null = null;

  const bump = (rec: unknown) => {
    const r = rec as { updatedAt?: number; createdAt?: number };
    const t = typeof r?.updatedAt === "number" ? r.updatedAt : r?.createdAt;
    if (typeof t === "number" && (lastUpdatedAt === null || t > lastUpdatedAt)) {
      lastUpdatedAt = t;
    }
  };

  for (const store of OWNED_STORES) {
    const rows = await db.getAllFromIndex(store, "byOwner", ownerId);
    records += rows.length;
    rows.forEach(bump);
  }
  const images = await db.getAllFromIndex(STORE.images, "byOwner", ownerId);
  records += images.length;
  images.forEach(bump);

  const profile = await db.get(STORE.profile, ownerId);
  if (profile) {
    records += 1;
    bump(profile);
  }

  return { records, lastUpdatedAt };
}
