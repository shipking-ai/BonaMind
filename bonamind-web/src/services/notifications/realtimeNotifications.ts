/**
 * Real-time Notifications Service
 *
 * Subscribes to Supabase Realtime Broadcast channels and merges incoming
 * events into the existing notificationStore (localStorage-backed).
 *
 * Channel topic:   user:<user_id>:notifications  (public broadcast)
 * Broadcast type:  broadcast
 *
 * Usage:
 *   import { initRealtimeNotifications, destroyRealtimeNotifications } from './realtimeNotifications';
 *
 *   // On app mount (after auth is ready):
 *   initRealtimeNotifications(userId);
 *
 *   // On app unmount:
 *   destroyRealtimeNotifications();
 *
 * Events handled:
 *   study_session_completed  → "Study session complete! X cards reviewed"
 *   league_xp_changed        → "Ranked #{tier} in {league_group} — {xp} XP"
 *   streak_updated           → "{streak}-day streak!"
 */

import { supabase } from '../database/supabase';
import { addNotification } from './notificationStore';

// ─── Types ───────────────────────────────────────────────────────────────

interface RealtimeNotificationPayload {
  type: string;       // 'study_session' | 'league' | 'profile'
  event: string;      // 'study_session_completed' | 'league_xp_changed' | 'streak_updated'
  timestamp: number;
  cards_studied?: number;
  duration_minutes?: number;
  accuracy?: number;
  weekly_xp?: number;
  tier?: number;
  league_group?: string;
  streak?: number;
  lifetime_xp?: number;
}

// ─── Types ───────────────────────────────────────────────────────────────

export type RealtimeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface StatusListener {
  id: string;
  callback: (status: RealtimeConnectionStatus) => void;
}

// ─── State ───────────────────────────────────────────────────────────────

let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
let currentUserId: string | null = null;
let connectionStatus: RealtimeConnectionStatus = 'disconnected';
let statusListeners: StatusListener[] = [];

// Exponential backoff state
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_DELAY_MS = 30_000; // 30 seconds cap
const BASE_DELAY_MS = 1_000;
let listenerIdCounter = 0;

// ─── Connection status helpers ────────────────────────────────────────────

function setStatus(next: RealtimeConnectionStatus): void {
  connectionStatus = next;
  statusListeners.forEach((l) => l.callback(next));
}

function scheduleReconnect(userId: string): void {
  if (reconnectTimer) return; // already scheduled
  const delay = Math.min(BASE_DELAY_MS * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
  console.warn(`[Realtime] Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Guard: if destroyRealtimeNotifications was called while the timer
    // was pending, currentUserId will be null — abort the reconnect.
    if (!currentUserId) return;
    reconnectAttempt++;
    initRealtimeNotifications(userId);
  }, delay);
}

function resetBackoff(): void {
  reconnectAttempt = 0;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * Subscribe to connection status changes. Returns an unsubscribe function.
 */
export function onConnectionStatusChange(
  callback: (status: RealtimeConnectionStatus) => void,
): () => void {
  const id = String(++listenerIdCounter);
  statusListeners.push({ id, callback });
  // Emit current state immediately
  callback(connectionStatus);
  return () => {
    statusListeners = statusListeners.filter((l) => l.id !== id);
  };
}

/**
 * Get the current connection status (synchronous snapshot).
 */
export function getConnectionStatus(): RealtimeConnectionStatus {
  return connectionStatus;
}

// ─── Event handlers ─────────────────────────────────────────────────────

function handleStudySessionEvent(payload: RealtimeNotificationPayload): void {
  const cards = payload.cards_studied ?? 0;
  const duration = payload.duration_minutes ?? 0;
  const accuracy = payload.accuracy ?? 0;

  addNotification({
    title: 'Study Session Complete',
    description: `${cards} cards reviewed in ${duration} min · ${accuracy}% accuracy`,
    type: 'success',
    actionUrl: '/dashboard/analytics',
    actionLabel: 'View Stats',
  });
}

function handleLeagueEvent(payload: RealtimeNotificationPayload): void {
  const xp = payload.weekly_xp ?? 0;
  const tier = payload.tier ?? 1;

  addNotification({
    title: 'League Progress',
    description: `You earned ${xp} XP this week (Tier ${tier})`,
    type: 'info',
    actionUrl: '/dashboard/leagues',
    actionLabel: 'View League',
  });
}

function handleStreakEvent(payload: RealtimeNotificationPayload): void {
  const streak = payload.streak ?? 0;
  // Only celebrate milestone streaks
  const milestones = [3, 7, 14, 30, 50, 100, 200, 365];
  if (!milestones.includes(streak)) return;

  const titles: Record<number, string> = {
    3: '3-Day Streak!',
    7: 'One Week Strong!',
    14: 'Two Weeks of Momentum!',
    30: '30-Day Streak!',
    50: '50-Day Streak!',
    100: 'Century Streak!',
    200: '200-Day Streak!',
    365: 'One Year of Streaks!',
  };

  addNotification({
    title: titles[streak] || `${streak}-Day Streak!`,
    description: 'Amazing consistency — keep the momentum going',
    type: 'success',
    actionUrl: '/dashboard/streak',
    actionLabel: 'View Streak',
  });
}

const EVENT_HANDLERS: Record<string, (payload: RealtimeNotificationPayload) => void> = {
  study_session_completed: handleStudySessionEvent,
  league_xp_changed: handleLeagueEvent,
  streak_updated: handleStreakEvent,
};

// ─── Main handler ────────────────────────────────────────────────────────

function onBroadcastEvent(event: { payload?: { type?: string; data?: RealtimeNotificationPayload } | RealtimeNotificationPayload }): void {
  // The payload can arrive as either:
  //   { type: 'broadcast', event: '...', payload: { type: '...', ... } }
  //   { payload: { type: '...', ... } } (raw trigger payload)
  const payload = (event as any).payload?.data ?? (event as any).payload ?? event;

  if (!payload || !payload.event) {
    console.warn('[Realtime] Ignored malformed broadcast:', event);
    return;
  }

  const handler = EVENT_HANDLERS[payload.event];
  if (handler) {
    handler(payload as RealtimeNotificationPayload);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Initialize real-time notification subscriptions.
 * Call after the user is authenticated.
 *
 * Broadcast channels are PUBLIC — no private-channel RLS needed.
 * Channel names like `user:<uuid>:notifications` scope subscriptions
 * at the application layer; only server-side code publishes.
 *
 * @param userId - The authenticated user's UUID
 * @param _authToken - Kept for API compat but no longer used
 */
export function initRealtimeNotifications(userId: string): void {
  if (!supabase) {
    console.warn('[Realtime] Supabase not available — notifications disabled');
    setStatus('error');
    return;
  }

  // Singleton guard: reuse an existing channel for the same topic.
  const channelName = `user:${userId}:notifications`;
  const existingChannel = supabase.getChannels?.().find((c) => c.topic === channelName);
  if (existingChannel) {
    channel = existingChannel;
    return;
  }

  // Clean up existing channel WITHOUT resetting backoff —
  // destroyRealtimeNotifications() calls resetBackoff() which would
  // wipe the exponential delay counter on every reconnect attempt.
  if (channel && supabase) {
    supabase.removeChannel(channel);
    channel = null;
  }

  currentUserId = userId;
  setStatus('connecting');

  // Public broadcast channel — scoped by user ID in the channel name.
  // No setAuth() or private RLS required; the Realtime server delivers
  // broadcast payloads to all subscribers of this topic.
  channel = supabase.channel(channelName, {
    config: { broadcast: { ack: false } },
  });

  channel
    .on('broadcast', { event: 'broadcast' }, onBroadcastEvent)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.warn('[Realtime] Connected to notification channel');
        resetBackoff();
        setStatus('connected');
      } else if (status === 'CLOSED') {
        console.warn('[Realtime] Notification channel closed — will auto-reconnect');
        setStatus('disconnected');
        scheduleReconnect(userId);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Realtime] Notification channel error');
        setStatus('error');
        scheduleReconnect(userId);
      } else if (status === 'TIMED_OUT') {
        console.warn('[Realtime] Notification channel timed out');
        setStatus('error');
        scheduleReconnect(userId);
      }
    });
}

/**
 * Tear down all real-time subscriptions.
 * Call on app unmount.
 */
export function destroyRealtimeNotifications(): void {
  resetBackoff();
  if (channel && supabase) {
    supabase.removeChannel(channel);
    channel = null;
  }
  currentUserId = null;
  setStatus('disconnected');
}

/**
 * Check if real-time notifications are currently active.
 */
export function isRealtimeActive(): boolean {
  return channel !== null && currentUserId !== null;
}
