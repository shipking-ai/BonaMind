/**
 * speechEngine — voice loading.
 *
 * Guards the bug that made voice selection silently never work: Chrome and
 * Edge return an EMPTY array from `speechSynthesis.getVoices()` on the first
 * call, and only populate it later via the `voiceschanged` event. Code that
 * read voices once at mount always got `[]` and fell back to the default
 * system voice, ignoring the user's choice on every session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadVoices, pickPreferredVoice, resetVoiceCache } from '../services/voice/speechEngine';

type Listener = () => void;

/** Minimal speechSynthesis double with controllable voice availability. */
function stubSynthesis(initial: unknown[] = []) {
  let voices = initial;
  const listeners: Record<string, Listener[]> = {};

  const synth = {
    getVoices: () => voices,
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener: (type: string, fn: Listener) => {
      listeners[type] = (listeners[type] || []).filter((l) => l !== fn);
    },
  };

  vi.stubGlobal('window', {
    ...globalThis.window,
    speechSynthesis: synth,
  });

  return {
    /** Simulate the browser finishing its async voice load. */
    populate(next: unknown[], { fireEvent = true } = {}) {
      voices = next;
      if (fireEvent) (listeners.voiceschanged || []).forEach((fn) => fn());
    },
  };
}

const voice = (name: string, lang: string, uri = name) =>
  ({ name, lang, voiceURI: uri }) as unknown as SpeechSynthesisVoice;

beforeEach(() => {
  resetVoiceCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('loadVoices', () => {
  it('resolves immediately when the browser already has voices', async () => {
    stubSynthesis([voice('Google UK English', 'en-GB')]);
    const voices = await loadVoices();
    expect(voices).toHaveLength(1);
  });

  it('waits for voiceschanged when the first getVoices() call is empty', async () => {
    // This is the regression. Before the fix the caller received [] here and
    // never re-read, so any configured voiceURI was silently discarded.
    const synth = stubSynthesis([]);
    const pending = loadVoices();

    synth.populate([voice('Google US English', 'en-US'), voice('Daniel', 'en-GB')]);

    const voices = await pending;
    expect(voices).toHaveLength(2);
    expect(voices[0].name).toBe('Google US English');
  });

  it('falls back to polling when voiceschanged never fires (Safari)', async () => {
    vi.useFakeTimers();
    const synth = stubSynthesis([]);
    const pending = loadVoices();

    // Populate WITHOUT firing the event — Safari does not reliably emit it.
    synth.populate([voice('Samantha', 'en-US')], { fireEvent: false });
    await vi.advanceTimersByTimeAsync(150);

    await expect(pending).resolves.toHaveLength(1);
  });

  it('gives up after the timeout rather than hanging forever', async () => {
    vi.useFakeTimers();
    stubSynthesis([]);
    const pending = loadVoices(500);

    await vi.advanceTimersByTimeAsync(600);

    // Empty is a valid answer: callers treat it as "use the system default".
    await expect(pending).resolves.toEqual([]);
  });

  it('resolves empty when speech synthesis is unavailable', async () => {
    vi.stubGlobal('window', {});
    await expect(loadVoices()).resolves.toEqual([]);
  });
});

describe('pickPreferredVoice', () => {
  const voices = [
    voice('Daniel', 'en-GB'),
    voice('Google US English', 'en-US'),
    voice('Microsoft Natural Aria', 'en-US'),
    voice('Amelie', 'fr-FR'),
  ];

  it('honours an exact voiceURI above every heuristic', () => {
    expect(pickPreferredVoice(voices, 'Amelie')?.name).toBe('Amelie');
  });

  it('prefers a Google voice when no URI is given', () => {
    expect(pickPreferredVoice(voices)?.name).toBe('Google US English');
  });

  it('falls back to any voice matching the language', () => {
    expect(pickPreferredVoice([voice('Amelie', 'fr-FR')], undefined, 'fr')?.name).toBe('Amelie');
  });

  it('returns undefined when nothing matches the language', () => {
    expect(pickPreferredVoice([voice('Amelie', 'fr-FR')], undefined, 'ja')).toBeUndefined();
  });

  it('ignores an unknown voiceURI and still returns a sensible default', () => {
    expect(pickPreferredVoice(voices, 'does-not-exist')?.name).toBe('Google US English');
  });
});
