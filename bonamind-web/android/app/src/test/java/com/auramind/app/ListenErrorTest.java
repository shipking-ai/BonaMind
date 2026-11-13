package com.auramind.app;

import static org.junit.Assert.assertEquals;

import android.speech.SpeechRecognizer;

import org.junit.Test;

/**
 * BonaListen reports SpeechRecognizer errors by their Web Speech API names,
 * because nativeRecognition.ts hands useVoiceStudy an object shaped like the
 * browser's recogniser. useVoiceStudy treats "no-speech" as "try again" and
 * "not-allowed" as "ask for the microphone", so a wrong name shows the wrong
 * prompt.
 */
public class ListenErrorTest {
    @Test
    public void silenceIsNoSpeech() {
        assertEquals("no-speech", BonaListenPlugin.webError(SpeechRecognizer.ERROR_NO_MATCH));
        assertEquals("no-speech", BonaListenPlugin.webError(SpeechRecognizer.ERROR_SPEECH_TIMEOUT));
    }

    @Test
    public void missingPermissionIsNotAllowed() {
        assertEquals("not-allowed", BonaListenPlugin.webError(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS));
    }

    @Test
    public void microphoneFailureIsAudioCapture() {
        assertEquals("audio-capture", BonaListenPlugin.webError(SpeechRecognizer.ERROR_AUDIO));
    }

    @Test
    public void connectionProblemsAreNetwork() {
        assertEquals("network", BonaListenPlugin.webError(SpeechRecognizer.ERROR_NETWORK));
        assertEquals("network", BonaListenPlugin.webError(SpeechRecognizer.ERROR_NETWORK_TIMEOUT));
        assertEquals("network", BonaListenPlugin.webError(SpeechRecognizer.ERROR_SERVER));
        assertEquals("network", BonaListenPlugin.webError(10)); // ERROR_TOO_MANY_REQUESTS
        assertEquals("network", BonaListenPlugin.webError(11)); // ERROR_SERVER_DISCONNECTED
    }

    @Test
    public void missingLanguageIsLanguageNotSupported() {
        assertEquals("language-not-supported", BonaListenPlugin.webError(12)); // ERROR_LANGUAGE_NOT_SUPPORTED
        assertEquals("language-not-supported", BonaListenPlugin.webError(13)); // ERROR_LANGUAGE_UNAVAILABLE
    }

    @Test
    public void clientErrorIsAborted() {
        assertEquals("aborted", BonaListenPlugin.webError(SpeechRecognizer.ERROR_CLIENT));
    }

    @Test
    public void anythingElseIsUnknown() {
        assertEquals("unknown", BonaListenPlugin.webError(SpeechRecognizer.ERROR_RECOGNIZER_BUSY));
        assertEquals("unknown", BonaListenPlugin.webError(999));
    }
}
