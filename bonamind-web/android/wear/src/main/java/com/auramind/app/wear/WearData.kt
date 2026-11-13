package com.auramind.app.wear

import com.google.android.gms.wearable.DataMap
import java.net.URLEncoder

const val SYNC_PATH = "/auramind/sync"
const val GRADE_PATH = "/auramind/grade"
const val PAYLOAD_VERSION = 1

data class WearCard(
    val cardId: String,
    val deckId: String,
    val front: String,
    val back: String,
)

data class ReviewPayload(
    val version: Int,
    val sessionId: String,
    val dueCount: Int,
    val reviewedToday: Int,
    val streak: Int,
    val cards: List<WearCard>,
)

data class GradeResult(
    val sessionId: String,
    val cardId: String,
    val rating: Int,
    val timestamp: Long,
)

/**
 * Where one grade is put on the data layer: its own item under GRADE_PATH.
 * A data item is identified by its path, so a second put to the same path
 * replaces the first; with one shared path, grades flushed while the phone
 * was away collapsed into the last one. The card id is encoded so it can't
 * add path segments.
 */
fun gradePath(grade: GradeResult): String =
    "$GRADE_PATH/${grade.timestamp}/${URLEncoder.encode(grade.cardId, "UTF-8")}"

fun ReviewPayload.toDataMap(): DataMap = DataMap().apply {
    putInt("version", version)
    putString("sessionId", sessionId)
    putInt("dueCount", dueCount)
    putInt("reviewedToday", reviewedToday)
    putInt("streak", streak)
    val list = ArrayList<DataMap>()
    cards.forEach { c ->
        list.add(
            DataMap().apply {
                putString("cardId", c.cardId)
                putString("deckId", c.deckId)
                putString("front", c.front)
                putString("back", c.back)
            },
        )
    }
    putDataMapArrayList("cards", list)
}

/**
 * Fraction of the session completed BEFORE the card at [index] is graded:
 * card 0 of 8 shows 0, card 7 of 8 shows 7/8. The bar fills to full only on
 * the AllCaughtUp screen, which is the one moment "done" is true.
 */
fun reviewProgress(index: Int, total: Int): Float {
    if (total <= 0 || index < 0) return 0f
    return (index.coerceAtMost(total).toFloat() / total).coerceIn(0f, 1f)
}

fun DataMap.toReviewPayload(): ReviewPayload? {
    if (getInt("version", -1) != PAYLOAD_VERSION) return null
    val rawCards = getDataMapArrayList("cards") ?: emptyList()
    val cards = rawCards.map {
        WearCard(
            cardId = it.getString("cardId", ""),
            deckId = it.getString("deckId", ""),
            front = it.getString("front", ""),
            back = it.getString("back", ""),
        )
    }
    return ReviewPayload(
        version = getInt("version"),
        sessionId = getString("sessionId", ""),
        dueCount = getInt("dueCount"),
        reviewedToday = getInt("reviewedToday"),
        streak = getInt("streak"),
        cards = cards,
    )
}