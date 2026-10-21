import { useEffect, useRef } from 'react';
import { Capacitor } from '../../lib/nativeShim';
import { useDashboardWorkspace } from '../../contexts/DashboardWorkspaceContext';
import { getUserStats } from '../../services/gamification/gamificationService';
import { initWearSync, pushNow } from '../../services/wear/wearSyncManager';
import type { Card } from '../../types';

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Mounted inside DashboardWorkspaceProvider (native Android only). Pushes the
 * current due-card payload to a paired Wear OS watch and applies grades that
 * come back. Renders nothing; entirely additive.
 */
export default function WearSyncWiring() {
  const workspace = useDashboardWorkspace();
  const user = workspace?.user ?? null;
  const userRef = useRef(user);
  userRef.current = user;
  const cardsRef = useRef<Card[]>(workspace?.cards ?? []);
  cardsRef.current = workspace?.cards ?? [];
  const initedRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user?.id) return;
    if (!initedRef.current) {
      initedRef.current = true;
      initWearSync({
        getCards: () => cardsRef.current,
        getStreak: async () => getUserStats().streakDays,
        getReviewedToday: () =>
          cardsRef.current.filter((c) => (c.lastReviewed ?? 0) >= startOfToday()).length,
        getDueCount: () =>
          cardsRef.current.filter((c) => (c.nextReview ?? 0) <= Date.now()).length,
        // Read via ref so an account switch mid-session never applies grades
        // to the previous user.
        getUserId: () => userRef.current?.id ?? null,
      });
    }
    void pushNow();
  }, [user?.id]);

  useEffect(() => {
    if (initedRef.current) void pushNow();
  }, [workspace?.cards]);

  return null;
}