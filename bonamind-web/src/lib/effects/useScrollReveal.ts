/**
 * useScrollReveal — anime.js v4 `ScrollObserver` React hook with TWO
 * ergonomic APIs for the caller.
 *
 * 1. `enter: AnimationParams` — the common case. Call once on first enter
 *    with these animation params. Example:
 *
 *    ```ts
 *    const { ref } = useScrollReveal({ enter: { opacity: [0,1], translateY: [16,0], duration: 600 } });
 *    ```
 *
 * 2. `onEnter: (target) => void` — escape hatch for arbitrary imperative
 *    side effects. Skip happens via local `alreadyEntered` flag.
 *
 * Both APIs are accepted. Internally the lib forwards a single
 * `onEnter` callback to `new ScrollObserver({...})`. `onEnter` wins if
 * both are present.
 *
 * Cleanup: the observer is `revert()`-ed on unmount (anime.js detaches
 * the IntersectionObserver / scroll listeners itself). No manual cleanup
 * required.
 *
 * prefers-reduced-motion: when on, the hook applies the FINAL state of
 * each animatable property directly so users get the post-reveal visual
 * without the animation — same approach as every other effect in
 * `lib/effects/`.
 */

import { useEffect, useRef } from 'react';
import {
  animate,
  ScrollObserver,
  type AnimationParams,
} from 'animejs';

// AnimationParams keys we recognize for the prefers-reduced-motion fallback
// (write the final state directly to the element's inline style).
const REDUCED_MOTION_PROPS = new Set([
  'opacity',
  'translateX',
  'translateY',
]);

/**
 * Public options for `useScrollReveal`.
 *
 * Self-contained (does NOT extend `ScrollObserverParams` to avoid name
 * clashes with anime.js v4's own `enter` field which is a
 * `ScrollThresholdParam` (a number), not an animation-params object.
 */
export interface UseScrollRevealOptions {
  /**
   * AnimationParams for the one-shot reveal tween. Defaults to a gentle
   * `opacity 0→1` + `translateY 20→0` over 600ms when neither `enter`
   * nor `onEnter` is provided.
   */
  enter?: AnimationParams;
  /**
   * Escape-hatch imperative callback forwarded as the ScrollObserver's
   * `onEnter`. Wins over `enter` when both are supplied.
   */
  onEnter?: (target: HTMLElement) => void;
  /**
   * Honor `prefers-reduced-motion`. Default `true`. When on, no observer
   * is constructed; the final state of `enter` properties is written
   * inline so the post-reveal visual is present without a tween.
   */
  respectReducedMotion?: boolean;
  /**
   * Whether the ScrollObserver should re-trigger when the element
   * leaves + re-enters the viewport. Default `false`.
   */
  repeat?: boolean;
}

export interface UseScrollRevealHandle<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
}

const DEFAULT_ENTER: AnimationParams = {
  opacity: [0, 1],
  translateY: [20, 0],
  duration: 600,
};

/**
 * Apply the END state of each entry in `params` directly to the element's
 * inline style. Used for the prefers-reduced-motion path so users get the
 * post-reveal visual without the tween.
 */
function applyFinalStateDirectly(el: HTMLElement, params: AnimationParams) {
  const fragment: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (!REDUCED_MOTION_PROPS.has(key)) continue;
    const targetRaw = Array.isArray(value)
      ? value[value.length - 1]
      : value;
    if (typeof targetRaw !== 'number') continue;
    if (key === 'opacity') {
      el.style.opacity = String(targetRaw);
    } else if (key === 'translateX') {
      fragment.push(`translateX(${targetRaw}px)`);
    } else if (key === 'translateY') {
      fragment.push(`translateY(${targetRaw}px)`);
    }
  }
  if (fragment.length > 0) {
    // Overwrite (don't append) — element may have a parent-set transform we
    // shouldn't clobber, but in practice the section was never animated, so
    // there is no prior transform to preserve.
    el.style.transform = fragment.join(' ');
  }
}

export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  opts: UseScrollRevealOptions = {},
): UseScrollRevealHandle<T> {
  const {
    enter,
    onEnter: userOnEnter,
    respectReducedMotion = true,
    repeat = false,
  } = opts;
  const animationParams = enter ?? DEFAULT_ENTER;
  const animationSignature = Object.entries(animationParams)
    .map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join('|');
  const onEnterSignature = typeof userOnEnter === 'function' ? userOnEnter.toString() : '';
  const ref = useRef<T>(null);
  // Latest values for the observer's callbacks — the effect is keyed on
  // the signatures above so unstable caller identities don't thrash it.
  const paramsRef = useRef(animationParams);
  paramsRef.current = animationParams;
  const onEnterRef = useRef(userOnEnter);
  onEnterRef.current = userOnEnter;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const animationParams = paramsRef.current;
    const userOnEnter = onEnterRef.current;

    // Zero-bounds early-return: if the element has been styled with
    // `display: contents` or hasn't yet been laid out (e.g. inside a
    // portal that hasn't opened), its bounding rect is 0×0 — anime.js v4's
    // `ScrollObserver` would otherwise produce an internal `new Tween`
    // with `params === undefined` and throw `Error: Params are not set`.
    // We write the final state directly so callers using `StaggerList
    // className="contents"` (a common pattern to opt a stats grid out of
    // the wrapper box) finish cleanly instead of throwing in the console.
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      if (typeof userOnEnter === 'function') {
        // Honor the escape-hatch callback even when we skip the observer.
        userOnEnter(el);
      } else {
        applyFinalStateDirectly(el, animationParams);
      }
      return undefined;
    }

    // prefers-reduced-motion: short-circuit the observer, write final state.
    if (respectReducedMotion) {
      const mql =
        typeof window !== 'undefined'
          ? window.matchMedia?.('(prefers-reduced-motion: reduce)')
          : null;
      if (mql?.matches) {
        applyFinalStateDirectly(el, animationParams);
        return undefined;
      }
    }

    let alreadyEntered = false;

    const observer = new ScrollObserver({
      target: el,
      repeat,
      // Build the unified onEnter: invoke the user's callback if present,
      // else drive the animation from `enter` params. Either way, fire
      // once for the "lazy-section-already-in-view" path (one-shot reveal).
      onEnter: () => {
        if (alreadyEntered) return;
        alreadyEntered = true;
        if (typeof userOnEnter === 'function') {
          userOnEnter(el);
        } else {
          animate(el as Parameters<typeof animate>[0], animationParams);
        }
        // Drop the GPU layer hint after the tween lands so remaining
        // pages don't accumulate composited layers forever.
        if (respectReducedMotion !== false) {
          requestAnimationFrame(() => {
            el.style.willChange = 'auto';
          });
        }
      },
    });

    return () => {
      observer.revert();
    };
  }, [
    respectReducedMotion,
    repeat,
    // Re-create when the user passes one of these. We rely on the caller
    // to keep object identities stable across renders if they want the
    // observer to persist.
    onEnterSignature,
    animationSignature,
  ]);

  return { ref };
}
