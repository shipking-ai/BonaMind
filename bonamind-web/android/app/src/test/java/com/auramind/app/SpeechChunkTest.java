package com.auramind.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/**
 * Text-to-speech engines reject input longer than getMaxSpeechInputLength(),
 * so BonaSpeechEngine splits long text (a whole lesson read aloud) into
 * pieces. A piece over the limit is refused by the engine and reading stops.
 */
public class SpeechChunkTest {
    private static final String PROSE = "The quick brown fox jumps over the lazy dog. "
            + "Pack my box with five dozen liquor jugs! How vexingly quick daft zebras jump? "
            + "Sphinx of black quartz; judge my vow, and so on and so forth.";

    @Test
    public void shortTextIsOnePiece() {
        assertEquals(Collections.singletonList("Hello there."), BonaSpeechEngine.chunk("Hello there.", 50));
    }

    @Test
    public void emptyOrBlankTextIsNothing() {
        assertTrue(BonaSpeechEngine.chunk(null, 50).isEmpty());
        assertTrue(BonaSpeechEngine.chunk("   \n\t ", 50).isEmpty());
    }

    @Test
    public void collapsesWhitespace() {
        assertEquals(Collections.singletonList("one two three"), BonaSpeechEngine.chunk("  one\n\ntwo \t three ", 50));
    }

    @Test
    public void splitsAtSentenceEnds() {
        assertEquals(Arrays.asList("First sentence here.", "Second sentence here."),
                BonaSpeechEngine.chunk("First sentence here. Second sentence here.", 30));
    }

    @Test
    public void prefersASentenceEndOverAComma() {
        List<String> pieces = BonaSpeechEngine.chunk("Alpha beta gamma. Delta, epsilon zeta eta", 30);
        assertEquals("Alpha beta gamma.", pieces.get(0));
    }

    @Test
    public void cutsAWordWithNoSpacesAtTheLimit() {
        assertEquals(Arrays.asList(repeat('x', 10), repeat('x', 10), repeat('x', 5)),
                BonaSpeechEngine.chunk(repeat('x', 25), 10));
    }

    @Test
    public void neverReturnsAPieceOverTheLimit() {
        // A sentence end sitting exactly at the limit: cutting after it keeps
        // the full stop, one character past max.
        String edge = repeat('a', 9) + ". " + repeat('b', 20);
        for (String piece : BonaSpeechEngine.chunk(edge, 9)) {
            assertTrue("piece of " + piece.length() + " chars: " + piece, piece.length() <= 9);
        }
        for (int max = 8; max <= 60; max++) {
            for (String piece : BonaSpeechEngine.chunk(PROSE, max)) {
                assertTrue("max " + max + ", piece of " + piece.length() + ": " + piece, piece.length() <= max);
            }
        }
    }

    @Test
    public void losesNoText() {
        // Pieces may split inside a long word when no space falls in the
        // second half of the limit; only the spaces between pieces may go.
        String expected = PROSE.replace(" ", "");
        for (int max = 8; max <= 60; max++) {
            assertEquals("max " + max, expected, String.join("", BonaSpeechEngine.chunk(PROSE, max)).replace(" ", ""));
        }
    }

    private static String repeat(char c, int n) {
        char[] out = new char[n];
        Arrays.fill(out, c);
        return new String(out);
    }
}
