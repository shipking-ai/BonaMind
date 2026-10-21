import React from 'react';
import {
  SkeletonCard,
  SkeletonStatCard,
  SkeletonChart,
  SkeletonPage,
} from './Skeleton';

/**
 * Route-level skeleton loading components.
 * Each maps to a page type: dashboard, chat, admin, study, landing, settings, etc.
 * Richer than a bare `<div>` — shows the layout structure while lazy-loaded pages mount.
 */

// ── Dashboard Shell Skeleton — mirrors AppShell.tsx sidebar layout ───

export function DashboardShellSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex">
      {/* Sidebar — matches AppShell.tsx real sidebar structure */}
      <aside className="hidden md:flex w-60 flex-col border-r border-[#2A2A3A] bg-[#0A0A0F] animate-pulse">
        {/* Wordmark + notification bell row */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-zinc-800" />
            <div className="h-4 w-28 bg-zinc-800/50 rounded" />
          </div>
          <div className="h-8 w-8 rounded-lg bg-zinc-800"/>
        </div>

        {/* Nav sections — Study, Create, Compete, Insights, You */}
        <nav className="flex-1 px-3 space-y-1">
          {['Study', 'Create', 'Compete', 'Insights', 'You'].map((section) => (
            <div key={section}>
              {/* Section header */}
              <div className="flex items-center justify-between px-2 py-1 mt-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-16 bg-zinc-800/60 rounded" />
                  <div className="h-3.5 w-3.5 rounded-full bg-zinc-800/40 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-zinc-700/40" />
                  </div>
                </div>
                <div className="h-2.5 w-2.5 bg-zinc-800/40 rounded" />
              </div>
              {/* Nav items — item count per section matches the real PRIMARY_NAV */}
              <div className="space-y-0.5">
                {Array.from({
                  length:
                    section === 'Study' ? 6 :
                    section === 'Create' ? 3 :
                    section === 'Compete' ? 2 :
                    section === 'Insights' ? 4 :
                    section === 'You' ? 2 : 2,
                }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                    <div className="h-4 w-4 bg-zinc-800/50 rounded" />
                    <div className="h-3.5 bg-zinc-800/50 rounded" style={{ width: `${60 + Math.random() * 25}%` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="my-2 h-px bg-[#2A2A3A]" />

          {/* Tutorial */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="h-4 w-4 bg-zinc-800/50 rounded" />
            <div className="h-3.5 w-16 bg-zinc-800/50 rounded" />
          </div>

          {/* Search button */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#2A2A3A] bg-[#111118] px-3 py-2.5">
            <div className="h-4 w-4 bg-zinc-800/40 rounded" />
            <div className="h-3.5 w-12 bg-zinc-800/40 rounded flex-1" />
            <div className="h-4 w-10 rounded border border-[#2A2A3A] bg-[#1A1A24]"/>
          </div>
        </nav>

        {/* User block */}
        <div className="border-t border-[#2A2A3A] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-zinc-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 bg-zinc-800 rounded" />
              <div className="h-3 w-14 bg-zinc-800/50 rounded-full" />
            </div>
          </div>
        </div>
      </aside>
      {/* Main content placeholder */}
      <div className="flex-1 p-6">
        <SkeletonPage />
      </div>
    </div>
  );
}

// ── Analytics Dashboard Skeleton ─────────────────────────────────────

export function AnalyticsSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-6 animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-7 w-48 bg-zinc-800 rounded-lg mb-2" />
        <div className="h-4 w-72 bg-zinc-800/50 rounded-lg" />
      </div>
      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonChart key={i} />
        ))}
      </div>
      {/* Recent activity */}
      <div className="space-y-2">
        <div className="h-5 w-32 bg-zinc-800 rounded mb-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-zinc-800/50 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ── Chat Page Skeleton ───────────────────────────────────────────────

export function ChatSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex flex-col animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03]">
        <div className="w-8 h-8 bg-zinc-800 rounded-full" />
        <div className="flex-1">
          <div className="h-4 w-24 bg-zinc-800 rounded mb-1" />
          <div className="h-3 w-16 bg-zinc-800/50 rounded" />
        </div>
      </div>
      {/* Messages area */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex gap-3 items-start">
          <div className="w-6 h-6 bg-zinc-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-3/4" />
            <div className="h-4 bg-zinc-800/50 rounded w-1/2" />
          </div>
        </div>
        <div className="flex gap-3 items-start justify-end">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-700 rounded w-2/3 ml-auto" />
          </div>
          <div className="w-6 h-6 bg-zinc-700 rounded-full shrink-0" />
        </div>
        <div className="flex gap-3 items-start">
          <div className="w-6 h-6 bg-zinc-800 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-5/6" />
            <div className="h-4 bg-zinc-800/50 rounded w-2/3" />
            <div className="h-4 bg-zinc-800/50 rounded w-1/3" />
          </div>
        </div>
      </div>
      {/* Input bar */}
      <div className="p-4 border-t border-white/[0.03]">
        <div className="h-10 bg-zinc-800/50 rounded-xl" />
      </div>
    </div>
  );
}

// ── Study Mode Skeleton ──────────────────────────────────────────────

export function StudySkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6 animate-pulse">
      <div className="w-full max-w-2xl">
        {/* Progress bar */}
        <div className="h-2 bg-zinc-800 rounded-full mb-8" />
        {/* Card */}
        <div className="bg-zinc-900/50 rounded-2xl border border-white/[0.03] p-8 space-y-4">
          <div className="h-5 w-24 bg-zinc-800 rounded mb-6" />
          <div className="space-y-3">
            <div className="h-5 bg-zinc-800 rounded w-3/4" />
            <div className="h-5 bg-zinc-800/50 rounded w-full" />
            <div className="h-5 bg-zinc-800/50 rounded w-2/3" />
          </div>
          <div className="h-px bg-white/[0.03] my-6" />
          <div className="space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-1/2" />
            <div className="h-4 bg-zinc-800/50 rounded w-3/4" />
          </div>
        </div>
        {/* Rating buttons */}
        <div className="flex gap-2 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 h-10 bg-zinc-800/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard Skeleton ─────────────────────────────────────────

export function AdminSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-6 animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-36 bg-zinc-800 rounded-lg mb-2" />
        <div className="h-4 w-56 bg-zinc-800/50 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
      <div className="bg-zinc-900/50 rounded-xl border border-white/[0.03] p-4">
        <div className="h-5 w-40 bg-zinc-800 rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800/30 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings Page Skeleton ───────────────────────────────────────────

export function SettingsSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-6 animate-pulse">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <div className="h-7 w-32 bg-zinc-800 rounded mb-2" />
          <div className="h-4 w-48 bg-zinc-800/50 rounded" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-zinc-900/50 rounded-xl border border-white/[0.03] p-4 space-y-3">
            <div className="h-5 w-28 bg-zinc-800 rounded" />
            <div className="h-8 bg-zinc-800/30 rounded-lg" />
            <div className="h-8 bg-zinc-800/30 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Landing Page Skeleton ────────────────────────────────────────────

export function LandingSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] animate-pulse">
      {/* Nav */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div className="h-7 w-28 bg-zinc-800 rounded-lg" />
        <div className="flex gap-3">
          <div className="h-9 w-20 bg-zinc-800/50 rounded-lg" />
          <div className="h-9 w-24 bg-zinc-700/50 rounded-lg" />
        </div>
      </div>
      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        <div className="h-4 w-36 bg-zinc-800 rounded mb-4" />
        <div className="h-10 w-3/4 max-w-xl bg-zinc-800 rounded mb-3" />
        <div className="h-6 w-1/2 max-w-md bg-zinc-800/50 rounded mb-8" />
        <div className="flex gap-3">
          <div className="h-12 w-36 bg-zinc-700/50 rounded-xl" />
          <div className="h-12 w-36 bg-zinc-800/50 rounded-xl" />
        </div>
      </div>
      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-16 max-w-5xl mx-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i} className="p-6" />
        ))}
      </div>
    </div>
  );
}

// ── Generic Page Skeleton (fallback) ─────────────────────────────────

export function GenericPageSkeleton(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[#0A0A0F] p-6 animate-pulse">
      <SkeletonPage />
    </div>
  );
}
