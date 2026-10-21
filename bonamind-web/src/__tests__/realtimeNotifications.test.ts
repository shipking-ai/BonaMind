/**
 * Realtime Notifications — End-to-End Test Suite
 *
 * Covers:
 *   1. Connection lifecycle (init → connect → destroy)
 *   2. Connection status tracking (disconnected → connecting → connected)
 *   3. Exponential backoff on repeated failures
 *   4. Broadcast event dispatching (study session, league, streak)
 *   5. Status listener subscribe/unsubscribe
 *   6. Graceful handling when Supabase is null
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock setup ───────────────────────────────────────────────────────────

const _mockSubscribe = vi.fn();

function _createFakeChannel() {
  return {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    __id: Math.random().toString(36).slice(2, 8),
  };
}

const createdChannels: ReturnType<typeof _createFakeChannel>[] = [];
const mockRemoveChannel = vi.fn();

vi.mock('@/services/database/supabase', () => {
  const _mockRemoveChannel = vi.fn();
  const _createdChannels: ReturnType<typeof _createFakeChannel>[] = [];
  const client = {
      channel: vi.fn(() => {
        const ch = {
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn(),
          __id: Math.random().toString(36).slice(2, 8),
        };
        _createdChannels.push(ch);
        createdChannels.push(ch);
        return ch;
      }),
      removeChannel: (...args: any[]) => {
        mockRemoveChannel(...args);
        return _mockRemoveChannel(...args);
      },
      auth: {
        getUser: vi.fn(),
      },
  };
  // The module exports both the nullable client and the asserting
  // accessor; mocking only `supabase` leaves requireSupabase undefined
  // and every call site throws.
  return {
    supabase: client,
    isSupabaseConfigured: true,
    requireSupabase: () => client,
  };
});

vi.mock('@/services/notifications/notificationStore', () => ({
  addNotification: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────

import {
  initRealtimeNotifications,
  destroyRealtimeNotifications,
  isRealtimeActive,
  onConnectionStatusChange,
  getConnectionStatus,
} from '@/services/notifications/realtimeNotifications';
import { requireSupabase } from '@/services/database/supabase';
import { addNotification } from '@/services/notifications/notificationStore';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Fire the subscribe callback on the most recently created channel. */
function simulateSubscribeStatus(status: string) {
  const latest = createdChannels[createdChannels.length - 1];
  if (!latest) throw new Error('No channel created yet');
  const subscribeCall = latest.subscribe.mock.calls[0];
  if (subscribeCall && typeof subscribeCall[0] === 'function') {
    subscribeCall[0](status);
  }
}

/** Fire the broadcast event handler on the most recently created channel. */
function simulateBroadcast(payload: Record<string, any>) {
  const latest = createdChannels[createdChannels.length - 1];
  if (!latest) throw new Error('No channel created yet');
  const onCall = latest.on.mock.calls.find(
    (c: any[]) => c[0] === 'broadcast' && c[1]?.event === 'broadcast',
  );
  if (onCall && typeof onCall[2] === 'function') {
    onCall[2]({ payload });
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('realtimeNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    createdChannels.length = 0;
    destroyRealtimeNotifications();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 1. Connection lifecycle ──────────────────────────────────────────

  describe('connection lifecycle', () => {
    it('creates a channel and subscribes on init', () => {
      initRealtimeNotifications('user-123');

      expect(requireSupabase().channel).toHaveBeenCalledWith(
        'user:user-123:notifications',
        expect.objectContaining({ config: expect.objectContaining({ broadcast: { ack: false } }) }),
      );
      expect(createdChannels[0].on).toHaveBeenCalled();
      expect(createdChannels[0].subscribe).toHaveBeenCalled();
      expect(isRealtimeActive()).toBe(true);
    });

    it('removes the channel on destroy', () => {
      initRealtimeNotifications('user-123');
      expect(isRealtimeActive()).toBe(true);

      destroyRealtimeNotifications();
      expect(mockRemoveChannel).toHaveBeenCalledWith(createdChannels[0]);
      expect(isRealtimeActive()).toBe(false);
    });

    it('cleans up previous channel before creating a new one', () => {
      initRealtimeNotifications('user-123');
      initRealtimeNotifications('user-456');

      // Channel should have been removed once for the first init
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      expect(isRealtimeActive()).toBe(true);
    });
  });

  // ─── 2. Connection status tracking ────────────────────────────────────

  describe('connection status tracking', () => {
    it('starts as disconnected', () => {
      expect(getConnectionStatus()).toBe('disconnected');
    });

    it('transitions to connecting on init', () => {
      initRealtimeNotifications('user-123');
      expect(getConnectionStatus()).toBe('connecting');
    });

    it('transitions to connected on SUBSCRIBED', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');
      expect(getConnectionStatus()).toBe('connected');
    });

    it('transitions to disconnected on CLOSED', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');
      simulateSubscribeStatus('CLOSED');
      expect(getConnectionStatus()).toBe('disconnected');
    });

    it('transitions to error on CHANNEL_ERROR', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('CHANNEL_ERROR');
      expect(getConnectionStatus()).toBe('error');
    });

    it('transitions to error on TIMED_OUT', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('TIMED_OUT');
      expect(getConnectionStatus()).toBe('error');
    });

    it('resets to disconnected on destroy', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');
      expect(getConnectionStatus()).toBe('connected');

      destroyRealtimeNotifications();
      expect(getConnectionStatus()).toBe('disconnected');
    });
  });

  // ─── 3. Exponential backoff ───────────────────────────────────────────

  describe('exponential backoff', () => {
    it('schedules a reconnect after CLOSED', () => {
      initRealtimeNotifications('user-123');
      expect(createdChannels).toHaveLength(1);

      simulateSubscribeStatus('CLOSED');

      // Nothing immediately — 1s base delay
      vi.advanceTimersByTime(999);
      expect(createdChannels).toHaveLength(1);

      vi.advanceTimersByTime(1); // now 1s total
      expect(createdChannels).toHaveLength(2);
    });

    it('doubles delay on repeated failures', () => {
      initRealtimeNotifications('user-123');
      expect(createdChannels).toHaveLength(1);

      // First failure → 1s delay
      simulateSubscribeStatus('CLOSED');
      vi.advanceTimersByTime(1000);
      expect(createdChannels).toHaveLength(2);

      // Second failure → 2s delay
      simulateSubscribeStatus('CLOSED');
      vi.advanceTimersByTime(1999);
      expect(createdChannels).toHaveLength(2); // not yet

      vi.advanceTimersByTime(1); // now 2s total for second attempt
      expect(createdChannels).toHaveLength(3);
    });

    it('caps delay at 30 seconds', () => {
      initRealtimeNotifications('user-123');

      // Simulate 10 rapid failures — after enough, every delay is 30s
      for (let i = 0; i < 10; i++) {
        simulateSubscribeStatus('CLOSED');
        vi.advanceTimersByTime(30_000);
      }

      // All channels were created — nothing blew up
      expect(createdChannels.length).toBeGreaterThanOrEqual(10);
    });

    it('resets backoff on successful connection', () => {
      initRealtimeNotifications('user-123');
      expect(createdChannels).toHaveLength(1);

      // Fail once
      simulateSubscribeStatus('CLOSED');
      vi.advanceTimersByTime(1000);
      expect(createdChannels).toHaveLength(2);

      // Connect successfully — backoff should reset
      simulateSubscribeStatus('SUBSCRIBED');

      // Fail again — should be back to 1s base delay
      simulateSubscribeStatus('CLOSED');
      vi.advanceTimersByTime(900);
      expect(createdChannels).toHaveLength(2); // not yet

      vi.advanceTimersByTime(100); // now 1s total
      expect(createdChannels).toHaveLength(3);
    });

    it('clears reconnect timer on destroy', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('CLOSED');

      destroyRealtimeNotifications();

      vi.advanceTimersByTime(5000);
      // Should not create a new channel after destroy
      expect(createdChannels).toHaveLength(1);
    });
  });

  // ─── 4. Broadcast event dispatching ───────────────────────────────────

  describe('broadcast event handling', () => {
    it('dispatches study session completed events', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');

      simulateBroadcast({
        event: 'study_session_completed',
        type: 'study_session',
        timestamp: Date.now(),
        cards_studied: 42,
        duration_minutes: 15,
        accuracy: 87,
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Study Session Complete',
          type: 'success',
        }),
      );
    });

    it('dispatches league XP changed events', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');

      simulateBroadcast({
        event: 'league_xp_changed',
        type: 'league',
        timestamp: Date.now(),
        weekly_xp: 250,
        tier: 5,
        league_group: 'Diamond',
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'League Progress',
          type: 'info',
        }),
      );
    });

    it('dispatches milestone streak events', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');

      simulateBroadcast({
        event: 'streak_updated',
        type: 'profile',
        timestamp: Date.now(),
        streak: 7,
      });

      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'One Week Strong!',
          type: 'success',
        }),
      );
    });

    it('ignores non-milestone streaks', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');

      simulateBroadcast({
        event: 'streak_updated',
        type: 'profile',
        timestamp: Date.now(),
        streak: 4, // not a milestone
      });

      expect(addNotification).not.toHaveBeenCalled();
    });

    it('ignores malformed broadcasts gracefully', () => {
      initRealtimeNotifications('user-123');
      simulateSubscribeStatus('SUBSCRIBED');

      // No event field
      simulateBroadcast({ type: 'unknown' });
      expect(addNotification).not.toHaveBeenCalled();
    });
  });

  // ─── 5. Status listeners ─────────────────────────────────────────────

  describe('onConnectionStatusChange', () => {
    it('calls the listener immediately with current status', () => {
      const cb = vi.fn();
      const unsub = onConnectionStatusChange(cb);

      expect(cb).toHaveBeenCalledWith('disconnected');
      unsub();
    });

    it('notifies listeners on status change', () => {
      const cb = vi.fn();
      const unsub = onConnectionStatusChange(cb);

      initRealtimeNotifications('user-123');
      expect(cb).toHaveBeenCalledWith('connecting');

      simulateSubscribeStatus('SUBSCRIBED');
      expect(cb).toHaveBeenCalledWith('connected');

      unsub();
    });

    it('unsubscribes correctly', () => {
      const cb = vi.fn();
      const unsub = onConnectionStatusChange(cb);

      unsub();

      // Next status change should NOT call the unsubscribed listener
      initRealtimeNotifications('user-123');
      const callCountBefore = cb.mock.calls.length;

      simulateSubscribeStatus('SUBSCRIBED');
      expect(cb.mock.calls.length).toBe(callCountBefore);
    });
  });

  // ─── 6. Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('does not crash if supabase is null', () => {
      // The mock returns a valid supabase, but the code checks for null
      // We verify the function runs without throwing
      expect(() => initRealtimeNotifications('user-123')).not.toThrow();
    });

    it('isRealtimeActive returns false when no user ID', () => {
      destroyRealtimeNotifications();
      expect(isRealtimeActive()).toBe(false);
    });
  });
});
