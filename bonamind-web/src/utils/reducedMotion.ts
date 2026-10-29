import { useEffect, useState } from 'react';

export const checkReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * React hook version of `checkReducedMotion` — subscribes to OS-level
 * changes and re-renders when the user toggles the system setting.
 * Returns `false` during SSR.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => checkReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
