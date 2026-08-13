package com.hazri.app;

import android.Manifest;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

final class HazriUpdateManager {

    static final String ACTION_DOWNLOAD_UPDATE = "com.hazri.app.action.DOWNLOAD_UPDATE";
    static final String EXTRA_APK_URL = "apk_url";
    static final String EXTRA_APK_NAME = "apk_name";
    static final String EXTRA_VERSION = "version";
    static final String EXTRA_DOWNLOAD_FILE = "download_file";

    private static final String RELEASE_API =
        "https://api.github.com/repos/Dipendra074/Hazri/releases/latest";
    private static final String PREFS = "hazri_updater";
    private static final String KEY_NOTIFIED_TAG = "notified_tag";
    private static final String KEY_DOWNLOAD_ID = "download_id";
    private static final String KEY_DOWNLOAD_FILE = "download_file";
    private static final String CHANNEL_ID = "hazri_updates";
    private static final int UPDATE_NOTIFICATION_ID = 41001;
    private static final Pattern VERSION_PATTERN =
        Pattern.compile("^v?(\\d+)\\.(\\d+)\\.(\\d+)$", Pattern.CASE_INSENSITIVE);

    private HazriUpdateManager() {}

    static final class UpdateInfo {
        final String tag;
        final String version;
        final String apkUrl;
        final String apkName;

        UpdateInfo(String tag, String version, String apkUrl, String apkName) {
            this.tag = tag;
            this.version = version;
            this.apkUrl = apkUrl;
            this.apkName = apkName;
        }
    }

    static UpdateInfo findAvailableUpdate(Context context) throws Exception {
        String installedVersion = context
            .getPackageManager()
            .getPackageInfo(context.getPackageName(), 0)
            .versionName;
        HttpURLConnection connection = (HttpURLConnection) new URL(RELEASE_API).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(8_000);
        connection.setRequestProperty("Accept", "application/vnd.github+json");
        connection.setRequestProperty("User-Agent", "Hazri-Android/" + installedVersion);

        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }

            StringBuilder json = new StringBuilder();
            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) {
                    json.append(line);
                }
            }

            JSONObject release = new JSONObject(json.toString());
            String tag = release.optString("tag_name", "").trim();
            String version = normalizedVersion(tag);
            if (version == null || !isNewerVersion(installedVersion, version)) {
                return null;
            }

            JSONArray assets = release.optJSONArray("assets");
            if (assets == null) {
                return null;
            }
            for (int index = 0; index < assets.length(); index++) {
                JSONObject asset = assets.optJSONObject(index);
                if (asset == null) continue;
                String name = asset.optString("name", "");
                String url = asset.optString("browser_download_url", "");
                if (name.toLowerCase().endsWith(".apk") && isAllowedDownloadUrl(url)) {
                    return new UpdateInfo(tag, version, url, safeApkName(name, version));
                }
            }
            return null;
        } finally {
            connection.disconnect();
        }
    }

    static boolean isNewerVersion(String installedVersion, String releaseVersion) {
        int[] installed = parseVersion(installedVersion);
        int[] release = parseVersion(releaseVersion);
        if (installed == null || release == null) return false;
        for (int index = 0; index < 3; index++) {
            if (release[index] != installed[index]) {
                return release[index] > installed[index];
            }
        }
        return false;
    }

    static boolean wasAlreadyNotified(Context context, String tag) {
        return tag.equals(prefs(context).getString(KEY_NOTIFIED_TAG, ""));
    }

    static void markReleaseHandled(Context context, String tag) {
        prefs(context).edit().putString(KEY_NOTIFIED_TAG, tag).apply();
    }

    static boolean canPostNotifications(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED;
    }

    static boolean showUpdateNotification(Context context, UpdateInfo update) {
        if (!canPostNotifications(context) || wasAlreadyNotified(context, update.tag)) {
            return false;
        }

        createNotificationChannel(context);
        Intent action = new Intent(context, HazriUpdateActionReceiver.class)
            .setAction(ACTION_DOWNLOAD_UPDATE)
            .putExtra(EXTRA_APK_URL, update.apkUrl)
            .putExtra(EXTRA_APK_NAME, update.apkName)
            .putExtra(EXTRA_VERSION, update.version);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            update.tag.hashCode(),
            action,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Hazri update available")
            .setContentText("Version " + update.version + " is ready to install")
            .setStyle(
                new NotificationCompat.BigTextStyle()
                    .bigText("Version " + update.version + " is ready to install. Tap to download.")
            )
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        try {
            NotificationManagerCompat.from(context).notify(UPDATE_NOTIFICATION_ID, notification.build());
            markReleaseHandled(context, update.tag);
            return true;
        } catch (SecurityException ignored) {
            return false;
        }
    }

    static void startDownload(Context context, String apkUrl, String apkName, String version) {
        if (!isAllowedDownloadUrl(apkUrl)) return;

        SharedPreferences preferences = prefs(context);
        long existingId = preferences.getLong(KEY_DOWNLOAD_ID, -1L);
        if (existingId >= 0 && isDownloadActive(context, existingId)) return;

        String filename = safeApkName(apkName, version);
        File downloads = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloads == null) return;
        File destination = new File(downloads, filename);
        if (destination.exists() && !destination.delete()) return;

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("Hazri " + version)
            .setDescription("Downloading application update")
            .setMimeType("application/vnd.android.package-archive")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
            .setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            )
            .setDestinationInExternalFilesDir(
                context,
                Environment.DIRECTORY_DOWNLOADS,
                filename
            );

        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return;
        long downloadId = manager.enqueue(request);
        preferences.edit()
            .putLong(KEY_DOWNLOAD_ID, downloadId)
            .putString(KEY_DOWNLOAD_FILE, filename)
            .apply();
        NotificationManagerCompat.from(context).cancel(UPDATE_NOTIFICATION_ID);
    }

    static String completedDownloadFile(Context context, long downloadId) {
        SharedPreferences preferences = prefs(context);
        if (preferences.getLong(KEY_DOWNLOAD_ID, -1L) != downloadId) return null;

        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return null;
        try (android.database.Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (!cursor.moveToFirst()) return null;
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusColumn < 0 || cursor.getInt(statusColumn) != DownloadManager.STATUS_SUCCESSFUL) {
                return null;
            }
        }

        String filename = preferences.getString(KEY_DOWNLOAD_FILE, null);
        preferences.edit().remove(KEY_DOWNLOAD_ID).remove(KEY_DOWNLOAD_FILE).apply();
        return filename;
    }

    private static boolean isDownloadActive(Context context, long downloadId) {
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) return false;
        try (android.database.Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId))) {
            if (!cursor.moveToFirst()) return false;
            int column = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (column < 0) return false;
            int status = cursor.getInt(column);
            return status == DownloadManager.STATUS_PENDING ||
                status == DownloadManager.STATUS_RUNNING ||
                status == DownloadManager.STATUS_PAUSED ||
                status == DownloadManager.STATUS_SUCCESSFUL;
        }
    }

    private static int[] parseVersion(String value) {
        if (value == null) return null;
        Matcher matcher = VERSION_PATTERN.matcher(value.trim());
        if (!matcher.matches()) return null;
        try {
            return new int[] {
                Integer.parseInt(matcher.group(1)),
                Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3)),
            };
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String normalizedVersion(String value) {
        int[] parts = parseVersion(value);
        if (parts == null) return null;
        return parts[0] + "." + parts[1] + "." + parts[2];
    }

    private static boolean isAllowedDownloadUrl(String value) {
        if (value == null || value.isEmpty()) return false;
        Uri uri = Uri.parse(value);
        String host = uri.getHost();
        return "https".equalsIgnoreCase(uri.getScheme()) &&
            host != null &&
            (host.equalsIgnoreCase("github.com") || host.endsWith(".github.com"));
    }

    private static String safeApkName(String name, String version) {
        String safe = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        return safe.toLowerCase().endsWith(".apk") ? safe : "hazri-" + version + ".apk";
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.update_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(R.string.update_channel_description));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }
}
