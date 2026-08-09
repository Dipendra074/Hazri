package com.hazri.app;

import android.content.Context;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

final class HazriDriveScheduler {

    private static final String PERIODIC_WORK = "hazri-drive-periodic-backup";
    private static final String PENDING_WORK = "hazri-drive-pending-backup";

    private HazriDriveScheduler() {}

    static void reconcile(Context context) {
        if (HazriDriveStore.isAutomatic(context) && HazriDriveStore.isConnected(context)) {
            schedulePeriodic(context);
            if (HazriDriveStore.isPending(context)) {
                enqueuePending(context);
            }
        } else {
            cancel(context);
        }
    }

    static void schedulePeriodic(Context context) {
        long days = "weekly".equals(HazriDriveStore.frequency(context)) ? 7L : 1L;
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            HazriDriveWorker.class,
            days,
            TimeUnit.DAYS
        )
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30L, TimeUnit.MINUTES)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    static void enqueuePending(Context context) {
        if (!HazriDriveStore.isAutomatic(context)
            || !HazriDriveStore.isConnected(context)
            || !HazriDriveStore.isAutomaticBackupDue(context)) {
            return;
        }
        enqueueConnectedWork(context);
    }

    static void enqueuePendingNow(Context context) {
        if (!HazriDriveStore.isAutomatic(context) || !HazriDriveStore.isConnected(context)) {
            return;
        }
        enqueueConnectedWork(context);
    }

    private static void enqueueConnectedWork(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(HazriDriveWorker.class)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30L, TimeUnit.MINUTES)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            PENDING_WORK,
            ExistingWorkPolicy.KEEP,
            request
        );
    }

    static void cancel(Context context) {
        WorkManager manager = WorkManager.getInstance(context);
        manager.cancelUniqueWork(PERIODIC_WORK);
        manager.cancelUniqueWork(PENDING_WORK);
    }
}