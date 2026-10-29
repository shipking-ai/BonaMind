import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createRecognition,
  describeSpeechError,
  getSpeechCapabilities,
  UNSUPPORTED_STT_ERROR,
  type SpeechError,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../services/voice/speechEngine';

interface SpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
}

interface SpeechRecognitionState {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  /** Friendly, user-actionable message or the raw browser code. */
  error: string | null;
}

const useSpeechRecognition = (options: SpeechRecognitionOptions = {}) => {
  const { continuous = false, interimResults = true, lang = 'en-US' } = options;
  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    transcript: '',
    interimTranscript: '',
    isSupported: false,
    error: null,
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mountedRef = useRef(true);
  // Accumulator so onresult closures never read stale state.
  const transcriptRef = useRef('');

  const supported = typeof window !== 'undefined' && getSpeechCapabilities().stt;

  useEffect(() => {
    setState(s => ({ ...s, isSupported: supported }));
  }, [supported]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      const active = recognitionRef.current;
      recognitionRef.current = null;
      if (active) {
        try {
          active.stop();
        } catch { /* already stopped */ }
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!supported) {
      setState(s => ({ ...s, isSupported: false, error: UNSUPPORTED_STT_ERROR.message }));
      return;
    }

    const recognition = createRecognition({ lang, continuous, interimResults });
    if (!recognition) {
      setState(s => ({ ...s, isSupported: false, error: UNSUPPORTED_STT_ERROR.message }));
      return;
    }

    recognitionRef.current = recognition;
    transcriptRef.current = '';
    setState(s => ({ ...s, isListening: true, transcript: '', interimTranscript: '', error: null }));

    recognition.onstart = () => {
      if (mountedRef.current) setState(s => ({ ...s, isListening: true, error: null }));
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      if (!mountedRef.current) return;
      let finalTranscript = transcriptRef.current;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      transcriptRef.current = finalTranscript;
      setState(prev => ({ ...prev, transcript: finalTranscript, interimTranscript: interim, isListening: true }));
    };

    recognition.onerror = (event: { error: string; message?: string }) => {
      if (!mountedRef.current) return;
      const err: SpeechError = describeSpeechError(event.error);
      setState(prev => ({ ...prev, error: err.message, isListening: false }));
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;
      recognitionRef.current = null;
      setState(prev => ({ ...prev, isListening: false, interimTranscript: '' }));
    };

    try {
      recognition.start();
    } catch {
      if (mountedRef.current) {
        setState(prev => ({ ...prev, isListening: false }));
      }
    }
  }, [supported, lang, continuous, interimResults]);

  const stopListening = useCallback(() => {
    const active = recognitionRef.current;
    recognitionRef.current = null;
    if (active) {
      try {
        active.stop();
      } catch { /* already stopped */ }
    }
    setState(prev => ({ ...prev, isListening: false }));
  }, []);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = '';
    setState(prev => ({ ...prev, transcript: '', interimTranscript: '' }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    resetTranscript,
  };
};

export default useSpeechRecognition;