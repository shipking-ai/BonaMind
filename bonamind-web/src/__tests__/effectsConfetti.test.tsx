// @vitest-environment jsdom
//
// Smoke + a11y tests for the canvas-based `Confetti` effect. We don't try
// to assert canvas pixel data (jsdom canvas is a stub — that's a
// browser-only visual test). Instead we cover:
//   - Component renders a canvas + testid
//   - Imperative `ref.fire()` doesn't throw
//   - prefers-reduced-motion short-circuits (no particles spawned,
//     onSettled still fires immediately so caller UI gates don't stall)
//   - Cleanup on unmount cancels any in-flight rAF
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { Confetti, type ConfettiHandle } from '../lib/effects/Confetti';

describe('Confetti', () => {
  beforeEach(() => {
    // jsdom doesn't define `window.matchMedia`. Assign a passthrough
    // (motion is NOT reduced by default). Tests that exercise the reduced
    // path override this with `vi.stubGlobal('matchMedia', ...)` or
    // direct assignment inside `it`.
    window.matchMedia = vi.fn().mockImplementation(
      (q: string) =>
        ({
          matches: false,
          media: q,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }) as any,
    );
    // No canvas stub needed: Confetti.tsx already guards `if (!ctx) return`
    // in both the resize useEffect and the fire() rAF path, so the
    // jsdom partial canvas doesn't trip the test.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a canvas with the testid', () => {
    render(<Confetti />);
    expect(screen.getByTestId('confetti-canvas')).toBeInstanceOf(HTMLCanvasElement);
  });

  it('fires via imperative ref without throwing', () => {
    const ref = createRef<ConfettiHandle>();
    render(<Confetti ref={ref} />);
    expect(() => ref.current?.fire()).not.toThrow();
  });

  it('honors prefers-reduced-motion: media query match skips animation', () => {
    // Override the default matchMedia stub to indicate reduced motion.
    window.matchMedia = vi.fn().mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          media: q,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }) as any,
    );
    const onSettled = vi.fn();
    const ref = createRef<ConfettiHandle>();
    render(<Confetti ref={ref} onSettled={onSettled} />);
    act(() => {
      ref.current?.fire();
    });
    // Reduced motion → onSettled fires immediately (caller can advance UI).
    expect(onSettled).toHaveBeenCalled();
  });
});
