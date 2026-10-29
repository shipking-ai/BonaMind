/**
 * Guards the direction of the session pacing override against its labels.
 *
 * FSRS difficulty runs 1 (easiest) → 10 (hardest): a HIGHER target means
 * tighter intervals. A real inversion shipped here: Gentler biased the
 * target UP and Firmer DOWN — the opposite of what the buttons say — and
 * with no tuned profile both buttons silently did nothing even though the
 * header promises a default-center fallback.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS } from '@bonamind/core';
import { targetForMode } from '../components/study/PacingOverride';

describe('session pacing targets match their labels', () => {
  it('Gentler biases toward the easy end, Firmer toward the hard end', () => {
    expect(targetForMode('easier', 7)).toBe(6);
    expect(targetForMode('harder', 7)).toBe(8);
  });

  it('with no tuned profile both work from the FSRS default center', () => {
    const defaultCenter = DEFAULT_WEIGHTS[4]; // ~7.21, the W[4] mean-reversion point
    expect(typeof defaultCenter).toBe('number');
    expect(targetForMode('easier', null)).toBeCloseTo(defaultCenter - 1, 5);
    expect(targetForMode('harder', null)).toBeCloseTo(defaultCenter + 1, 5);
    expect(targetForMode('easier', null)).not.toBeNull();
  });

  it('auto stays automatic (no explicit target)', () => {
    expect(targetForMode('auto', 7)).toBeNull();
    expect(targetForMode('auto', null)).toBeNull();
  });

  it('targets clamp inside the FSRS difficulty range at the edges', () => {
    expect(targetForMode('easier', 1)).toBe(1);
    expect(targetForMode('harder', 10)).toBe(10);
  });
});
