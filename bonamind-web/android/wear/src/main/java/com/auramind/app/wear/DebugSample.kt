package com.auramind.app.wear

import android.content.Context
import android.content.pm.ApplicationInfo

/**
 * Debug-only sample deck so the review flow can be exercised on an emulator
 * without a paired phone. Only reachable in debuggable builds — the entry
 * point (the IdleScreen button) is never shown in release builds.
 */
object DebugSample {
    fun isDebuggable(context: Context): Boolean =
        context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    fun buildSamplePayload(): ReviewPayload = ReviewPayload(
        version = PAYLOAD_VERSION,
        sessionId = "debug-sample",
        dueCount = 4,
        reviewedToday = 2,
        streak = 12,
        cards = listOf(
            WearCard(
                cardId = "sample-1",
                deckId = "deck-demo",
                front = "What is spaced repetition?",
                back = "Reviewing material at increasing intervals to combat the forgetting curve and move facts into long-term memory.",
            ),
            WearCard(
                cardId = "sample-2",
                deckId = "deck-demo",
                front = "What does the forgetting curve describe?",
                back = "Memory retention declines exponentially over time unless information is actively reviewed.",
            ),
            WearCard(
                cardId = "sample-3",
                deckId = "deck-demo",
                front = "What is the FSRS scheduler?",
                back = "A modern spaced-repetition algorithm that fits a model to your historical recall to schedule reviews.",
            ),
            WearCard(
                cardId = "sample-4",
                deckId = "deck-demo",
                front = "Why grade with Again / Hard / Good / Easy?",
                back = "Each rating steers the next interval: Again resets, Hard shrinks, Good is the baseline, Easy stretches it.",
            ),
        ),
    )
}