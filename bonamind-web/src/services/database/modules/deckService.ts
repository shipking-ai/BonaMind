import { supabase } from '../supabase';
import { fetchAllPages, type RowsClient } from '../pagedFetch';
import { Deck } from '../../../types';
import { ensureUserSynced } from '../syncUser';
import { cachedDecks, lastOwnerId, setCachedDecks, setLastOwnerId } from './cache';
import { parseIsoToMsOrNow } from '../../../lib/timestamps';

/** The raw `decks` columns the read mapper touches. */
interface DeckRow {
    id: string;
    name: string;
    description: string;
    created_at: string | null;
    is_sample: boolean | null;
    source_label: string | undefined;
}

export const deckService = {
    async fetchDecks(userId: string): Promise<Deck[]> {
        if (!supabase) {
            console.warn('Supabase not initialized, returning empty decks');
            return [];
        }
        
        await ensureUserSynced();
        
        if (cachedDecks && lastOwnerId === userId) {
            return cachedDecks;
        }

        // The decks themselves must page too: a heavy library can exceed the
        // 1000-row request cap, and the old single request silently dropped
        // whole decks past it.
        let deckRows: DeckRow[];
        try {
            deckRows = (await fetchAllPages(
                supabase as unknown as RowsClient,
                'decks',
                '*',
                q => q.eq('user_id', userId).order('created_at', { ascending: true }),
            )) as unknown as DeckRow[];
        } catch (err) {
            console.error('Error fetching decks:', err);
            throw err;
        }

        // Deck counts summed in the database instead of loading one row per
        // card: the previous count read could truncate at 1000 rows and a
        // long .in() list could exceed URL limits. Prefer the
        // deck_card_counts RPC (migration 20261029120000); while it is not
        // applied yet, fall back to a paged deck_id count.
        const deckIds = deckRows.map(d => String(d.id));
        let cardCounts: Record<string, number> = {};
        if (deckIds.length > 0) {
            const rpc = await supabase.rpc('deck_card_counts' as never, { p_deck_ids: deckIds } as never);
            const grouped = (rpc.data ?? null) as { deck_id: string; cards: number }[] | null;
            if (!rpc.error && grouped) {
                cardCounts = grouped.reduce((acc: Record<string, number>, row) => {
                    acc[row.deck_id] = Number(row.cards);
                    return acc;
                }, {});
            } else {
                // No order was present before; paging needs one for stable windows.
                const counted = (await fetchAllPages(
                    supabase as unknown as RowsClient,
                    'cards',
                    'deck_id',
                    q => q.in('deck_id', deckIds).order('deck_id', { ascending: true }),
                )) as unknown as { deck_id: string }[];
                cardCounts = counted.reduce((acc: Record<string, number>, card) => {
                    const id = String(card.deck_id);
                    acc[id] = (acc[id] ?? 0) + 1;
                    return acc;
                }, {});
            }
        }
        
        const res = deckRows.map(d => ({
            id: d.id,
            title: d.name,
            description: d.description,
            // Read-side TIMESTAMPTZ normalization for decks.created_at.
            createdAt: parseIsoToMsOrNow(d.created_at),
            cardCount: cardCounts[String(d.id)] || 0,
            isSample: d.is_sample || false,
            sourceLabel: d.source_label
        }));

        setCachedDecks(res);
        setLastOwnerId(userId);
        return res;
    },

    async createDeck(userId: string, title: string, description: string): Promise<Deck> {
        if (!supabase) throw new Error('Supabase not initialized');
        
        await ensureUserSynced();
        
        const { data, error } = await supabase
            .from('decks')
            .insert({
                user_id: userId,
                name: title,
                description,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating deck:', error);
            throw error;
        }
        
        const newDeck = {
            id: data.id,
            title: data.name,
            description: data.description,
            createdAt: parseIsoToMsOrNow(data.created_at),
            cardCount: 0,
            isSample: data.is_sample || false,
            sourceLabel: data.source_label
        };

        if (cachedDecks && lastOwnerId === userId) {
            setCachedDecks([newDeck, ...cachedDecks]);
        }

        return newDeck;
    },

    async updateDeck(id: string, updates: Partial<Deck>): Promise<Deck> {
        if (!supabase) throw new Error('Supabase not initialized');

        const dbUpdates: Record<string, any> = {};
        if (updates.title !== undefined) dbUpdates.name = updates.title;
        if (updates.description !== undefined) dbUpdates.description = updates.description;

        // Use `.maybeSingle()` rather than `.single()`. RLS UPDATE policies
        // on decks gate by auth.uid() = user_id, so a forged id (or one the
        // user doesn't own) returns 0 rows; `.single()` would throw
        // PGRST116 and crash the caller.
        const { data, error } = await supabase
            .from('decks')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            throw new Error(`Deck ${id} not found or not updatable by the current user`);
        }

        const cached = cachedDecks?.find(d => d.id === id);
        const mapped = {
            id: data.id,
            title: data.name,
            description: data.description,
            createdAt: parseIsoToMsOrNow(data.created_at),
            cardCount: cached?.cardCount ?? 0,
            isSample: data.is_sample || false,
            sourceLabel: data.source_label
        };

        if (cachedDecks) {
            setCachedDecks(cachedDecks.map(deck =>
                deck.id === id ? mapped : deck
            ));
        }

        return mapped;
    },

    async deleteDeck(id: string): Promise<void> {
        if (!supabase) throw new Error('Supabase not initialized');
        
        const { error } = await supabase
            .from('decks')
            .delete()
            .eq('id', id);

        if (error) throw error;

        if (cachedDecks) {
            setCachedDecks(cachedDecks.filter(deck => deck.id !== id));
        }
    }
};



