/**
 * useAudioRecorder — records microphone audio via the MediaRecorder API.
 *
 * Returns the finished Blob (webm) ready for Whisper transcription, plus
 * live capture state. Degrades cleanly when the mic is denied or the API
 * is unavailable (insecure context / older Safari).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecorderState {
  recording: boolean;
  supported: boolean;
  error: string | null;
  blob: Blob | null;
  durationMs: number;
  start: () => Promise<void>;
  /** Stops capture and resolves with the finished Blob (or null). */
  stop: () => Promise<Blob | null>;
  cancel: () => void;
  clear: () => void;
}

const MIME_TYPE = 'audio/webm';

/** Maps getUserMedia failures to copy written for a student, not a dev. */
function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'Microphone access is blocked. Allow the mic for this site in your browser’s address-bar icon, then try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No microphone found. Check that one is connected and not in use by another app.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'Your microphone is busy or unavailable. Close other apps using it, then try again.';
      case 'SecurityError':
        return 'Microphone access requires a secure (HTTPS) connection.';
      // 'NotAllowedError' is handled at the top of this switch; a second
      // case for it here was unreachable.
      case 'OverconstrainedError':
        return 'No microphone matches the audio settings requested.';
    }
  }
  const msg = err instanceof Error ? err.message : '';
  if (/denied|blocked|permission/i.test(msg)) {
    return 'Microphone access is blocked. Allow the mic for this site in your browser’s address-bar icon, then try again.';
  }
  return msg || 'Microphone access denied or unavailable.';
}

export function useAudioRecorder(maxDurationMs = 15 * 60 * 1000): AudioRecorderState {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(
    typeof navigator !== 'undefined' && typeof MediaRecorder !== 'undefined' &&
    (navigator.mediaDevices?.getUserMedia != null),
  );
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  // Resolved by the pending `stop()` when MediaRecorder fires `onstop`.
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  // Guards re-entrant stops (auto-stop timer vs explicit user stop).
  const stoppingRef = useRef(false);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      cleanupStream();
    };
  }, [cleanupStream]);

  const stop = useCallback((): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive' || stoppingRef.current) {
      return Promise.resolve(blob ?? null);
    }
    stoppingRef.current = true;
    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      try {
        recorder.stop();
      } catch {
        stoppingRef.current = false;
        stopResolveRef.current = null;
        resolve(null);
      }
    });
  }, [blob]);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    stoppingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = MediaRecorder.isTypeSupported(MIME_TYPE) ? MIME_TYPE : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stoppingRef.current = false;
        const full = new Blob(chunksRef.current, { type: recorder.mimeType || MIME_TYPE });
        setBlob(full);
        cleanupStream();
        setRecording(false);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        // Resolve any pending stop() promise with the finished blob.
        stopResolveRef.current?.(full);
        stopResolveRef.current = null;
      };

      recorder.onerror = () => {
        stoppingRef.current = false;
        setError('Recording failed — please try again.');
        setRecording(false);
        cleanupStream();
        stopResolveRef.current?.(null);
        stopResolveRef.current = null;
      };

      recorder.start(250);
      startTimeRef.current = Date.now();
      setRecording(true);

      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setDurationMs(elapsed);
        if (elapsed >= maxDurationMs && recorderRef.current?.state === 'recording') {
          void stop();
        }
      }, 1000);
    } catch (e) {
      setError(describeMicError(e));
      // `supported` reflects API availability, not permission — keep it
      // true so a later retry is possible after the user grants access.
      setSupported(
        typeof navigator !== 'undefined' && typeof MediaRecorder !== 'undefined' &&
        (navigator.mediaDevices?.getUserMedia != null),
      );
      setRecording(false);
    }
  }, [maxDurationMs, cleanupStream, stop]);

  const cancel = useCallback(() => {
    stoppingRef.current = true;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      /* no-op */
    }
    chunksRef.current = [];
    setRecording(false);
    setBlob(null);
    setDurationMs(0);
    cleanupStream();
    stopResolveRef.current?.(null);
    stopResolveRef.current = null;
    stoppingRef.current = false;
  }, [cleanupStream]);

  const clear = useCallback(() => {
    setBlob(null);
    setDurationMs(0);
  }, []);

  return { recording, supported, error, blob, durationMs, start, stop, cancel, clear };
}