package com.hazri.app;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class HazriUpdateDownloadReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
        long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
        String filename = HazriUpdateManager.completedDownloadFile(context, downloadId);
        if (filename == null) return;

        Intent install = new Intent(context, HazriUpdateInstallActivity.class)
            .putExtra(HazriUpdateManager.EXTRA_DOWNLOAD_FILE, filename)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(install);
    }
}
