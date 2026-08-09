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
        if (!HazriDriveStore.isAutomatic(context) || !HazriDriveStore.isConnected(context)) {
            return Result.success();
        }


        if (!HazriDriveStore.isPending(context)
            && HazriDriveStore.snapshotHash(context).equals(HazriDriveStore.lastHash(context))) {
            return Result.success();
        }

        try {
            HazriDriveBackup.uploadPrepared(context);
            return Result.success();
        } catch (HazriDriveApi.DriveException error) {
            return error.retryable ? Result.retry() : Result.success();
        } catch (Exception error) {
            return getRunAttemptCount() < 4 ? Result.retry() : Result.failure();
        }
    }
}