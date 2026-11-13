package com.auramind.app;

import android.net.Uri;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.tasks.Task;

import org.json.JSONObject;

import java.util.ArrayList;

/**
 * WearSync — exposes the Wear OS data layer to the BonaMind JS app.
 *
 * - pushReviewPayload(payload): pushes today's due cards to the watch.
 * - onGradeResult event: fired when the watch sends a grade back.
 * - ackGrade({uri}): the app has applied a grade; drop its item.
 * - replayPendingGrades(): re-fire onGradeResult for every grade item still
 *   on the data layer.
 *
 * A grade's item stays on the data layer until the app acknowledges it. The
 * listener service can wake while the app is closed, and anything it only
 * held in memory died with the process; now the app collects those grades
 * the next time it has cards loaded.
 *
 * No-op when no watch is paired (Wear data-layer calls simply yield nothing).
 */
@CapacitorPlugin(name = "WearSync")
public class WearSyncPlugin extends Plugin {

    public static final String SYNC_PATH = "/auramind/sync";
    public static final String GRADE_PATH = "/auramind/grade";

    /**
     * True for a grade from the watch. Each grade has its own item under
     * GRADE_PATH (/auramind/grade/<time>/<card>), because a data item at a
     * reused path is replaced by the next put; the bare path is what earlier
     * watch builds used.
     */
    static boolean isGradePath(String path) {
        return path != null && (path.equals(GRADE_PATH) || path.startsWith(GRADE_PATH + "/"));
    }

    /** The grade a data item carries, with the item's uri for ackGrade. */
    static JSObject gradeFrom(DataItem item) {
        DataMap dm = DataMapItem.fromDataItem(item).getDataMap();
        JSObject grade = new JSObject();
        grade.put("sessionId", dm.getString("sessionId", ""));
        grade.put("cardId", dm.getString("cardId", ""));
        grade.put("rating", dm.getInt("rating", 0));
        grade.put("timestamp", dm.getLong("timestamp", 0L));
        grade.put("uri", item.getUri().toString());
        return grade;
    }

    @Override
    public void load() {
        super.load();
        WearSyncBridge.setListener(this::emitGrade);
    }

    private void emitGrade(JSObject grade) {
        notifyListeners("onGradeResult", grade, true);
    }

    @PluginMethod
    public void ackGrade(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || !isGradePath(Uri.parse(uri).getPath())) {
            call.reject("a grade uri is required");
            return;
        }
        Wearable.getDataClient(getContext())
            .deleteDataItems(Uri.parse(uri))
            .addOnSuccessListener(n -> call.resolve(new JSObject().put("deleted", n)))
            .addOnFailureListener(e -> call.reject("ack failed: " + e.getMessage()));
    }

    @PluginMethod
    public void replayPendingGrades(PluginCall call) {
        // No authority: grade items from every connected node.
        Uri prefix = new Uri.Builder().scheme(PutDataRequest.WEAR_URI_SCHEME).path(GRADE_PATH).build();
        Wearable.getDataClient(getContext())
            .getDataItems(prefix, DataClient.FILTER_PREFIX)
            .addOnSuccessListener(buffer -> {
                int count = 0;
                try {
                    for (DataItem item : buffer) {
                        if (!isGradePath(item.getUri().getPath())) continue;
                        emitGrade(gradeFrom(item));
                        count++;
                    }
                } finally {
                    buffer.release();
                }
                call.resolve(new JSObject().put("count", count));
            })
            .addOnFailureListener(e -> call.reject("replay failed: " + e.getMessage()));
    }

    @PluginMethod
    public void pushReviewPayload(PluginCall call) {
        JSObject payload = call.getObject("payload");
        if (payload == null) {
            call.reject("payload is required");
            return;
        }

        PutDataMapRequest req = PutDataMapRequest.create(SYNC_PATH);
        DataMap dm = req.getDataMap();
        dm.putInt("version", payload.optInt("version", 1));
        dm.putString("sessionId", payload.optString("sessionId", ""));
        dm.putInt("dueCount", payload.optInt("dueCount", 0));
        dm.putInt("reviewedToday", payload.optInt("reviewedToday", 0));
        dm.putInt("streak", payload.optInt("streak", 0));

        ArrayList<DataMap> cards = new ArrayList<>();
        if (payload.has("cards")) {
            try {
                org.json.JSONArray arr = payload.getJSONArray("cards");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject raw = arr.getJSONObject(i);
                    JSObject c = JSObject.fromJSONObject(raw);
                    DataMap cm = new DataMap();
                    cm.putString("cardId", c.optString("cardId", ""));
                    cm.putString("deckId", c.optString("deckId", ""));
                    cm.putString("front", c.optString("front", ""));
                    cm.putString("back", c.optString("back", ""));
                    cards.add(cm);
                }
            } catch (Exception e) {
                call.reject("failed to parse cards: " + e.getMessage());
                return;
            }
        }
        dm.putDataMapArrayList("cards", cards);

        DataClient client = Wearable.getDataClient(getActivity());
        // Urgent: the watch should show the new deck now, not when the system
        // next batches non-urgent items to save battery.
        Task<DataItem> put = client.putDataItem(req.asPutDataRequest().setUrgent());
        put.addOnSuccessListener(item -> call.resolve(new JSObject().put("ok", true)))
           .addOnFailureListener(e -> call.reject("push failed: " + e.getMessage()));
    }
}
