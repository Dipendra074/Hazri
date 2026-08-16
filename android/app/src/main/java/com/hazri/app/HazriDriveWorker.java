package com.hazri.app;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class HazriDriveWorker extends Worker {

    public HazriDriveWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        HazriDriveApi.logStage("WORKER_START attempt=" + getRunAttemptCount());
        if (!HazriDriveStore.isAutomatic(context) || !HazriDriveStore.isConnected(context)) {
            HazriDriveApi.logStage("WORKER_SKIPPED_DISABLED");
            return Result.success();
        }


        if (!HazriDriveStore.isPending(context)
            && HazriDriveStore.snapshotHash(context).equals(HazriDriveStore.lastHash(context))) {
            HazriDriveApi.logStage("WORKER_SKIPPED_NO_CHANGES");
            return Result.success();
        }

        try {
            HazriDriveBackup.uploadPrepared(context);
            HazriDriveApi.logStage("WORKER_SUCCESS");
            return Result.success();
        } catch (HazriDriveApi.DriveException error) {
            HazriDriveApi.logFailure("WORKER", error);
            return error.retryable ? Result.retry() : Result.success();
        } catch (Exception error) {
            HazriDriveApi.logFailure("WORKER", error);
            return Result.retry();
        }
    }
}
