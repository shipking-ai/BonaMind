import { supabase } from '../supabase';
import { StudySession } from '../../../types';
import {
  parseIsoToMsOrNow,
  parseIsoToMsOrUndef,
  toIsoOrNull,
} from '../../../lib/timestamps';

export const sessionService = {
    async saveStudySession(session: Omit<StudySession, 'id'>): Promise<StudySession> {
        if (!supabase) throw new Error('Supabase not initialized');

        // Write-side TIMESTAMPTZ sanitization: study_sessions.started_at and
        // ended_at are TIMESTAMPTZ columns. The in-memory StudySession
        // type stores ms-epoch numbers, so without this round 8's PG
        // sanitizer (which only targeted cards.last_reviewed + next_review)
        // would have left `session.startTime` writing 1700000000 directly
        // into the column — Postgres 22008 at the very first session save.
        // toIsoOrNull returns null for blanks (StudySession.endTime is
        // optional for mid-session rows), so undefined → SQL NULL.
        //
        // IMPORTANT: the schema columns are `started_at`/`ended_at` (Postgres
        // idiom), NOT `start_time`/`end_time`. An earlier draft of this
        // service wrote the latter and silently 400'd every save.
        const sessionToInsert = {
            user_id: session.userId,
            deck_id: session.deckId,
            started_at: toIsoOrNull(session.startTime),
            ended_at: toIsoOrNull(session.endTime),
            cards_studied: session.cardsStudied,
            correct_answers: session.correctAnswers,
            total_answers: session.totalAnswers,
            accuracy: session.accuracy,
            // Migration 20260721 adds `duration_ms` to study_sessions.
            // The UI-facing field stays `duration` (ms-epoch delta) so
            // existing callers (useStudyStats, learn-stats widgets) read
            // it without changes.
            duration_ms: session.duration
        };

        const { data, error } = await supabase
            .from('study_sessions')
            .insert(sessionToInsert)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id,
            userId: data.user_id,
            deckId: data.deck_id,
            // Read-side TIMESTAMPTZ normalization. started_at is the
            // canonical session start (always present), ended_at can be null
            // mid-session — parseIsoToMsOrUndef keeps that null distinct
            // from a parsed ms-epoch.
            startTime: parseIsoToMsOrNow(data.started_at),
            endTime: parseIsoToMsOrUndef(data.ended_at),
            cardsStudied: data.cards_studied,
            correctAnswers: data.correct_answers,
            totalAnswers: data.total_answers,
            accuracy: data.accuracy,
            duration: data.duration_ms
        };
    },

    async fetchStudySessions(userId: string): Promise<StudySession[]> {
        if (!supabase) {
            console.warn('Supabase not initialized, returning empty sessions');
            return [];
        }

        const { data, error } = await supabase
            .from('study_sessions')
            .select('*')
            .eq('user_id', userId)
            // Schema column is `started_at`, not `start_time` — ORDER BY on
            // an unknown column returns 400 (PostgREST validates qualifier
            // names in ORDER BY just like in WHERE).
            .order('started_at', { ascending: false });

        if (error) {
            console.error('Error fetching study sessions:', error);
            throw error;
        }

        return (data ?? []).map(s => ({
            id: s.id,
            userId: s.user_id,
            deckId: s.deck_id,
            // Schema columns are `started_at`/`ended_at`. The 20260721 migration
            // also added the canonical `cards_studied` / `correct_answers` /
            // `total_answers` / `accuracy` / `duration_ms` columns; the
            // older snake_case `cards_correct` / `cards_reviewed` columns
            // remain readable for backward compatibility but are not the
            // source of truth for new sessions.
            startTime: parseIsoToMsOrNow(s.started_at),
            endTime: parseIsoToMsOrUndef(s.ended_at),
            cardsStudied: s.cards_studied,
            correctAnswers: s.correct_answers,
            totalAnswers: s.total_answers,
            accuracy: s.accuracy,
            duration: s.duration_ms ?? s.duration  // fallback for legacy rows without duration_ms
        }));
    }
};



