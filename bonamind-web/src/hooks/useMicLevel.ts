import { useEffect, useRef, useState } from 'react';

/**
 * useMicLevel — normalised microphone amplitude, 0..1, while `active`.
 *
 * Exists so the listening visual reflects the actual room rather than a
 * decorative loop: if the student says nothing, the bars stay at their
 * floor. That honesty is the point — a waveform that dances during
 * silence trains people to distrust it.
 *
 * Implementation notes:
 *   - Uses RMS over the time-domain buffer, not `getByteFrequencyData`
 *     peaks, because RMS tracks perceived loudness and doesn't spike on
 *     sibilance.
 *   - The stream, AudioContext and rAF loop are all torn down when
 *     `active` goes false, so the mic indicator in the browser tab
 *     clears the moment listening stops.
 *   - Failure is silent and non-fatal: recognition owns the permission
 *     UX, and metering must never be the thing that breaks a session.
 */
export function useMicLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setLevel(0);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => { /* already closed */ });
      stream = null;
      ctx = null;
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const AudioCtor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return;

        ctx = new AudioCtor();
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        // Small FFT: we want responsiveness, not spectral detail.
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const buf = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          // Speech RMS sits around 0.02–0.2; scale that into 0..1 and clamp
          // so a shout doesn't peg the meter for the rest of the session.
          setLevel(Math.min(1, rms * 6));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        /* Metering is optional; recognition reports permission problems. */
      });

    return () => {
      cancelled = true;
      stop();
      setLevel(0);
    };
  }, [active]);

  return level;
}
