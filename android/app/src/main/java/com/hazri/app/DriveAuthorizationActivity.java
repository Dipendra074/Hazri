package com.hazri.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Bundle;
import androidx.annotation.Nullable;

public final class DriveAuthorizationActivity extends Activity {

    static final String EXTRA_PENDING_INTENT = "pending_intent";
    private static final int AUTHORIZATION_REQUEST = 9042;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            return;
        }

        PendingIntent pendingIntent = getIntent().getParcelableExtra(EXTRA_PENDING_INTENT);
        if (pendingIntent == null) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        try {
            startIntentSenderForResult(
                pendingIntent.getIntentSender(),
                AUTHORIZATION_REQUEST,
                null,
                0,
                0,
                0
            );
        } catch (IntentSender.SendIntentException error) {
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != AUTHORIZATION_REQUEST) {
            return;
        }
        setResult(resultCode, data);
        finish();
    }
}