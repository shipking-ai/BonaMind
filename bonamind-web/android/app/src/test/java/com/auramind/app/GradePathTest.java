package com.auramind.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The watch puts each grade at its own path under /auramind/grade, because a
 * data item at a reused path is replaced by the next put. The phone must take
 * every one of them, and the bare path from earlier watch builds too.
 */
public class GradePathTest {
    @Test
    public void takesEachGradesOwnPath() {
        assertTrue(WearSyncPlugin.isGradePath("/auramind/grade/1731500000000/card-1"));
    }

    @Test
    public void takesTheBarePath() {
        assertTrue(WearSyncPlugin.isGradePath("/auramind/grade"));
    }

    @Test
    public void ignoresOtherPaths() {
        assertFalse(WearSyncPlugin.isGradePath("/auramind/sync"));
        assertFalse(WearSyncPlugin.isGradePath("/auramind/grades"));
        assertFalse(WearSyncPlugin.isGradePath(null));
    }
}
