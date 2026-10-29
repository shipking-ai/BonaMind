/**
 * useMultiplayerStudy — ephemeral presence + broadcast for shared study rooms.
 *
 * Scope (per thinker review): pure broadcast channel — no durable
 * study_rooms table. Late joiners do NOT see activity before they joined;
 * that's accepted in exchange for not having to clean up zombie rows.
 *
 * Wire shape on `presence` event:
 *   { userId, name, avatar, currentCardIndex, lastRating, lastSeen }
 *
 * Wire shape on `event` payload:
 *   { type: 'rated' | 'next' | 'progress', deckId, ... }
 *
 * Usage:
 *   const { others, sendRating, sendProgress, online } =
 *     useMultiplayerStudy({ deckId, userId, name });
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, requireSupabase } from '../services/database/supabase';

export interface PeerState {
  userId: string;
  name: string;
  avatar?: string;
  currentCardIndex: number;
  lastRating: 'again' | 'hard' | 'good' | 'easy' | null;
  lastSeen: number;
}

export interface MultiplayerState {
  /** Other users in the same study room (excludes the current user). */
  others: PeerState[];
  /** Total online presence count (including self). */
  online: number;
  /** True when the underlying realtime channel is in SUBSCRIBED state. */
  isConnected: boolean;
  /** Broadcast a rating this user just gave. */
  sendRating: (cardIndex: number, rating: 'again' | 'hard' | 'good' | 'easy') => void;
  /** Broadcast a current-card-index change. Throttled by the caller. */
  sendProgress: (cardIndex: number) => void;
}

interface Options {
  /** Topic key — usually deckId but could be a room key for shared events. */
  deckId: string;
  currentUserId: string;
  name: string;
  avatar?: string;
  /** Disable the hook (e.g., when user opts out). */
  enabled?: boolean;
}

const SUBPROTOCOL_VERSION = 1;

export function useMultiplayerStudy(opts: Options): MultiplayerState {
  const { deckId, currentUserId, name, avatar, enabled = true } = opts;
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const presenceRef = useRef({
    userId: currentUserId,
    name,
    avatar,
    currentCardIndex: 0,
    lastRating: null as PeerState['lastRating'],
    lastSeen: 0,
    v: SUBPROTOCOL_VERSION,
  });

  // Keep presenceRef current with the latest user identity so broadcasts
  // and the PRESENCE sync payload don't drift if `name` etc. change mid-session.
  useEffect(() => {
    presenceRef.current = { ...presenceRef.current, userId: currentUserId, name, avatar };
  }, [currentUserId, name, avatar]);

  const channelName = useMemo(() => `study:${deckId}`, [deckId]);

  useEffect(() => {
    if (!enabled || !supabase || !currentUserId) {
      subscribedRef.current = false;
      return;
    }

    const channel = requireSupabase().channel(channelName, {
      config: { presence: { key: currentUserId }, broadcast: { ack: false } },
    });
    channelRef.current = channel;
    subscribedRef.current = false;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<typeof presenceRef.current>();
        const next = new Map<string, PeerState>();
        for (const [key, rawPresences] of Object.entries(state)) {
          for (const p of rawPresences) {
            if (!p || p.userId === currentUserId) continue;
            next.set(p.userId ?? key, {
              userId: p.userId ?? key,
              name: p.name ?? 'Learner',
              avatar: p.avatar,
              currentCardIndex: p.currentCardIndex ?? 0,
              lastRating: p.lastRating ?? null,
              lastSeen: p.lastSeen ?? Date.now(),
            });
          }
        }
        setPeers(next);
      })
      .on('broadcast', { event: 'rating' }, (msg) => {
        const payload = (msg?.payload ?? {}) as Partial<PeerState> & { userId: string };
        if (!payload.userId || payload.userId === currentUserId) return;
        setPeers(prev => {
          const m = new Map(prev);
          m.set(payload.userId, {
            ...(m.get(payload.userId) ?? {
              userId: payload.userId,
              name: 'Learner',
              currentCardIndex: 0,
              lastRating: null,
              lastSeen: Date.now(),
            }),
            lastRating: (payload.lastRating ?? null) as PeerState['lastRating'],
            currentCardIndex: payload.currentCardIndex ?? 0,
            lastSeen: Date.now(),
          });
          return m;
        });
      })
      .on('broadcast', { event: 'progress' }, (msg) => {
        const payload = (msg?.payload ?? {}) as Partial<PeerState> & { userId: string };
        if (!payload.userId || payload.userId === currentUserId) return;
        setPeers(prev => {
          const m = new Map(prev);
          const existing = m.get(payload.userId);
          m.set(payload.userId, {
            userId: payload.userId,
            name: existing?.name ?? 'Learner',
            avatar: existing?.avatar,
            currentCardIndex: payload.currentCardIndex ?? 0,
            lastRating: existing?.lastRating ?? null,
            lastSeen: Date.now(),
          });
          return m;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          subscribedRef.current = true;
          setIsConnected(true);
          presenceRef.current = { ...presenceRef.current, lastSeen: Date.now() };
          await channel.track(presenceRef.current);
        } else {
          subscribedRef.current = false;
          setIsConnected(false);
        }
      });

    return () => {
      subscribedRef.current = false;
      setIsConnected(false);
      try { channel.untrack(); } catch { /* channel may already be closed */ }
      if (supabase) requireSupabase().removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [enabled, currentUserId, channelName]);

  // Drop peers that haven't pinged in 60s — they probably disconnected.
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 60_000;
      setPeers(prev => {
        const next = new Map(prev);
        for (const [k, p] of next) {
          if (p.lastSeen < cutoff) next.delete(k);
        }
        return prev.size === next.size ? prev : next;
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, []);

  // Broadcast through the SUBSCRIBED channel instance — calling
  // requireSupabase().channel(name).send() on a fresh (unsubscribed) channel was
  // silently dropping every message.
  const broadcast = useMemo(() => {
    return (event: 'rating' | 'progress', payload: Record<string, unknown>) => {
      const channel = channelRef.current;
      if (!supabase || !channel || !subscribedRef.current) return;
      channel.send({ type: 'broadcast', event, payload });
    };
  }, []);

  return {
    others: Array.from(peers.values()),
    online: peers.size + 1,
    isConnected,
    sendRating: (cardIndex, rating) => {
      presenceRef.current = { ...presenceRef.current, currentCardIndex: cardIndex, lastRating: rating, lastSeen: Date.now() };
      broadcast('rating', { ...presenceRef.current, userId: currentUserId });
    },
    sendProgress: (cardIndex) => {
      presenceRef.current = { ...presenceRef.current, currentCardIndex: cardIndex, lastSeen: Date.now() };
      broadcast('progress', { ...presenceRef.current, userId: currentUserId });
    },
  };
}

export default useMultiplayerStudy;
