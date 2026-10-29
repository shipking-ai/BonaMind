/**
 * easingPresets — pre-built easing curves for the design team.
 *
 * Anime.js v4 accepts BOTH string identifiers (e.g. `'outQuad'`) AND
 * FunctionValue objects (e.g. `cubicBezier(.5, 0, .5, 1)` or `createSpring({...})`).
 * For the design team's most-used "house" easings, we pre-build the
 * FunctionValue so callers don't have to know the underlying call.
 *
 * Usage:
 *
 *   animate(element, {
 *     opacity: [0, 1],
 *     duration: 600,
 *     ease: easingPresets.gentle,    // not 'inOutQuad'
 *   });
 *
 * Why presets matter:
 *   - Designers can change the easing curve in ONE place.
 *   - String identifiers bypass the spring-physics solver — too "mathy"
 *     for most UI motion. Presets give us nuanced curves without
 *     forcing every caller to think about physics.
 */

import {
  spring,
  cubicBezier,
  linear,
  steps,
} from 'animejs';

/** "Gentle" — slow-in, slow-out with a touch of overshoot. */
export const gentle = spring({ mass: 0.6, stiffness: 220, damping: 14 });

/** "Snappy" — fast-in, fast-out, no overshoot. UI feedback feel. */
export const snappy = cubicBezier(0.4, 0, 0.2, 1);

/** "Decelerate" — fast-in, slow-out. Material Design "Decelerate" curve. */
export const decelerate = cubicBezier(0, 0, 0.2, 1);

/** "Accelerate" — slow-in, fast-out. Material Design "Accelerate" curve. */
export const accelerate = cubicBezier(0.4, 0, 1, 1);

/** "Sharp" — UI feedback, button presses, fast dismissals. */
export const sharp = cubicBezier(0.4, 0, 0.6, 1);

/** "Standard" — Material Design "Standard" curve. The default for most UI motion. */
export const standard = cubicBezier(0.4, 0, 0.2, 1);

/** "Bouncy" — celebratory micro-bounce on achievement unlocks. */
export const bouncy = spring({ mass: 0.5, stiffness: 280, damping: 10 });

/** "Wobbly" — heavy overshoot for big celebratory moments. */
export const wobbly = spring({ mass: 0.8, stiffness: 200, damping: 8 });

/** Linear — for opacity fades and progress bars where easing is invisible. */
export const flat = linear;

/**
 * Step easing factory — produces a stepwise progression (great for loaders).
 * Wraps anime.js v4's `steps(count, fromStart)` function.
 */
export const stepsFactory = (count: number) => steps(count);

/** Bundle export. */
export const easingPresets = {
  gentle,
  snappy,
  decelerate,
  accelerate,
  sharp,
  standard,
  bouncy,
  wobbly,
  flat,
  steps: stepsFactory,
} as const;

export type EasingPresetName = keyof typeof easingPresets;
