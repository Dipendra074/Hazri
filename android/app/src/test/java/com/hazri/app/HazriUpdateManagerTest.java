package com.hazri.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class HazriUpdateManagerTest {
    @Test
    public void sameInstalledAndReleaseVersionDoesNotUpdate() {
        assertFalse(HazriUpdateManager.isNewerVersion("1.0.1", "1.0.1"));
        assertFalse(HazriUpdateManager.isNewerVersion("1.0.1", "v1.0.1"));
    }

    @Test
    public void newerPatchReleaseDoesUpdate() {
        assertTrue(HazriUpdateManager.isNewerVersion("1.0.1", "1.0.2"));
        assertTrue(HazriUpdateManager.isNewerVersion("1.0.1", "v1.0.2"));
    }

    @Test
    public void olderOrMalformedReleaseDoesNotUpdate() {
        assertFalse(HazriUpdateManager.isNewerVersion("1.0.1", "1.0.0"));
        assertFalse(HazriUpdateManager.isNewerVersion("1.0.1", "latest"));
    }
}
