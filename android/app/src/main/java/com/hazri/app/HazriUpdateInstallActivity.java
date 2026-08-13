package com.hazri.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;
import java.io.File;

public final class HazriUpdateInstallActivity extends Activity {

    private static final int UNKNOWN_SOURCES_REQUEST = 7021;
    private String filename;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        filename = getIntent().getStringExtra(HazriUpdateManager.EXTRA_DOWNLOAD_FILE);
        if (filename == null || filename.contains("/") || filename.contains("\\")) {
            finish();
            return;
        }

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !getPackageManager().canRequestPackageInstalls()
        ) {
            Intent permission = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            startActivityForResult(permission, UNKNOWN_SOURCES_REQUEST);
            return;
        }
        openPackageInstaller();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != UNKNOWN_SOURCES_REQUEST) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
            openPackageInstaller();
        } else {
            finish();
        }
    }

    private void openPackageInstaller() {
        File downloads = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (downloads == null) {
            finish();
            return;
        }
        File apk = new File(downloads, filename);
        if (!apk.isFile()) {
            finish();
            return;
        }

        Uri apkUri = FileProvider.getUriForFile(
            this,
            getPackageName() + ".fileprovider",
            apk
        );
        Intent installer = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(apkUri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(installer);
        } catch (ActivityNotFoundException ignored) {
            // A device without a package installer cannot complete a sideload.
        }
        finish();
    }
}
