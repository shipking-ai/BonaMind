package com.auramind.app;

import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Static bridge between the background WearableListenerService (which receives
 * grade data from the watch) and the WearSync Capacitor plugin (which delivers
 * it to the JS layer). Buffers grades that arrive before the plugin listener
 * is attached so none are lost between process start and WebView load.
 */
public final class WearSyncBridge {
    public interface GradeListener {
        void onGrade(JSObject grade);
    }

    private static volatile GradeListener listener;
    private static final List<JSObject> PENDING = new CopyOnWriteArrayList<>();

    private WearSyncBridge() {}

    public static void setListener(GradeListener l) {
        listener = l;
        if (l != null) {
            List<JSObject> pending = new ArrayList<>(PENDING);
            PENDING.clear();
            for (JSObject grade : pending) {
                l.onGrade(grade);
            }
        }
    }

    public static void emit(JSObject grade) {
        GradeListener l = listener;
        if (l != null) {
            l.onGrade(grade);
        } else {
            PENDING.add(grade);
        }
    }
}
