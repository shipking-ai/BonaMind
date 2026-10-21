import { supabase } from '../supabase';
import { Card } from '../../../types';
import { ensureUserSynced } from '../syncUser';
import { cachedCards, lastOwnerId, setCachedCards, setLastOwnerId } from './cache';
import { applyPersonalizedDifficultyInit } from '../../study/fsrs';
import { toIsoOrUndef, parseIsoToMsOrNow, parseIsoToMsOrUndef } from '../../../lib/timestamps';

// ---------------------------------------------------------------
// Pure mapper extracted for test coverage. StudyModePage.handleRate
// relies on this for the schedule fields actually reaching the
// database. Extracting it lets a regression test confirm that the
// SRS schedule fields map to their correct column names WITHOUT
// having to mock supabase.
// ---------------------------------------------------------------

/**
 * The two TIMESTAMPTZ columns on `cards` (next_review, last_reviewed) accept
 * either:
 *   (a) a JS `number` (ms-since-epoch) — what StudyModePage.handleRate
 *       ships today;
 *   (b) a JS `string` (ISO 8601 UTC) — what the read-side mappers
 *       propagate back from a row fetched minutes ago. A user-driven
 *       "edit-and-resave" path that round-trips a card through
 *       fetchCards→updateCard would otherwise have to convert back to a
 *       ms-epoch number first; broaden the type to accept both shapes
 *       and let `toIsoOrUndef` decide.
 *
 * `null` is also accepted so a caller that explicitly wants to "clear"
 * the last_reviewed column can do `payload.last_reviewed = null` without
 * a TS fight.
 */
export interface CardUpdateInput extends Partial<Omit<Card, 'nextReview' | 'lastReviewed'>> {
  nextReview?: number | string | null;
  lastReviewed?: number | string | null;
}

/** Maps the in-memory `Card` partial-update to a DB-row-shaped payload.
 *
 *  Column renames: deckId→deck_id, easeFactor→ease_factor, nextReview→
 *  next_review, lastReviewed→last_reviewed, fsrsState→fsrs_state (also
 *  JSON-stringified). The schedule fields (interval, repetition) are
 *  passed through unchanged because the column names already match the
 *  camelCase keys.
 *
 *  Header / image / understanding_level are also exposed even though
 *  StudyModePage doesn't flush them today — knowing they round-trip
 *  correctly matters for future callers and was previously a silent
 *  drop.
 */
export function buildUpdatePayload(updates: CardUpdateInput): Record<string, any> {
  const out: Record<string, any> = {};
  // SRS schedule fields — StudyModePage.handleRate flushes these after
  // every review. The original mapper handled content + provenance +
  // fsrs_state (deckId → deck_id, front → front, back → back, header,
  // image, understanding_level, source_*, trust_score, verified,
  // fsrs_state→fsrs_state JSON) but SILENTLY DROPPED two parallel sets:
  //   (a) SRS schedule columns — interval, repetition,
  //       easeFactor→ease_factor, nextReview→next_review,
  //       lastReviewed→last_reviewed
  //   (b) alternative-API card-content fallthroughs — when callers pass
  //       {question} instead of {front} or {answer} instead of {back},
  //       earlier code did NOT route them to the SQL columns.
  // The net effect for review sessions: Supabase saw a structurally
  // empty UPDATE payload and `data.length === 0` triggered the
  // "0 rows returned" study-mode warning. This refactor + the regression
  // suite in __tests__/bugFixRegression.test.ts pin the JS→DB contract
  // so future "simplifications" visibly break.
  if (updates.interval !== undefined) out.interval = updates.interval;
  if (updates.repetition !== undefined) out.repetition = updates.repetition;
  if (updates.easeFactor !== undefined) out.ease_factor = updates.easeFactor;
  // TIMESTAMPTZ columns (`next_review`, `last_reviewed` on cards) require
  // ISO 8601 strings, NOT raw ms-epoch integers. StudyModePage.handleRate
  // ships `nextReview: Date.now() + res.interval * 86400000` (a number) and
  // `lastReviewed: Date.now()` (a number) — which is fine for in-memory due-
  // date comparison but Postgres fires **22008 datetime_field_overflow** when
  // it tries to coerce the integer to a TIMESTAMPTZ literal. toIsoOrUndef:
  //  - Number → ISO string (the wire format PostgREST accepts)
  //  - String → passthrough (if a caller already ISO'd)
  //  - null/undefined/NaN → omit the column (safer than a 4xx crash)
  // See __tests__/bugFixRegression.test.ts for the regression pinning.
  if (updates.nextReview !== undefined) {
    const nextReviewIso = toIsoOrUndef(updates.nextReview);
    if (nextReviewIso !== undefined) out.next_review = nextReviewIso;
  }
  if (updates.lastReviewed !== undefined) {
    const lastReviewedIso = toIsoOrUndef(updates.lastReviewed);
    if (lastReviewedIso !== undefined) out.last_reviewed = lastReviewedIso;
  }
  // Card content + provenance
  if (updates.deckId !== undefined) out.deck_id = updates.deckId;
  if ((updates as any).front !== undefined) out.front = (updates as any).front;
  else if ((updates as any).question !== undefined) out.front = (updates as any).question;
  if ((updates as any).back !== undefined) out.back = (updates as any).back;
  else if ((updates as any).answer !== undefined) out.back = (updates as any).answer;
  if ((updates as any).header !== undefined) out.header = (updates as any).header;
  if (updates.image !== undefined) out.image = updates.image;
  if (updates.understandingLevel !== undefined) out.understanding_level = updates.understandingLevel;
  // Provenance + fact-check metadata
  if (updates.sourceType !== undefined) out.source_type = updates.sourceType;
  if (updates.sourceLabel !== undefined) out.source_label = updates.sourceLabel;
  if (updates.citations !== undefined) out.citations = updates.citations;
  if (updates.trustScore !== undefined) out.trust_score = updates.trustScore;
  if (updates.verified !== undefined) out.verified = updates.verified;
  if (updates.fsrsState !== undefined) {
    // Caller usually passes the FSRS state as an object; the column is
    // JSON-encoded, so we stringify. If a caller passes an already-stringified
    // payload (legacy import paths that pre-encoded), do NOT re-encode —
    // otherwise the next fetchCards round-trip surfaces a
    // '"{\"stability\":1,...}"'-style blob that fails the typeof-string
    // branch in the mapper.
    const fsrsStateValue = updates.fsrsState as unknown;
    out.fsrs_state = (fsrsStateValue !== null && typeof fsrsStateValue === 'object')
      ? JSON.stringify(fsrsStateValue)
      // Pass through already-stringified payloads verbatim (no double-encode).
      // `String(null ?? '')` falls through to '' so explicit null writes no
      // garbage; an already-stringified payload survives the round-trip.
      : String(fsrsStateValue ?? '');
  }
  return out;
}

export const cardService = {
    async fetchCards(userId: string): Promise<Card[]> {
        if (!supabase) {
            console.warn('Supabase not initialized, returning empty cards');
            return [];
        }
        
        await ensureUserSynced();
        
        if (cachedCards && lastOwnerId === userId) {
            return cachedCards;
        }

        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('user_id', userId)
            .order('id', { ascending: true });

        if (error) {
            console.error('Error fetching cards:', error);
            return [];
        }

        const res = (data ?? []).map(c => ({
            id: c.id,
            front: c.front,
            back: c.back,
            deckId: c.deck_id,
            image: c.image,
            // Read-side TIMESTAMPTZ normalization: PG returns ISO 8601 strings;
            // the in-memory `Card` type expects ms-epoch numbers so due-date
            // comparison (`c.nextReview <= Date.now()`) keeps working.
            // parseIsoToMsOrNow preserves the previous `|| Date.now()` fallback.
            nextReview: parseIsoToMsOrNow(c.next_review),
            interval: c.interval || 0,
            easeFactor: c.ease_factor || 2.5,
            repetition: c.repetition || 0,
            // 20260718 migration added cards.lapses (times forgotten); the
            // tutor's "weak spots" context and weak-card badges depend on it.
            lapses: c.lapses ?? undefined,
            understandingLevel: c.understanding_level,
            lastReviewed: parseIsoToMsOrUndef(c.last_reviewed),
            sourceType: c.source_type,
            sourceLabel: c.source_label,
            citations: c.citations,
            trustScore: c.trust_score,
            verified: c.verified,
            fsrsState: c.fsrs_state ? (typeof c.fsrs_state === 'string' ? JSON.parse(c.fsrs_state) : c.fsrs_state) : undefined
        }));

        setCachedCards(res);
        setLastOwnerId(userId);
        return res;
    },

    /**
     * Persist one or more new cards. The optional `personalization` arg carries
     * the user's FSRS profile so cards that lack a preset fsrs_state get a
     * difficulty biased to the profile's mean-reversion center rather than
     * the population default. Without `personalization` the helper is a no-op
     * and every card gets vanilla DEFAULT_WEIGHTS[4] = 7.21 difficulty.
     */
    async saveCards(
        userId: string,
        cards: Partial<Card>[],
        personalization?: { profileLabel?: string | null; weightsOverride?: number[] },
    ): Promise<Card[]> {
        if (!supabase) throw new Error('Supabase not initialized');
        
        await ensureUserSynced();
        
        const cardsToInsert = cards.map(card => {
            // If the caller did not pre-attach an fsrs_state, run the
            // personalized init so a fast-learner/tough-learner doesn't see
            // a default-everyone card on first review.
            const biased = card.fsrsState
                ? { card, applied: false }
                : applyPersonalizedDifficultyInit(
                    card as Card,
                    personalization?.profileLabel ?? null,
                    personalization?.weightsOverride,
                );
            const resolvedState = biased.card.fsrsState;
            const row: Record<string, any> = {
                user_id: userId,
                deck_id: card.deckId,
                front: (card as any).front || (card as any).question,
                back: (card as any).back || (card as any).answer,
            };
            if ((card as any).header != null) row.header = (card as any).header;
            if (card.image != null) row.image = card.image;
            if (card.sourceType != null) row.source_type = card.sourceType;
            if (card.sourceLabel != null) row.source_label = card.sourceLabel;
            if (card.citations != null) row.citations = card.citations;
            if (card.trustScore != null) row.trust_score = card.trustScore;
            if (card.verified != null) row.verified = card.verified;
            if (resolvedState != null) row.fsrs_state = JSON.stringify(resolvedState);
            return row;
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        const res = await fetch(`${supabaseUrl}/rest/v1/cards`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${accessToken || supabaseAnonKey}`,
                'Prefer': 'return=representation',
            },
            body: JSON.stringify(cardsToInsert),
        });

        if (!res.ok) {
            const errBody = await res.json();
            throw errBody;
        }

        const data = await res.json();
        const savedCards = data.map((c: any) => ({
            id: c.id,
            front: c.front,
            back: c.back,
            header: c.header,
            deckId: c.deck_id,
            image: c.image,
            nextReview: parseIsoToMsOrNow(c.next_review),
            interval: c.interval || 0,
            easeFactor: c.ease_factor || 2.5,
            repetition: c.repetition || 0,
            lapses: c.lapses ?? undefined,
            understandingLevel: c.understanding_level,
            lastReviewed: parseIsoToMsOrUndef(c.last_reviewed),
            sourceType: c.source_type,
            sourceLabel: c.source_label,
            citations: c.citations,
            trustScore: c.trust_score,
            verified: c.verified,
            fsrsState: c.fsrs_state ? (typeof c.fsrs_state === 'string' ? JSON.parse(c.fsrs_state) : c.fsrs_state) : undefined
        }));

        if (cachedCards) {
            setCachedCards([...savedCards, ...cachedCards]);
        }

        return savedCards;
    },

    async updateCard(id: string, updates: CardUpdateInput): Promise<Card> {
        if (!supabase) throw new Error('Supabase not initialized');

        // Single source of truth for the JS->DB mapping (also exported for
        // unit tests in __tests__/bugFixRegression.test.ts). Keeps the SRS
        // schedule fields (interval, repetition, easeFactor, nextReview,
        // lastReviewed, fsrsState) wired so Supabase can actually match
        // and update the row.
        const updatesForDb = buildUpdatePayload(updates);

        // Optimistically update local cache first so the UI never waits on the network.
        // The merge intentionally allows nextReview/lastReviewed to be ISO
        // strings (read-back path) OR numbers (in-memory write path). The
        // optimistic-card projection NORMALIZES those two fields through
        // parseIsoToMsOrUndef BEFORE we write to the cache, so a cache-hit
        // navigation later in the same session (when nextReview must
        // already be a number for `c.nextReview <= Date.now()` to work)
        // never serves the user a string-typed SRS schedule. The `as Card`
        // cast is still necessary because the spread intersection widens
        // the type; the normalization guarantee is what makes the cast
        // safe at runtime.
        const existingCard = cachedCards?.find(card => card.id === id);
        const optimisticCard: Card | undefined = existingCard
            ? ({
                ...existingCard,
                ...updates,
                id,
                nextReview: parseIsoToMsOrUndef(updates.nextReview) ?? existingCard.nextReview,
                lastReviewed: parseIsoToMsOrUndef(updates.lastReviewed),
              } as Card)
            : undefined;

        if (optimisticCard && cachedCards) {
            setCachedCards(cachedCards.map(card =>
                card.id === id ? optimisticCard : card
            ));
        }

        // Use .select() without .single() so a missing RLS UPDATE policy (0 rows)
        // does not crash the app with PGRST116.
        const { data, error } = await supabase
            .from('cards')
            .update(updatesForDb)
            .eq('id', id)
            .select();

        if (error) {
            // Don't block the study session; keep the optimistic update in cache.
            console.warn('Supabase updateCard failed (keeping optimistic update):', error);
            if (!optimisticCard) throw error;
            return optimisticCard;
        }

        const row = data && data.length > 0 ? data[0] : null;
        if (!row) {
            // A real, well-formed payload was sent but no rows came back.
            // The mapper used to silently drop schedule fields, so an
            // "empty payload" used to land here too — the buildUpdatePayload
            // refactor + regression test keep that class of bug silent now,
            // and the remaining plausible causes are:
            //   1. RLS UPDATE policy filters out the row
            //      (auth.uid() ≠ row.user_id, or the user_id column is
            //      missing on the row)
            //   2. The card.id passed in doesn't match any row
            // surface the actual failed-payload state + authUid so the
            //      next debug session can pinpoint which one fired.
            const { data: { session } } = await supabase.auth.getSession();
            console.warn('Supabase updateCard returned 0 rows despite a valid payload. RLS rejected, auth UID mismatch, or card.id not found.', {
                cardId: id,
                payloadKeys: Object.keys(updatesForDb),
                authUid: session?.user?.id ?? null,
                hasAuthToken: !!session?.access_token,
            });
            if (!optimisticCard) throw new Error(`Card ${id} not found or not updatable`);
            return optimisticCard;
        }

        const updatedCard: Card = {
            id: row.id,
            front: row.front,
            back: row.back,
            deckId: row.deck_id,
            image: row.image,
            nextReview: parseIsoToMsOrNow(row.next_review),
            interval: row.interval || 0,
            easeFactor: row.ease_factor || 2.5,
            repetition: row.repetition || 0,
            understandingLevel: row.understanding_level,
            lastReviewed: parseIsoToMsOrUndef(row.last_reviewed),
            sourceType: row.source_type,
            sourceLabel: row.source_label,
            citations: row.citations,
            trustScore: row.trust_score,
            verified: row.verified,
            fsrsState: row.fsrs_state ? (typeof row.fsrs_state === 'string' ? JSON.parse(row.fsrs_state) : row.fsrs_state) : undefined
        };

        if (cachedCards) {
            setCachedCards(cachedCards.map(card => 
                card.id === id ? updatedCard : card
            ));
        }

        return updatedCard;
    },

    async deleteCard(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase not initialized');
        
        const { error } = await supabase
            .from('cards')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (cachedCards) {
            setCachedCards(cachedCards.filter(card => card.id !== id));
        }
    }
};



