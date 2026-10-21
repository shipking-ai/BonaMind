/**
 * useVoiceStudy — transcript accumulation and lifecycle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceStudy } from '../hooks/useVoiceStudy';

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

/** Builds a SpeechRecognition result event with the shape the hook reads. */
function resultEvent(chunks: { text: string; final: boolean }[], resultIndex = 0) {
  const results = chunks.map((c) => {
    const alt = [{ transcript: c.text, confidence: 0.9 }] as unknown as ArrayLike<{
      transcript: string;
      confidence: number;
    }> & { isFinal: boolean };
    (alt as { isFinal: boolean }).isFinal = c.final;
    return alt;
  });
  return { resultIndex, results };
}

function withSpeech() {
  const w = window as unknown as Record<string, unknown>;
  w.speechSynthesis = {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  };
  w.SpeechRecognition = FakeRecognition;
}

beforeEach(() => {
  latest = null;
  withSpeech();
});

afterEach(() => {
  const w = window as unknown as Record<string, unknown>;
  delete w.speechSynthesis;
  delete w.SpeechRecognition;
  vi.restoreAllMocks();
});

describe('transcript', () => {
  it('exposes interim text separately from finalised text', () => {
    const { result } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());

    act(() => latest!.onresult!(resultEvent([{ text: 'the mitochon', final: false }])));

    expect(result.current.interimTranscript).toBe('the mitochon');
    expect(result.current.transcript).toBe('');
  });

  it('accumulates finalised chunks across results', () => {
    const { result } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());

    act(() => latest!.onresult!(resultEvent([{ text: 'the powerhouse ', final: true }])));

    // `results` is cumulative for the session and `resultIndex` marks the
    // first entry that changed, so the second event carries both entries.
    act(() =>
      latest!.onresult!(
        resultEvent(
          [
            { text: 'the powerhouse ', final: true },
            { text: 'of the cell', final: true },
          ],
          1,
        ),
      ),
    );

    expect(result.current.transcript).toBe('the powerhouse of the cell');
  });

  it('clears interim text once the engine ends', () => {
    const { result } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());
    act(() => latest!.onresult!(resultEvent([{ text: 'partial', final: false }])));

    act(() => latest!.onend!());

    expect(result.current.interimTranscript).toBe('');
    expect(result.current.listening).toBe(false);
  });

  it('resets the transcript when a new listening session starts', () => {
    const { result } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());
    act(() => latest!.onresult!(resultEvent([{ text: 'first answer', final: true }])));
    act(() => latest!.onend!());

    act(() => result.current.startListening());

    expect(result.current.transcript).toBe('');
  });
});

describe('lifecycle', () => {
  it('requests continuous recognition by default', () => {
    // Non-continuous recognition stops at every natural pause, which breaks
    // the hands-free commute case the product is positioned on.
    const { result } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());
    expect(latest!.continuous).toBe(true);
  });

  it('honours an explicit continuous:false', () => {
    const { result } = renderHook(() => useVoiceStudy({ continuous: false }));
    act(() => result.current.startListening());
    expect(latest!.continuous).toBe(false);
  });

  it('does not emit a transcript when the user stopped deliberately', () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceStudy({ onTranscript }));

    act(() => result.current.startListening());
    act(() => latest!.onresult!(resultEvent([{ text: 'an answer', final: true }])));
    act(() => result.current.stopListening());

    // stopListening() is a manual stop; the caller already has the text.
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('stops the recogniser on unmount', () => {
    const { result, unmount } = renderHook(() => useVoiceStudy());
    act(() => result.current.startListening());
    const rec = latest!;

    unmount();

    expect(rec.stop).toHaveBeenCalled();
  });
});
