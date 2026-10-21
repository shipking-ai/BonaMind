import React from 'react';

/**
 * Loading Skeleton Components
 * 
 * Placeholder UI shown while content is loading.
 * Provides a better UX than spinners by showing the layout structure.
 */

export function SkeletonCard({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div className={`animate-pulse bg-zinc-800/50 rounded-xl ${className}`}>
      <div className="p-4 space-y-3">
        <div className="h-4 bg-zinc-700 rounded w-3/4" />
        <div className="h-3 bg-zinc-700/50 rounded w-full" />
        <div className="h-3 bg-zinc-700/50 rounded w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonDeckCard(): React.ReactElement {
  return (
    <div className="animate-pulse bg-zinc-800/50 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-zinc-700 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-zinc-700 rounded w-3/4" />
          <div className="h-3 bg-zinc-700/50 rounded w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-6 bg-zinc-700/50 rounded-full w-16" />
        <div className="h-6 bg-zinc-700/50 rounded-full w-20" />
      </div>
    </div>
  );
}

export function SkeletonStatCard(): React.ReactElement {
  return (
    <div className="animate-pulse bg-zinc-800/50 rounded-xl p-4 space-y-3">
      <div className="h-8 w-8 bg-zinc-700 rounded-lg" />
      <div className="h-6 bg-zinc-700 rounded w-1/3" />
      <div className="h-3 bg-zinc-700/50 rounded w-2/3" />
    </div>
  );
}

export function SkeletonTableRow(): React.ReactElement {
  return (
    <div className="animate-pulse flex items-center gap-4 p-3">
      <div className="h-4 bg-zinc-700 rounded flex-1" />
      <div className="h-4 bg-zinc-700/50 rounded w-24" />
      <div className="h-4 bg-zinc-700/50 rounded w-20" />
      <div className="h-4 bg-zinc-700/50 rounded w-16" />
    </div>
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }): React.ReactElement {
  return (
    <div className="animate-pulse space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-zinc-700/50 rounded"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar(): React.ReactElement {
  return (
    <div className="animate-pulse h-10 w-10 bg-zinc-700 rounded-full" />
  );
}

export function SkeletonChart(): React.ReactElement {
  return (
    <div className="animate-pulse bg-zinc-800/50 rounded-xl p-4">
      <div className="h-4 bg-zinc-700 rounded w-1/4 mb-4" />
      <div className="h-48 bg-zinc-700/30 rounded" />
    </div>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }): React.ReactElement {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTableRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonPage(): React.ReactElement {
  return (
    <div className="p-6 space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-700 rounded w-1/4 mb-2" />
        <div className="h-4 bg-zinc-700/50 rounded w-1/3" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonDeckCard key={i} />
        ))}
      </div>
    </div>
  );
}



