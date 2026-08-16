package com.hazri.app;

import static org.junit.Assert.assertThrows;

import org.junit.Test;

public final class HazriDriveStoreTest {
    private static final String CHECKSUM =
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Test
    public void acceptsCurrentV3BackupEnvelopeForNativeUpload() {
        HazriDriveStore.validateSnapshotFields("hazri-backup", 3, CHECKSUM);
    }

    @Test
    public void rejectsMalformedBackupEnvelope() {
        assertThrows(
            IllegalArgumentException.class,
            () -> HazriDriveStore.validateSnapshotFields("hazri-backup", 0, CHECKSUM)
        );
    }
}
