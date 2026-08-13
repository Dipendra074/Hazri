package com.hazri.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class HazriUpdateActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!HazriUpdateManager.ACTION_DOWNLOAD_UPDATE.equals(intent.getAction())) return;
        HazriUpdateManager.startDownload(
            context,
            intent.getStringExtra(HazriUpdateManager.EXTRA_APK_URL),
            intent.getStringExtra(HazriUpdateManager.EXTRA_APK_NAME),
            intent.getStringExtra(HazriUpdateManager.EXTRA_VERSION)
        );
    }
}
