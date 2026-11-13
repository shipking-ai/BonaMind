package com.auramind.app;

import androidx.annotation.NonNull;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Receives grades pushed by the paired Wear OS app over the data layer and
 * forwards them to the WearSync plugin (via WearSyncBridge). This runs even
 * while the phone app is in the background.
 */
public class WearSyncListenerService extends WearableListenerService {

    @Override
    public void onDataChanged(@NonNull DataEventBuffer dataEvents) {
        for (DataEvent event : dataEvents) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;
            DataItem item = event.getDataItem();
            if (!WearSyncPlugin.isGradePath(item.getUri().getPath())) continue;
            // The item stays until the app has applied the grade and calls
            // ackGrade: this service also runs while the app is closed, and a
            // grade held only in memory here would die with the process.
            // WearSyncPlugin.replayPendingGrades delivers it later instead.
            WearSyncBridge.emit(WearSyncPlugin.gradeFrom(item));
        }
    }
}
