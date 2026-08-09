/**
 * Minimal Google Drive REST client scoped to Hazri's hidden appDataFolder.
 *
 * Only list, upload, metadata, download and delete are used, and every call
 * is confined to the app-private space. Google's raw error bodies and access
 * tokens are never surfaced to the user.
 */

import { BACKUP_FILE_PREFIX, DRIVE_SPACE } from "./config";
import { DriveAuthError, getAccessToken } from "./auth";
import { NativeDrive, normalizeNativeMeta } from "@/lib/native/drive";
import { isAndroidApp } from "@/lib/platform";

const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const ABOUT = "https://www.googleapis.com/drive/v3/about";

export class DriveApiError extends Error {}

export interface DriveBackupFileMeta {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size: number;
}

async function handle(res: Response, scope: string): Promise<Response> {
  if (res.ok) return res;
  if (import.meta.env?.DEV) {
    console.error(`[drive] ${scope} failed`, res.status, await res.clone().text());
  }
  if (res.status === 401 || res.status === 403) {
    throw new DriveAuthError("Google Drive access expired. Please reconnect.");
  }
  throw new DriveApiError("Google Drive is not responding right now.");
}

async function authHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getAccessToken()}` };
}

function toMeta(f: Record<string, string>): DriveBackupFileMeta {
  return {
    id: f.id,
    name: f.name,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
    size: Number(f.size ?? 0),
  };
}

export async function listBackups(): Promise<DriveBackupFileMeta[]> {
  if (isAndroidApp()) {
    const { files } = await NativeDrive.listBackups();
    return files.map(normalizeNativeMeta);
  }
  const params = new URLSearchParams({
    spaces: DRIVE_SPACE,
    q: `name contains '${BACKUP_FILE_PREFIX}' and trashed = false`,
    fields: "files(id,name,createdTime,modifiedTime,size)",
    orderBy: "createdTime desc",
    pageSize: "25",
  });
  const res = await handle(
    await fetch(`${FILES}?${params}`, { headers: await authHeaders() }),
    "list",
  );
  const json = (await res.json()) as { files?: Array<Record<string, string>> };
  return (json.files ?? []).map(toMeta);
}

export async function uploadBackup(
  name: string,
  json: string,
): Promise<DriveBackupFileMeta> {
  if (isAndroidApp()) {
    return normalizeNativeMeta(await NativeDrive.uploadBackup({ name, json }));
  }
  const boundary = `hazri${Math.random().toString(36).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [DRIVE_SPACE] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    json +
    `\r\n--${boundary}--`;

  const res = await handle(
    await fetch(
      `${UPLOAD}?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size`,
      {
        method: "POST",
        headers: {
          ...(await authHeaders()),
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    ),
    "upload",
  );
  return toMeta((await res.json()) as Record<string, string>);
}

export async function getBackupMeta(id: string): Promise<DriveBackupFileMeta> {
  if (isAndroidApp()) {
    return normalizeNativeMeta(await NativeDrive.getBackupMeta({ id }));
  }
  const res = await handle(
    await fetch(`${FILES}/${id}?fields=id,name,createdTime,modifiedTime,size`, {
      headers: await authHeaders(),
    }),
    "meta",
  );
  return toMeta((await res.json()) as Record<string, string>);
}

export async function downloadBackup(id: string): Promise<string> {
  if (isAndroidApp()) {
    return (await NativeDrive.downloadBackup({ id })).json;
  }
  const res = await handle(
    await fetch(`${FILES}/${id}?alt=media`, { headers: await authHeaders() }),
    "download",
  );
  return res.text();
}

export async function deleteBackup(id: string): Promise<void> {
  if (isAndroidApp()) {
    await NativeDrive.deleteBackup({ id });
    return;
  }
  await handle(
    await fetch(`${FILES}/${id}`, { method: "DELETE", headers: await authHeaders() }),
    "delete",
  );
}

/**
 * Best-effort account label. The appdata scope does not guarantee an email
 * address, so this returns null instead of failing the connection.
 */
export async function getDriveAccountEmail(): Promise<string | null> {
  if (isAndroidApp()) {
    try {
      return (await NativeDrive.getDriveAccount()).account;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(`${ABOUT}?fields=user(emailAddress,displayName)`, {
      headers: await authHeaders(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      user?: { emailAddress?: string; displayName?: string };
    };
    return json.user?.emailAddress ?? json.user?.displayName ?? null;
  } catch {
    return null;
  }
}
