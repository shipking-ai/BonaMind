/**
 * useVoiceStudy — failure surfacing.
 *
 * The previous implementation did `rec.onerror = () => setListening(false)`,
 * so every failure was indistinguishable from a normal stop. A student who
 * denied the microphone prompt saw a button that simply did nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceStudy } from '../hooks/useVoiceStudy';

/** Captures the recogniser the hook constructs so tests can drive it. */
let latest: FakeRecognition | null = null;

/** Records the most recently constructed recogniser for the active test. */
function register(rec: FakeRecognition) {
  latest = rec;
}

class FakeRecognition {
  lang = '';
  continuous = false;
  interimResults = false;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  constructor() {
    register(this);
  }
}

/**
 * Patches the speech APIs onto the real jsdom `window`.
 *
 * Deliberately not `vi.stubGlobal('window', …)`: replacing the whole object
 * detaches React's own references, and the hook's unmount cleanup then
 * throws reading `window.speechSynthesis`.
 */
function withSpeech({ stt = true }: { stt?: boolean } = {}) {
  const w = window as unknown as Record<string, unknown>;
  w.speechSynthesis = {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  };
  if (stt) w.SpeechRecognition = FakeRecognition;
}

beforeEach(() => {
  latest = null;
});

afterEach(() => {
  const w = window as unknown as Record<string, unknown>;
  delete w.speechSynthesis;
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  vi.restoreAllMocks();
});

describe('useVoiceStudy — unsupported browser', () => {
  it('surfaces a typed error instead of silently doing nothing', () => {
    withSpeech({ stt: false });
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceStudy({ onError }));

    expect(result.current.sttSupported).toBe(false);

    act(() => result.current.startListening());

    expect(result.current.error?.code).toBe('unsupported');
    expect(onError).toHaveBeenCalledTimes(1);
    // Never claims to be listening when it cannot.
    expect(result.current.listening).toBe(false);
  });

  it('still reports TTS as available so playback keeps working', () => {
    withSpeech({ stt: false });
    const { result } = renderHook(() => useVoiceStudy());
    expect(result.current.ttsSupported).toBe(true);
  });
});

describe('useVoiceStudy — recognition errors', () => {
  it('maps a denied microphone to a permission error', () => {
    withSpeech();
    const onError = vi.fn();
    const { result } = renderHook(() => useVoiceStudy({ onError }));

    act(() => result.current.startListening());
    act(() => latest!.onerror!({ error: 'not-allowed' }));

    expect(result.current.error?.needsPermission).toBe(true);
    expect(result.current.error?.recoverable).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('maps silence to a recoverable error', () => {
    withSpeech();
    const { result } = renderHook(() => useVoiceStudy());

    act(() => result.current.startListening());
    act(() => latest!.onerror!({ error: 'no-speech' }));

    expect(result.current.error?.code).toBe('no-speech');
    expect(result.current.error?.recoverable).toBe(true);
  });

  it('clears a previous error when listening restarts', () => {
    withSpeech();
    const { result } = renderHook(() => useVoiceStudy());

    act(() => result.current.startListening());
    act(() => latest!.onerror!({ error: 'network' }));
    expect(result.current.error).not.toBeNull();

    act(() => result.current.startListening());
    expect(result.current.error).toBeNull();
  });

  it('clearError resets the surfaced failure', () => {
    withSpeech();
    const { result } = renderHook(() => useVoiceStudy());

    act(() => result.current.startListening());
    act(() => latest!.onerror!({ error: 'audio-capture' }));
    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });
});
