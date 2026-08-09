package com.hazri.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class HazriDriveStore {

    static final Object BACKUP_LOCK = new Object();

    private static final String PREFS = "hazri_drive_backup";
    private static final String SNAPSHOT_DIR = "hazri-drive";
    private static final String SNAPSHOT_FILE = "pending-backup.json";

    private static final String CONNECTED = "connected";
    private static final String ACCOUNT = "account";
    private static final String AUTO = "automatic";
    private static final String FREQUENCY = "frequency";
    private static final String PENDING = "pending";
    private static final String NEEDS_RECONNECT = "needs_reconnect";
    private static final String LAST_SUCCESS = "last_success";
    private static final String LAST_ERROR = "last_error";
    private static final String LAST_HASH = "last_hash";
    private static final String SNAPSHOT_HASH = "snapshot_hash";
    private static final String SNAPSHOT_NAME = "snapshot_name";
    private static final String LATEST_VERSION = "latest_version";
    private static final String VERSION_COUNT = "version_count";
    private static final String LAST_FILE_ID = "last_file_id";
    private static final String LAST_FILE_NAME = "last_file_name";
    private static final String LAST_FILE_CREATED = "last_file_created";
    private static final String LAST_FILE_MODIFIED = "last_file_modified";
    private static final String LAST_FILE_SIZE = "last_file_size";

    private HazriDriveStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File snapshotFile(Context context) {
        File directory = new File(context.getFilesDir(), SNAPSHOT_DIR);
        if (!directory.exists() && !directory.mkdirs() && !directory.exists()) {
            throw new IllegalStateException("Could not prepare the local backup snapshot.");
        }
        return new File(directory, SNAPSHOT_FILE);
    }

    static JSONObject writeSnapshot(Context context, String payload, String requestedName) throws Exception {
        JSONObject envelope = new JSONObject(payload);
        if (!"hazri-backup".equals(envelope.optString("format"))) {
            throw new IllegalArgumentException("The prepared snapshot is not a Hazri backup.");
        }

        int formatVersion = envelope.optInt("formatVersion", 0);
        if (formatVersion < 1 || formatVersion > 2) {
            throw new IllegalArgumentException("The prepared snapshot version is not supported.");
        }

        String checksum = envelope.optString("checksum", "");
        if (!checksum.startsWith("sha256:") || checksum.length() != 71) {
            throw new IllegalArgumentException("The prepared snapshot has no valid content hash.");
        }

        String name = requestedName == null || requestedName.trim().isEmpty()
            ? defaultFileName(envelope.optString("exportedAt", ""))
            : requestedName.trim();

        synchronized (BACKUP_LOCK) {
            AtomicFile atomic = new AtomicFile(snapshotFile(context));
            FileOutputStream output = null;
            try {
                output = atomic.startWrite();
                output.write(payload.getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
                atomic.finishWrite(output);
            } catch (Exception error) {
                if (output != null) {
                    atomic.failWrite(output);
                }
                throw error;
            }

            prefs(context)
                .edit()
                .putString(SNAPSHOT_HASH, checksum)
                .putString(SNAPSHOT_NAME, name)
                .putBoolean(PENDING, true)
                .putString(LAST_ERROR, "")
                .apply();
        }
        return envelope;
    }

    static String readSnapshot(Context context) throws Exception {
        synchronized (BACKUP_LOCK) {
            File file = snapshotFile(context);
            if (!file.isFile()) {
                throw new IllegalStateException("No prepared backup snapshot is available.");
            }
            byte[] bytes = new byte[(int) file.length()];
            try (FileInputStream input = new FileInputStream(file)) {
                int offset = 0;
                while (offset < bytes.length) {
                    int read = input.read(bytes, offset, bytes.length - offset);
                    if (read < 0) {
                        break;
                    }
                    offset += read;
                }
                if (offset != bytes.length) {
                    throw new IllegalStateException("The prepared backup snapshot is incomplete.");
                }
            }
            String payload = new String(bytes, StandardCharsets.UTF_8);
            JSONObject envelope = new JSONObject(payload);
            String checksum = envelope.optString("checksum", "");
            if (!checksum.equals(snapshotHash(context))) {
                throw new IllegalStateException("The prepared backup snapshot changed unexpectedly.");
            }
            return payload;
        }
    }

    static String snapshotHash(Context context) {
        return prefs(context).getString(SNAPSHOT_HASH, "");
    }

    static String snapshotName(Context context) {
        return prefs(context).getString(SNAPSHOT_NAME, "hazri-backup-v2.json");
    }

    static String lastHash(Context context) {
        return prefs(context).getString(LAST_HASH, "");
    }

    static boolean isConnected(Context context) {
        return prefs(context).getBoolean(CONNECTED, false);
    }

    static boolean isAutomatic(Context context) {
        return prefs(context).getBoolean(AUTO, false);
    }

    static boolean isPending(Context context) {
        return prefs(context).getBoolean(PENDING, false);
    }

    static String account(Context context) {
        return prefs(context).getString(ACCOUNT, "");
    }

    static String frequency(Context context) {
        return prefs(context).getString(FREQUENCY, "daily");
    }

    static boolean isAutomaticBackupDue(Context context) {
        long lastSuccess = prefs(context).getLong(LAST_SUCCESS, 0L);
        if (lastSuccess <= 0L) {
            return true;
        }
        long days = "weekly".equals(frequency(context)) ? 7L : 1L;
        long interval = days * 24L * 60L * 60L * 1000L;
        return System.currentTimeMillis() - lastSuccess >= interval;
    }

    static void markConnected(Context context, String account) {
        SharedPreferences.Editor editor = prefs(context)
            .edit()
            .putBoolean(CONNECTED, true)
            .putBoolean(NEEDS_RECONNECT, false)
            .putString(LAST_ERROR, "");
        if (account != null && !account.trim().isEmpty()) {
            editor.putString(ACCOUNT, account.trim());
        }
        editor.apply();
    }

    static void clearConnection(Context context) {
        prefs(context)
            .edit()
            .putBoolean(CONNECTED, false)
            .putBoolean(AUTO, false)
            .putBoolean(NEEDS_RECONNECT, false)
            .putString(ACCOUNT, "")
            .putString(LAST_ERROR, "")
            .apply();
    }

    static void setAutomatic(Context context, boolean enabled, String requestedFrequency) {
        String safeFrequency = "weekly".equals(requestedFrequency) ? "weekly" : "daily";
        prefs(context)
            .edit()
            .putBoolean(AUTO, enabled)
            .putString(FREQUENCY, safeFrequency)
            .apply();
    }

    static void recordSuccess(Context context, JSONObject meta, String hash, int versionCount) {
        long now = System.currentTimeMillis();
        prefs(context)
            .edit()
            .putBoolean(CONNECTED, true)
            .putBoolean(PENDING, false)
            .putBoolean(NEEDS_RECONNECT, false)
            .putLong(LAST_SUCCESS, now)
            .putLong(LATEST_VERSION, now)
            .putString(LAST_ERROR, "")
            .putString(LAST_HASH, hash)
            .putInt(VERSION_COUNT, Math.max(versionCount, 1))
            .putString(LAST_FILE_ID, meta.optString("id", ""))
            .putString(LAST_FILE_NAME, meta.optString("name", ""))
            .putString(LAST_FILE_CREATED, meta.optString("createdTime", ""))
            .putString(LAST_FILE_MODIFIED, meta.optString("modifiedTime", ""))
            .putLong(LAST_FILE_SIZE, meta.optLong("size", 0L))
            .apply();
    }

    static void recordMetadata(Context context, int count) {
        prefs(context).edit().putInt(VERSION_COUNT, Math.max(count, 0)).apply();
    }

    static void recordNoChange(Context context) {
        prefs(context)
            .edit()
            .putBoolean(PENDING, false)
            .putBoolean(NEEDS_RECONNECT, false)
            .putString(LAST_ERROR, "")
            .apply();
    }

    static void recordFailure(Context context, String message, boolean needsReconnect) {
        prefs(context)
            .edit()
            .putBoolean(PENDING, true)
            .putBoolean(NEEDS_RECONNECT, needsReconnect)
            .putString(LAST_ERROR, message == null ? "Backup could not be completed." : message)
            .apply();
    }

    static JSONObject lastFileMeta(Context context) {
        SharedPreferences values = prefs(context);
        JSONObject meta = new JSONObject();
        put(meta, "id", values.getString(LAST_FILE_ID, ""));
        put(meta, "name", values.getString(LAST_FILE_NAME, ""));
        put(meta, "createdTime", values.getString(LAST_FILE_CREATED, ""));
        put(meta, "modifiedTime", values.getString(LAST_FILE_MODIFIED, ""));
        put(meta, "size", values.getLong(LAST_FILE_SIZE, 0L));
        return meta;
    }

    static JSObject status(Context context) {
        SharedPreferences values = prefs(context);
        JSObject result = new JSObject();
        result.put("configured", true);
        result.put("connected", values.getBoolean(CONNECTED, false));
        String account = values.getString(ACCOUNT, "");
        result.put("account", account == null || account.isEmpty() ? JSONObject.NULL : account);
        result.put("autoBackup", values.getBoolean(AUTO, false));
        result.put("frequency", values.getString(FREQUENCY, "daily"));
        result.put("pending", values.getBoolean(PENDING, false));
        result.put("syncing", "idle");
        long lastSuccess = values.getLong(LAST_SUCCESS, 0L);
        long latest = values.getLong(LATEST_VERSION, 0L);
        result.put("lastBackupAt", lastSuccess > 0 ? lastSuccess : JSONObject.NULL);
        result.put("latestVersionAt", latest > 0 ? latest : JSONObject.NULL);
        result.put("versionCount", values.contains(VERSION_COUNT)
            ? values.getInt(VERSION_COUNT, 0)
            : JSONObject.NULL);
        result.put("needsReconnect", values.getBoolean(NEEDS_RECONNECT, false));
        String error = values.getString(LAST_ERROR, "");
        result.put("lastError", error == null || error.isEmpty() ? JSONObject.NULL : error);
        return result;
    }

    private static String defaultFileName(String exportedAt) {
        String compact = exportedAt == null
            ? ""
            : exportedAt.replaceAll("[^0-9]", "");
        if (compact.length() > 14) {
            compact = compact.substring(0, 14);
        }
        if (compact.isEmpty()) {
            compact = String.valueOf(System.currentTimeMillis());
        }
        return "hazri-backup-v2-" + compact + ".json";
    }

    private static void put(JSONObject target, String key, Object value) {
        try {
            target.put(key, value);
        } catch (Exception ignored) {
            // All supplied values are JSON-compatible.
        }
    }
}