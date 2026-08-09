import { registerPlugin } from "@capacitor/core";

export type NativeDriveFrequency = "daily" | "weekly";

export interface NativeDriveStatus {
  configured: boolean;
  connected: boolean;
  account: string | null;
  autoBackup: boolean;
  frequency: NativeDriveFrequency;
  pending: boolean;
  syncing: "idle" | "working" | "error";
  lastBackupAt: number | null;
  latestVersionAt: number | null;
  versionCount: number | null;
  needsReconnect: boolean;
  lastError: string | null;
}

export interface NativeDriveFileMeta {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size: number | string;
  skipped?: boolean;
}

interface HazriDrivePlugin {
  getStatus(): Promise<NativeDriveStatus>;
  connect(): Promise<NativeDriveStatus>;
  reconnect(): Promise<NativeDriveStatus>;
  disconnect(): Promise<NativeDriveStatus>;
  setAutomaticBackup(options: {
    enabled: boolean;
    frequency: NativeDriveFrequency;
  }): Promise<NativeDriveStatus>;
  prepareSnapshot(options: { json: string; name: string }): Promise<NativeDriveStatus>;
  uploadBackup(options: { json: string; name: string }): Promise<NativeDriveFileMeta>;
  listBackups(): Promise<{ files: NativeDriveFileMeta[] }>;
  getBackupMeta(options: { id: string }): Promise<NativeDriveFileMeta>;
  downloadBackup(options: { id: string }): Promise<{ json: string }>;
  deleteBackup(options: { id: string }): Promise<void>;
  getDriveAccount(): Promise<{ account: string | null }>;
}

export const NativeDrive = registerPlugin<HazriDrivePlugin>("HazriDrive");

export function normalizeNativeMeta(file: NativeDriveFileMeta) {
  return {
    id: file.id,
    name: file.name,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
    size: Number(file.size ?? 0),
  };
}
