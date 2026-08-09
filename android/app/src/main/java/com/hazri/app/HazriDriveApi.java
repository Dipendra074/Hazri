package com.hazri.app;

import android.accounts.Account;
import android.content.Context;
import android.net.Uri;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

final class HazriDriveApi {

    static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
    private static final String FILES = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
    private static final String ABOUT = "https://www.googleapis.com/drive/v3/about";

    interface AuthorizedOperation<T> {
        T run(String accessToken) throws Exception;
    }

    static final class DriveException extends Exception {
        final String code;
        final int status;
        final boolean retryable;

        DriveException(String message, String code, int status, boolean retryable) {
            super(message);
            this.code = code;
            this.status = status;
            this.retryable = retryable;
        }

        DriveException(String message, String code, boolean retryable, Throwable cause) {
            super(message, cause);
            this.code = code;
            this.status = 0;
            this.retryable = retryable;
        }
    }

    private HazriDriveApi() {}

    static AuthorizationRequest authorizationRequest() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .build();
    }

    static Task<AuthorizationResult> authorize(Context context) {
        return Identity.getAuthorizationClient(context).authorize(authorizationRequest());
    }

    static <T> T withAuthorization(Context context, AuthorizedOperation<T> operation) throws Exception {
        String token = accessToken(context);
        try {
            return operation.run(token);
        } catch (DriveException error) {
            if (error.status != HttpURLConnection.HTTP_UNAUTHORIZED) {
                throw error;
            }
            clearToken(context, token);
            return operation.run(accessToken(context));
        }
    }

    static String accessToken(Context context) throws DriveException {
        try {
            AuthorizationResult result = Tasks.await(authorize(context), 30, TimeUnit.SECONDS);
            if (result.hasResolution()) {
                throw new DriveException(
                    "Google Drive permission must be renewed in Hazri.",
                    "AUTH_REQUIRED",
                    false,
                    null
                );
            }
            String token = result.getAccessToken();
            if (token == null || token.isEmpty()) {
                throw new DriveException(
                    "Google Drive did not provide access.",
                    "AUTH_REQUIRED",
                    false,
                    null
                );
            }
            return token;
        } catch (DriveException error) {
            throw error;
        } catch (ExecutionException error) {
            throw authorizationFailure(error.getCause());
        } catch (Exception error) {
            throw new DriveException(
                "Google Drive authorization is temporarily unavailable.",
                "AUTH_UNAVAILABLE",
                true,
                error
            );
        }
    }

    static void clearToken(Context context, String token) {
        if (token == null || token.isEmpty()) {
            return;
        }
        try {
            AuthorizationClient client = Identity.getAuthorizationClient(context);
            Tasks.await(
                client.clearToken(ClearTokenRequest.builder().setToken(token).build()),
                15,
                TimeUnit.SECONDS
            );
        } catch (Exception ignored) {
            // A later authorize call will still ask Google Play services for a valid token.
        }
    }

    static void revokeAccess(Context context, String accountName) {
        if (accountName == null || accountName.trim().isEmpty()) {
            return;
        }
        try {
            RevokeAccessRequest request = RevokeAccessRequest.builder()
                .setAccount(new Account(accountName.trim(), "com.google"))
                .setScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
                .build();
            Tasks.await(
                Identity.getAuthorizationClient(context).revokeAccess(request),
                20,
                TimeUnit.SECONDS
            );
        } catch (Exception ignored) {
            // Disconnect remains local and safe even if Google is temporarily unreachable.
        }
    }

    static DriveException authorizationFailure(Throwable cause) {
        String message = cause == null ? "" : String.valueOf(cause.getMessage());
        String lowered = message.toLowerCase();
        if (lowered.contains("network") || lowered.contains("timeout")) {
            return new DriveException(
                "Could not reach Google. Check your connection.",
                "NETWORK",
                true,
                cause
            );
        }
        if (lowered.contains("developer_error") || lowered.contains("10:")) {
            return new DriveException(
                "Google Drive is not configured for this Android signing certificate.",
                "OAUTH_CONFIG",
                false,
                cause
            );
        }
        return new DriveException(
            "Google Drive authorization was not available.",
            "AUTH_UNAVAILABLE",
            false,
            cause
        );
    }

    static JSONArray listBackups(Context context) throws Exception {
        return withAuthorization(context, HazriDriveApi::listBackupsWithToken);
    }

    static JSONObject getBackupMeta(Context context, String id) throws Exception {
        return withAuthorization(context, token -> getBackupMetaWithToken(token, id));
    }

    static JSONObject uploadBackup(Context context, String name, String payload) throws Exception {
        return withAuthorization(context, token -> uploadBackupWithToken(token, name, payload));
    }

    static String downloadBackup(Context context, String id) throws Exception {
        return withAuthorization(context, token -> {
            String url = FILES + "/" + Uri.encode(id) + "?alt=media";
            return request("GET", url, token, null, null);
        });
    }

    static void deleteBackup(Context context, String id) throws Exception {
        withAuthorization(context, token -> {
            String url = FILES + "/" + Uri.encode(id);
            request("DELETE", url, token, null, null);
            return null;
        });
    }

    static String accountLabel(Context context) throws Exception {
        return withAuthorization(context, token -> {
            Uri uri = Uri.parse(ABOUT)
                .buildUpon()
                .appendQueryParameter("fields", "user(emailAddress,displayName)")
                .build();
            JSONObject response = new JSONObject(request("GET", uri.toString(), token, null, null));
            JSONObject user = response.optJSONObject("user");
            if (user == null) {
                return null;
            }
            String email = user.optString("emailAddress", "");
            if (!email.isEmpty()) {
                return email;
            }
            String displayName = user.optString("displayName", "");
            return displayName.isEmpty() ? null : displayName;
        });
    }

    private static JSONArray listBackupsWithToken(String token) throws Exception {
        Uri uri = Uri.parse(FILES)
            .buildUpon()
            .appendQueryParameter("spaces", "appDataFolder")
            .appendQueryParameter("q", "name contains 'hazri-backup' and trashed = false")
            .appendQueryParameter("fields", "files(id,name,createdTime,modifiedTime,size)")
            .appendQueryParameter("orderBy", "createdTime desc")
            .appendQueryParameter("pageSize", "25")
            .build();
        JSONObject response = new JSONObject(request("GET", uri.toString(), token, null, null));
        JSONArray files = response.optJSONArray("files");
        return files == null ? new JSONArray() : files;
    }

    private static JSONObject getBackupMetaWithToken(String token, String id) throws Exception {
        Uri uri = Uri.parse(FILES + "/" + Uri.encode(id))
            .buildUpon()
            .appendQueryParameter("fields", "id,name,createdTime,modifiedTime,size")
            .build();
        return new JSONObject(request("GET", uri.toString(), token, null, null));
    }

    private static JSONObject uploadBackupWithToken(String token, String name, String payload)
        throws Exception {
        String boundary = "hazri" + UUID.randomUUID().toString().replace("-", "");
        JSONObject metadata = new JSONObject();
        metadata.put("name", name);
        metadata.put("parents", new JSONArray().put("appDataFolder"));

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bytes.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        bytes.write("Content-Type: application/json; charset=UTF-8\r\n\r\n".getBytes(StandardCharsets.UTF_8));
        bytes.write(metadata.toString().getBytes(StandardCharsets.UTF_8));
        bytes.write(("\r\n--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        bytes.write("Content-Type: application/json\r\n\r\n".getBytes(StandardCharsets.UTF_8));
        bytes.write(payload.getBytes(StandardCharsets.UTF_8));
        bytes.write(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));

        Uri uri = Uri.parse(UPLOAD)
            .buildUpon()
            .appendQueryParameter("uploadType", "multipart")
            .appendQueryParameter("fields", "id,name,createdTime,modifiedTime,size")
            .build();
        String response = request(
            "POST",
            uri.toString(),
            token,
            "multipart/related; boundary=" + boundary,
            bytes.toByteArray()
        );
        return new JSONObject(response);
    }

    private static String request(
        String method,
        String address,
        String token,
        String contentType,
        byte[] body
    ) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(address).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(20_000);
            connection.setReadTimeout(60_000);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Accept", "application/json");
            connection.setUseCaches(false);
            if (body != null) {
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(body.length);
                connection.setRequestProperty("Content-Type", contentType);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
            String response = readFully(stream);
            if (status < 200 || status >= 300) {
                throw httpFailure(status);
            }
            return response;
        } catch (DriveException error) {
            throw error;
        } catch (java.net.SocketTimeoutException error) {
            throw new DriveException(
                "Google Drive timed out. Hazri will retry later.",
                "TIMEOUT",
                true,
                error
            );
        } catch (java.io.IOException error) {
            throw new DriveException(
                "Could not reach Google Drive. Hazri will retry when online.",
                "NETWORK",
                true,
                error
            );
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String readFully(InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) {
                output.write(chunk, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static DriveException httpFailure(int status) {
        if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            return new DriveException(
                "Google Drive access expired.",
                "TOKEN_EXPIRED",
                status,
                false
            );
        }
        if (status == HttpURLConnection.HTTP_FORBIDDEN) {
            return new DriveException(
                "Google Drive permission was revoked or the Drive API is unavailable.",
                "PERMISSION_DENIED",
                status,
                false
            );
        }
        if (status == 429) {
            return new DriveException(
                "Google Drive is busy. Hazri will retry later.",
                "RATE_LIMITED",
                status,
                true
            );
        }
        if (status == HttpURLConnection.HTTP_CLIENT_TIMEOUT || status >= 500) {
            return new DriveException(
                "Google Drive is temporarily unavailable. Hazri will retry later.",
                "DRIVE_UNAVAILABLE",
                status,
                true
            );
        }
        return new DriveException(
            "Google Drive rejected the backup request.",
            "DRIVE_ERROR",
            status,
            false
        );
    }
}