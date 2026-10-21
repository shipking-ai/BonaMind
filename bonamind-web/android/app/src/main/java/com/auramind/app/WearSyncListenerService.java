package com.auramind.app;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
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
            if (!WearSyncPlugin.GRADE_PATH.equals(item.getUri().getPath())) continue;
            DataMap dm = DataMapItem.fromDataItem(item).getDataMap();
            JSObject grade = new JSObject();
            grade.put("sessionId", dm.getString("sessionId", ""));
            grade.put("cardId", dm.getString("cardId", ""));
            grade.put("rating", dm.getInt("rating", 0));
            grade.put("timestamp", dm.getLong("timestamp", 0L));
            WearSyncBridge.emit(grade);
        }
    }
}
