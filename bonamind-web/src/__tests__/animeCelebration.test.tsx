import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { AnimeCelebration, type AnimeCelebrationHandle } from '../lib/effects';

/**
 * Sentinel tests for the AnimeCelebration effect (anime.js v4 integration).
 *
 * Two regression nets:
 *   1. The 4 assertions below pin the public surface — render, celebrate
 *      without arg, celebrate with label, no-op under reduced motion.
 *   2. anime.js is the dependency this component ACTUALLY consumes for the
 *      first time in the codebase. If a maintainer deletes the import or
 *      replaces the effect with another library, the visual celebration
 *      on achievement unlocks and streak milestones silently changes.
 *      These tests fail loud if that happens.
 */

describe('AnimeCelebration (anime.js v4) — celebration halo', () => {
  beforeEach(() => {
    // Reset matchMedia to its natural jsdom-default state (no reduced motion)
    // before each test so the prefers-reduced-motion test can rebind it.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  it('renders without throwing (mounts the ring + label overlay)', () => {
    const ref = createRef<AnimeCelebrationHandle>();
    const { container, unmount } = render(<AnimeCelebration ref={ref} />);
    // Both the halo and the label testids should be in the DOM.
    expect(container.querySelector('[data-testid="anime-celebration-ring"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="anime-celebration-label"]')).toBeTruthy();
    unmount();
  });

  it('celebrate() imperatively fires without throwing (normal motion)', () => {
    // jsdom's default matchMedia is undefined, so useReducedMotion returns
    // false. celebrate() runs the anime.js animation in the DOM.
    const ref = createRef<AnimeCelebrationHandle>();
    render(<AnimeCelebration ref={ref} />);
    expect(() => ref.current?.celebrate()).not.toThrow();
    expect(() => ref.current?.celebrate({ label: '+25 XP', intensity: 'normal' })).not.toThrow();
  });

  it('celebrate() writes the label into the DOM before animating', () => {
    const ref = createRef<AnimeCelebrationHandle>();
    const { container } = render(<AnimeCelebration ref={ref} />);
    ref.current?.celebrate({ label: '7-day streak!' });
    const label = container.querySelector('[data-testid="anime-celebration-label"]');
    expect(label?.textContent).toBe('7-day streak!');
  });

  it('celebrate() is a no-op under prefers-reduced-motion', () => {
    // Bind matchMedia to return matches=true for prefers-reduced-motion.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    const ref = createRef<AnimeCelebrationHandle>();
    const { container } = render(<AnimeCelebration ref={ref} />);
    // Should not throw AND should NOT mutate the label text (because the
    // early-return path skips setting textContent).
    ref.current?.celebrate({ label: 'should-not-appear' });
    const label = container.querySelector('[data-testid="anime-celebration-label"]');
    expect(label?.textContent ?? '').not.toBe('should-not-appear');
  });
});
