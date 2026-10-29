/**
 * usePersonalizedFsrs — load per-user FSRS weights once per session.
 *
 * Returns the user's tuned weights if available, else the global defaults.
 * The actual tuning happens server-side via loadPersonalizedFsrs; the hook
 * just memoises the result so it can be safely threaded through the SRS
 * pipeline during a study session.
 */

import { useEffect, useState } from 'react';
import {
  loadPersonalizedFsrs,
  fetchUserFsrsStats,
  fetchRecentReviewSamples,
  type LoadResult,
  FSRS_TUNING_GATE,
} from '../services/study/fsrsAdaptation';
import { DEFAULT_WEIGHTS } from '../services/study/fsrs';

export type PersonalizedStatus = 'loading' | 'default' | 'personalized';

export interface UsePersonalizedFsrsResult {
  weights: number[];
  personalized: boolean;
  status: PersonalizedStatus;
  profileLabel: string | null;
}

const EMPTY: UsePersonalizedFsrsResult = {
  weights: DEFAULT_WEIGHTS,
  personalized: false,
  status: 'default',
  profileLabel: null,
};

export function usePersonalizedFsrs(userId: string | null | undefined): UsePersonalizedFsrsResult {
  const [result, setResult] = useState<UsePersonalizedFsrsResult>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setResult(EMPTY);
      return;
    }
    setResult(prev => ({ ...prev, status: 'loading' }));
    (async () => {
      try {
        const stats = await fetchUserFsrsStats(userId);
        const reviews = await fetchRecentReviewSamples(userId);
        const loaded: LoadResult = await loadPersonalizedFsrs(userId, stats, reviews);
        if (cancelled) return;
        setResult({
          weights: loaded.weights,
          personalized: loaded.personalized,
          status: loaded.personalized ? 'personalized' : 'default',
          profileLabel: loaded.profileLabel,
        });
      } catch {
        if (cancelled) return;
        // Fall back silently to defaults if anything in the tuning path throws.
        setResult(EMPTY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return result;
}

export { FSRS_TUNING_GATE };
