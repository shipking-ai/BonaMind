import React, { Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PerfBoundary } from '../../lib/perf';
import {
  DashboardShellSkeleton,
  ChatSkeleton,
  AnalyticsSkeleton,
  SettingsSkeleton,
  StudySkeleton,
  AdminSkeleton,
  LandingSkeleton,
  GenericPageSkeleton,
} from './RouteSkeleton';

/**
 * SkeletonProvider — wraps a lazy-loaded component with a matching skeleton.
 *
 * Automatically emits User Timing marks (visible in DevTools > Performance)
 * for skeleton→content swap latency.
 *
 * Usage:
 *   <SkeletonProvider skeleton="dashboard">
 *     <HeavyLazyPage />
 *   </SkeletonProvider>
 */

type SkeletonVariant =
  | 'dashboard'
  | 'chat'
  | 'analytics'
  | 'settings'
  | 'study'
  | 'admin'
  | 'landing'
  | 'generic';

const SKELETON_MAP: Record<SkeletonVariant, React.ComponentType> = {
  dashboard: DashboardShellSkeleton,
  chat: ChatSkeleton,
  analytics: AnalyticsSkeleton,
  settings: SettingsSkeleton,
  study: StudySkeleton,
  admin: AdminSkeleton,
  landing: LandingSkeleton,
  generic: GenericPageSkeleton,
};

interface SkeletonProviderProps {
  skeleton?: SkeletonVariant;
  children: React.ReactNode;
  profileLabel?: string;
}

/**
 * Inline component that fires performance.mark() on mount.
 * Placed inside the Suspense fallback so the mark timestamp
 * reflects when the skeleton first appeared.
 */
function SkeletonMark({ name }: { name: string }) {
  useEffect(() => {
    performance.mark(name);
  }, [name]);
  return null;
}

export function SkeletonProvider({
  skeleton = 'generic',
  children,
  profileLabel,
}: SkeletonProviderProps) {
  const Skeleton = SKELETON_MAP[skeleton] || SKELETON_MAP.generic;
  const label = profileLabel || skeleton;

  return (
    <Suspense
      fallback={
        <>
          {/* Mark fires when skeleton renders — used by PerfBoundary to measure swap time */}
          <SkeletonMark name={'skeleton-' + label + '-start'} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Skeleton />
          </motion.div>
        </>
      }
    >
      <PerfBoundary label={label}>
        <AnimatePresence mode="wait">
          <motion.div
            key={skeleton}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </PerfBoundary>
    </Suspense>
  );
}
