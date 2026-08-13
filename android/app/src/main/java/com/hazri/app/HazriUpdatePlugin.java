package com.hazri.app;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "HazriUpdater",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public final class HazriUpdatePlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private HazriUpdateManager.UpdateInfo pendingUpdate;

    @PluginMethod
    public void checkForUpdate(PluginCall call) {
        executor.execute(() -> {
            try {
                HazriUpdateManager.UpdateInfo update = HazriUpdateManager.findAvailableUpdate(
                    getContext()
                );
                if (update == null) {
                    resolve(call, "current");
                    return;
                }
                if (HazriUpdateManager.wasAlreadyNotified(getContext(), update.tag)) {
                    resolve(call, "skipped");
                    return;
                }

                pendingUpdate = update;
                getActivity().runOnUiThread(() -> {
                    if (
                        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        getPermissionState("notifications") != PermissionState.GRANTED
                    ) {
                        requestPermissionForAlias(
                            "notifications",
                            call,
                            "notificationPermissionResult"
                        );
                    } else {
                        notifyAndResolve(call);
                    }
                });
            } catch (Exception ignored) {
                resolve(call, "skipped");
            }
        });
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            notifyAndResolve(call);
        } else {
            HazriUpdateManager.UpdateInfo update = pendingUpdate;
            pendingUpdate = null;
            if (update != null) {
                HazriUpdateManager.markReleaseHandled(getContext(), update.tag);
            }
            resolve(call, "skipped");
        }
    }

    private void notifyAndResolve(PluginCall call) {
        HazriUpdateManager.UpdateInfo update = pendingUpdate;
        pendingUpdate = null;
        boolean notified = update != null &&
            HazriUpdateManager.showUpdateNotification(getContext(), update);
        resolve(call, notified ? "notified" : "skipped");
    }

    private void resolve(PluginCall call, String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
    }
}
