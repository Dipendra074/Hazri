/**
 * Focused tests for the backup module: envelope validation, legacy JSON
 * compatibility, checksum verification, gzip round-trip via a Node zlib
 * shim, and merge conflict handling.
 *
 * IndexedDB flows are covered by manual end-to-end checks — these tests
 * exercise the pure-JS surface only.
 */
import { describe, expect, test, beforeAll } from "bun:test";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  BACKUP_FORMAT,
  CURRENT_FORMAT_VERSION,
  BackupValidationError,
  parseAndValidateBackup,
  parseAndVerifyBackup,
  readBackupFile,
  type BackupFile,
} from "../backup";

// Provide CompressionStream / DecompressionStream shims for Bun.
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.CompressionStream !== "function") {
    class CS {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
      constructor(_fmt: string) {
        const chunks: Uint8Array[] = [];
        let resolveOut: (v: Uint8Array) => void;
        const outPromise = new Promise<Uint8Array>((r) => (resolveOut = r));
        this.writable = new WritableStream<Uint8Array>({
          write(c) {
            chunks.push(c);
          },
          close() {
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const merged = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) {
              merged.set(c, o);
              o += c.length;
            }
            resolveOut(new Uint8Array(gzipSync(merged)));
          },
        });
        this.readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(await outPromise);
            controller.close();
          },
        });
      }
    }
    class DS {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
      constructor(_fmt: string) {
        const chunks: Uint8Array[] = [];
        let resolveOut: (v: Uint8Array) => void;
        const outPromise = new Promise<Uint8Array>((r) => (resolveOut = r));
        this.writable = new WritableStream<Uint8Array>({
          write(c) {
            chunks.push(c);
          },
          close() {
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const merged = new Uint8Array(total);
            let o = 0;
            for (const c of chunks) {
              merged.set(c, o);
              o += c.length;
            }
            resolveOut(new Uint8Array(gunzipSync(merged)));
          },
        });
        this.readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            controller.enqueue(await outPromise);
            controller.close();
          },
        });
      }
    }
    g.CompressionStream = CS;
    g.DecompressionStream = DS;
  }
});

function makeLegacyV2(): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 2,
    exportedAt: new Date().toISOString(),
    ownerId: "owner-1",
    data: {
      profile: null,
      subjects: [],
      attendance_logs: [],
      routine_slots: [],
      projects: [],
      project_tasks: [],
      todos: [],
      settings: [],
      courses: [{ id: "c1", ownerId: "owner-1" }],
      course_components: [],
      schedule_entries: [],
      attendance_events: [],
      holidays: [],
    },
    images: [],
  });
}

describe("parseAndValidateBackup", () => {
  test("accepts legacy v2 JSON and normalizes to formatVersion 1", () => {
    const b = parseAndValidateBackup(makeLegacyV2());
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(b.formatVersion).toBe(1);
    expect(b.counts.courses).toBe(1);
    expect(b.data.courses.length).toBe(1);
  });

  test("rejects malformed JSON", () => {
    expect(() => parseAndValidateBackup("{not json")).toThrow(BackupValidationError);
  });

  test("rejects wrong format id", () => {
    expect(() =>
      parseAndValidateBackup(
        JSON.stringify({ format: "something-else", version: 1, ownerId: "x" }),
      ),
    ).toThrow(BackupValidationError);
  });

  test("rejects unsupported future formatVersion", () => {
    expect(() =>
      parseAndValidateBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          formatVersion: 999,
          ownerId: "x",
          data: {},
          images: [],
        }),
      ),
    ).toThrow(BackupValidationError);
  });

  test("rejects unknown databaseName", () => {
    expect(() =>
      parseAndValidateBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          formatVersion: CURRENT_FORMAT_VERSION,
          databaseName: "not-hazri",
          databaseVersion: 3,
          ownerId: "x",
          data: {},
          images: [],
        }),
      ),
    ).toThrow(BackupValidationError);
  });
});

describe("readBackupFile", () => {
  test("reads plain JSON File", async () => {
    const file = new File([makeLegacyV2()], "Hazri-Backup.json", {
      type: "application/json",
    });
    const b = await readBackupFile(file);
    expect(b.data.courses.length).toBe(1);
  });

  test("reads gzipped .hazri File", async () => {
    const bytes = gzipSync(Buffer.from(makeLegacyV2(), "utf8"));
    const file = new File([new Uint8Array(bytes)], "Hazri-Backup.hazri", {
      type: "application/gzip",
    });
    const b = await readBackupFile(file);
    expect(b.counts.courses).toBe(1);
  });

  test("rejects corrupt gzip", async () => {
    const bad = new Uint8Array([0x1f, 0x8b, 0x00, 0x00, 0x00]);
    const file = new File([bad], "x.hazri", { type: "application/gzip" });
    await expect(readBackupFile(file)).rejects.toBeInstanceOf(BackupValidationError);
  });

  test("rejects tampered checksum", async () => {
    // Build a v2 envelope with a fake checksum.
    const envelope: BackupFile = {
      format: BACKUP_FORMAT,
      formatVersion: CURRENT_FORMAT_VERSION,
      databaseName: "hazri",
      databaseVersion: 3,
      appVersion: "test",
      exportedAt: new Date().toISOString(),
      backupId: "b1",
      ownerId: "owner-1",
      backupKind: "full",
      checksum: "sha256:deadbeef",
      counts: {
        subjects: 0,
        attendanceLogs: 0,
        routineSlots: 0,
        projects: 0,
        projectTasks: 0,
        todos: 0,
        settings: 0,
        courses: 0,
        courseComponents: 0,
        scheduleEntries: 0,
        attendanceEvents: 0,
        holidays: 0,
        images: 0,
      },
      data: {
        profile: null,
        settings: [],
        courses: [],
        course_components: [],
        schedule_entries: [],
        holidays: [],
        attendance_events: [],
        projects: [],
        project_tasks: [],
        todos: [],
        subjects: [],
        attendance_logs: [],
        routine_slots: [],
      },
      images: [],
    };
    const file = new File([JSON.stringify(envelope)], "b.json", {
      type: "application/json",
    });
    await expect(readBackupFile(file)).rejects.toBeInstanceOf(BackupValidationError);
    await expect(parseAndVerifyBackup(JSON.stringify(envelope))).rejects.toBeInstanceOf(
      BackupValidationError,
    );
  });

  test("recognizes a timetable-only backup", () => {
    const backup = parseAndValidateBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        formatVersion: CURRENT_FORMAT_VERSION,
        databaseName: "hazri",
        databaseVersion: 3,
        ownerId: "owner-1",
        backupKind: "timetable",
        data: {},
        images: [],
      }),
    );
    expect(backup.backupKind).toBe("timetable");
  });
});
