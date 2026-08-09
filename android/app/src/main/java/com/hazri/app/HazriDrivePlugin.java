package com.hazri.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "HazriDrive")
public final class HazriDrivePlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(HazriDriveStore.status(getContext()));
    }

    @PluginMethod
    public void connect(PluginCall call) {
        requestAuthorization(call);
    }

    @PluginMethod
    public void reconnect(PluginCall call) {
        requestAuthorization(call);
    }

    private void requestAuthorization(PluginCall call) {
        HazriDriveApi.authorize(getContext())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    PendingIntent pendingIntent = result.getPendingIntent();
                    if (pendingIntent == null) {
                        call.reject("Google Drive permission could not be opened.", "AUTH_UNAVAILABLE");
                        return;
                    }
                    Intent intent = new Intent(getContext(), DriveAuthorizationActivity.class);
                    intent.putExtra(DriveAuthorizationActivity.EXTRA_PENDING_INTENT, pendingIntent);
                    startActivityForResult(call, intent, "authorizationResult");
                    return;
                }
                finishConnection(call, result);
            })
            .addOnFailureListener(error -> reject(call, HazriDriveApi.authorizationFailure(error)));
    }

    @ActivityCallback
    private void authorizationResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            return;
        }
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            call.reject("Google Drive access was not granted.", "CANCELLED");
            return;
        }
        try {
            AuthorizationResult result = Identity
                .getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            finishConnection(call, result);
        } catch (Exception error) {
            reject(call, HazriDriveApi.authorizationFailure(error));
        }
    }

    private void finishConnection(PluginCall call, AuthorizationResult result) {
        if (result == null || result.getAccessToken() == null || result.getAccessToken().isEmpty()) {
            call.reject("Google Drive did not provide access.", "AUTH_REQUIRED");
            return;
        }
        run(call, () -> {
            String account = HazriDriveApi.accountLabel(getContext());
            HazriDriveStore.markConnected(getContext(), account);
            HazriDriveScheduler.reconcile(getContext());
            return HazriDriveStore.status(getContext());
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        run(call, () -> {
            String account = HazriDriveStore.account(getContext());
            HazriDriveApi.revokeAccess(getContext(), account);
            HazriDriveStore.clearConnection(getContext());
            HazriDriveScheduler.cancel(getContext());
            return HazriDriveStore.status(getContext());
        });
    }

    @PluginMethod
    public void setAutomaticBackup(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        String frequency = call.getString("frequency", "daily");
        HazriDriveStore.setAutomatic(getContext(), enabled, frequency);
        HazriDriveScheduler.reconcile(getContext());
        call.resolve(HazriDriveStore.status(getContext()));
    }

    @PluginMethod
    public void prepareSnapshot(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("No backup snapshot was provided.", "INVALID_BACKUP");
            return;
        }
        String name = call.getString("name", "");
        run(call, () -> {
            HazriDriveStore.writeSnapshot(getContext(), json, name);
            HazriDriveScheduler.enqueuePending(getContext());
            return HazriDriveStore.status(getContext());
        });
    }

    @PluginMethod
    public void uploadBackup(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) {
            call.reject("No backup snapshot was provided.", "INVALID_BACKUP");
            return;
        }
        String name = call.getString("name", "");
        run(call, () -> {
            try {
                return toJsObject(HazriDriveBackup.uploadNow(getContext(), name, json));
            } catch (Exception error) {
                HazriDriveScheduler.enqueuePendingNow(getContext());
                throw error;
            }
        });
    }

    @PluginMethod
    public void listBackups(PluginCall call) {
        run(call, () -> {
            JSONArray files = HazriDriveBackup.refreshVersions(getContext());
            JSObject result = new JSObject();
            result.put("files", files);
            return result;
        });
    }

    @PluginMethod
    public void getBackupMeta(PluginCall call) {
        String id = requireId(call);
        if (id == null) return;
        run(call, () -> toJsObject(HazriDriveApi.getBackupMeta(getContext(), id)));
    }

    @PluginMethod
    public void downloadBackup(PluginCall call) {
        String id = requireId(call);
        if (id == null) return;
        run(call, () -> {
            JSObject result = new JSObject();
            result.put("json", HazriDriveApi.downloadBackup(getContext(), id));
            return result;
        });
    }

    @PluginMethod
    public void deleteBackup(PluginCall call) {
        String id = requireId(call);
        if (id == null) return;
        run(call, () -> {
            HazriDriveApi.deleteBackup(getContext(), id);
            return new JSObject();
        });
    }

    @PluginMethod
    public void getDriveAccount(PluginCall call) {
        run(call, () -> {
            JSObject result = new JSObject();
            String account = HazriDriveApi.accountLabel(getContext());
            result.put("account", account == null ? JSONObject.NULL : account);
            return result;
        });
    }

    private String requireId(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.trim().isEmpty()) {
            call.reject("No Google Drive backup was selected.", "INVALID_REQUEST");
            return null;
        }
        return id.trim();
    }

    private JSObject toJsObject(JSONObject value) throws Exception {
        return new JSObject(value.toString());
    }

    private interface Operation {
        JSObject execute() throws Exception;
    }

    private void run(PluginCall call, Operation operation) {
        executor.execute(() -> {
            try {
                JSObject result = operation.execute();
                getActivity().runOnUiThread(() -> call.resolve(result));
            } catch (HazriDriveApi.DriveException error) {
                getActivity().runOnUiThread(() -> reject(call, error));
            } catch (IllegalArgumentException error) {
                getActivity().runOnUiThread(() ->
                    call.reject(error.getMessage(), "INVALID_BACKUP")
                );
            } catch (Exception error) {
                getActivity().runOnUiThread(() ->
                    call.reject(
                        "Google Drive backup could not be completed. Your device data is unchanged.",
                        "BACKUP_FAILED"
                    )
                );
            }
        });
    }

    private void reject(PluginCall call, HazriDriveApi.DriveException error) {
        call.reject(error.getMessage(), error.code);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
