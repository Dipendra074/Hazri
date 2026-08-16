package com.hazri.app;

import android.content.Context;
import java.util.concurrent.locks.ReentrantLock;
import org.json.JSONArray;
import org.json.JSONObject;

final class HazriDriveBackup {

    private static final int MAX_BACKUPS = 6;
    private static final ReentrantLock RUN_LOCK = new ReentrantLock();

    private HazriDriveBackup() {}

    static JSONObject uploadNow(Context context, String name, String payload) throws Exception {
        HazriDriveApi.logStage("MANUAL_UPLOAD_START");
        HazriDriveStore.writeSnapshot(context, payload, name);
        return uploadPrepared(context);
    }

    static JSONObject uploadPrepared(Context context) throws Exception {
        RUN_LOCK.lock();
        try {
            HazriDriveApi.logStage("PREPARED_UPLOAD_START");
            String hash = HazriDriveStore.snapshotHash(context);
            JSONObject previous = HazriDriveStore.lastFileMeta(context);
            if (!hash.isEmpty()
                && hash.equals(HazriDriveStore.lastHash(context))
                && !previous.optString("id", "").isEmpty()) {
                HazriDriveStore.recordNoChange(context);
                HazriDriveApi.logStage("DRIVE_UPLOAD_SKIPPED_NO_CHANGES");
                previous.put("skipped", true);
                return previous;
            }

            String payload = HazriDriveStore.readSnapshot(context);
            JSONObject envelope = new JSONObject(payload);
            String verifiedHash = envelope.optString("checksum", "");
            if (!verifiedHash.equals(hash)) {
                throw new IllegalStateException("The prepared backup hash does not match.");
            }
            HazriDriveApi.logStage("DATA_EXPORT_SUCCESS");

            JSONObject uploaded = HazriDriveApi.uploadBackup(
                context,
                HazriDriveStore.snapshotName(context),
                payload
            );
            String id = uploaded.optString("id", "");
            if (id.isEmpty()) {
                throw new IllegalStateException("Google Drive did not return a backup identifier.");
            }

            JSONObject verified = HazriDriveApi.getBackupMeta(context, id);
            JSONArray files = HazriDriveApi.listBackups(context);
            int retained = rotateOldVersions(context, files);
            HazriDriveStore.recordSuccess(context, verified, hash, retained);
            HazriDriveApi.logStage("BACKUP_SUCCESS");
            return verified;
        } catch (Exception error) {
            boolean reconnect = error instanceof HazriDriveApi.DriveException
                && ("AUTH_REQUIRED".equals(((HazriDriveApi.DriveException) error).code)
                    || "TOKEN_EXPIRED".equals(((HazriDriveApi.DriveException) error).code)
                    || "PERMISSION_DENIED".equals(((HazriDriveApi.DriveException) error).code));
            String message = error instanceof HazriDriveApi.DriveException
                ? error.getMessage()
                : "Backup could not be completed. Your device data is unchanged.";
            HazriDriveStore.recordFailure(context, message, reconnect);
            HazriDriveApi.logFailure("BACKUP", error);
            throw error;
        } finally {
            RUN_LOCK.unlock();
        }
    }

    static JSONArray refreshVersions(Context context) throws Exception {
        JSONArray files = HazriDriveApi.listBackups(context);
        HazriDriveStore.recordMetadata(context, files.length());
        return files;
    }

    private static int rotateOldVersions(Context context, JSONArray files) {
        int retained = Math.min(files.length(), MAX_BACKUPS);
        for (int index = MAX_BACKUPS; index < files.length(); index++) {
            JSONObject file = files.optJSONObject(index);
            if (file == null) {
                continue;
            }
            String id = file.optString("id", "");
            if (id.isEmpty()) {
                continue;
            }
            try {
                HazriDriveApi.deleteBackup(context, id);
            } catch (Exception ignored) {
                retained += 1;
            }
        }
        return retained;
    }
}
