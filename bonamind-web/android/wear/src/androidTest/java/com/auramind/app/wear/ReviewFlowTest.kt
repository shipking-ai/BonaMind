package com.auramind.app.wear

import android.content.Context
import android.net.Uri
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/**
 * End to end on a Wear OS emulator, from the first screen to the data layer:
 * load the debug sample deck, review all four cards with each rating, and
 * check that four separate grades are waiting on the data layer for the
 * phone, with the right ratings.
 *
 * No phone is paired, so the grades stay on the watch's data layer, which is
 * exactly where the phone's listener picks them up once it connects.
 */
@RunWith(AndroidJUnit4::class)
class ReviewFlowTest {

    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val dataClient: DataClient = Wearable.getDataClient(context)

    /** Every node's items under GRADE_PATH (no host = all nodes). */
    private val allGrades: Uri = Uri.Builder().scheme("wear").path(GRADE_PATH).build()

    @Before
    fun startClean() {
        Tasks.await(dataClient.deleteDataItems(allGrades, DataClient.FILTER_PREFIX), 20, TimeUnit.SECONDS)
        context.getSharedPreferences("bonamind_wear_grade_queue", Context.MODE_PRIVATE).edit().clear().commit()
        compose.runOnUiThread {
            WearState.payload.value = null
            WearState.refreshQueue(context)
        }
    }

    @Test
    fun reviewsTheSampleDeckAndQueuesEveryGradeForThePhone() {
        tap("Dev: Load sample deck")
        tap("Start review")

        val cards = DebugSample.buildSamplePayload().cards
        val ratings = listOf("Again", "Hard", "Good", "Easy")
        cards.forEachIndexed { i, card ->
            see("Card ${i + 1} of ${cards.size}")
            see(card.front)
            tap("Reveal answer")
            see(card.back)
            tap(ratings[i])
        }
        see("All caught up")

        // Every grade is its own data item: none replaced another.
        val expected = cards.mapIndexed { i, card -> card.cardId to i }.toMap()
        var found = emptyMap<String, Int>()
        val deadline = System.currentTimeMillis() + 30_000
        while (System.currentTimeMillis() < deadline) {
            found = gradesOnDataLayer()
            if (found.size >= expected.size) break
            Thread.sleep(250)
        }
        assertEquals(expected, found)

        // And the watch's own retry queue has handed them all over.
        compose.waitUntil(10_000) { GradeQueue.size(context) == 0 }
    }

    private fun gradesOnDataLayer(): Map<String, Int> {
        val items = Tasks.await(dataClient.getDataItems(allGrades, DataClient.FILTER_PREFIX), 10, TimeUnit.SECONDS)
        try {
            return items.associate { item ->
                val map = DataMapItem.fromDataItem(item).dataMap
                map.getString("cardId", "") to map.getInt("rating", -1)
            }
        } finally {
            items.release()
        }
    }

    /** Scrolls the round screen's list to the text if needed, then taps it. */
    private fun tap(text: String) {
        show(text)
        compose.onNodeWithText(text).performClick()
        compose.waitForIdle()
    }

    private fun see(text: String) {
        show(text)
        compose.onNodeWithText(text).assertExists()
    }

    private fun show(text: String) {
        compose.waitUntil(10_000) {
            compose.onAllNodes(hasScrollToNodeAction()).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText(text))
    }
}
