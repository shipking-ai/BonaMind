/**
 * speechEngine — capability detection and the error taxonomy.
 *
 * Both exist because the previous implementation collapsed distinct
 * failures into one silent `setListening(false)`. A denied microphone and
 * a moment of silence produced identical UI: a button that did nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeSpeechError,
  getSpeechCapabilities,
  UNSUPPORTED_STT_ERROR,
} from '../services/voice/speechEngine';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSpeechCapabilities', () => {
  it('reports tts and stt independently', () => {
    // Firefox ships speechSynthesis but no SpeechRecognition. A single
    // `supported` flag reported true here and listening then failed with
    // no explanation.
    vi.stubGlobal('window', { speechSynthesis: {} });
    expect(getSpeechCapabilities()).toEqual({ tts: true, stt: false });
  });

  it('detects the webkit-prefixed recogniser', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: function () {} });
    expect(getSpeechCapabilities()).toEqual({ tts: false, stt: true });
  });

  it('detects the unprefixed recogniser', () => {
    vi.stubGlobal('window', { speechSynthesis: {}, SpeechRecognition: function () {} });
    expect(getSpeechCapabilities()).toEqual({ tts: true, stt: true });
  });

  it('reports nothing available outside a browser', () => {
    vi.stubGlobal('window', undefined);
    expect(getSpeechCapabilities()).toEqual({ tts: false, stt: false });
  });
});

describe('describeSpeechError', () => {
  it('marks a denied microphone as needing permission and not retryable', () => {
    const err = describeSpeechError('not-allowed');
    expect(err.code).toBe('not-allowed');
    expect(err.needsPermission).toBe(true);
    expect(err.recoverable).toBe(false);
  });

  it('treats a blocked service the same as a denied mic', () => {
    expect(describeSpeechError('service-not-allowed').needsPermission).toBe(true);
  });

  it('marks silence as recoverable and not a permission problem', () => {
    const err = describeSpeechError('no-speech');
    expect(err.recoverable).toBe(true);
    expect(err.needsPermission).toBe(false);
  });

  it('marks a missing device as not recoverable by retrying', () => {
    const err = describeSpeechError('audio-capture');
    expect(err.recoverable).toBe(false);
    expect(err.needsPermission).toBe(false);
  });

  it('marks a network failure as retryable', () => {
    expect(describeSpeechError('network').recoverable).toBe(true);
  });

  it('falls back to a retryable unknown for unrecognised codes', () => {
    const err = describeSpeechError('something-new-in-chrome-141');
    expect(err.code).toBe('unknown');
    expect(err.recoverable).toBe(true);
  });

  it('always produces a non-empty message written for a student', () => {
    for (const code of [
      'not-allowed',
      'no-speech',
      'audio-capture',
      'network',
      'aborted',
      'service-not-allowed',
      'garbage',
    ]) {
      const { message } = describeSpeechError(code);
      expect(message.length).toBeGreaterThan(0);
      // No raw error codes leaking into the UI.
      expect(message).not.toContain(code);
    }
  });
});

describe('UNSUPPORTED_STT_ERROR', () => {
  it('is a permanent, non-permission failure that names a way forward', () => {
    expect(UNSUPPORTED_STT_ERROR.code).toBe('unsupported');
    expect(UNSUPPORTED_STT_ERROR.recoverable).toBe(false);
    expect(UNSUPPORTED_STT_ERROR.needsPermission).toBe(false);
    expect(UNSUPPORTED_STT_ERROR.message).toMatch(/Chrome|Edge/);
  });
});
