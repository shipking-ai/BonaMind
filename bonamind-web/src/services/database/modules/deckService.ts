import { supabase } from '../supabase';
import { Deck } from '../../../types';
import { ensureUserSynced } from '../syncUser';
import { cachedDecks, lastOwnerId, setCachedDecks, setLastOwnerId } from './cache';
import { parseIsoToMsOrNow } from '../../../lib/timestamps';

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

        const { data, error } = await supabase
            .from('decks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching decks:', error);
            throw error;
        }
        
        const { data: cardsData } = await supabase
            .from('cards')
            .select('deck_id')
            .in('deck_id', (data ?? []).map(d => d.id));
        
        const cardCounts = (cardsData ?? []).reduce((acc: any, card: any) => {
            acc[card.deck_id] = (acc[card.deck_id] || 0) + 1;
            return acc;
        }, {});
        
        const res = (data ?? []).map(d => ({
            id: d.id,
            title: d.name,
            description: d.description,
            // Read-side TIMESTAMPTZ normalization for decks.created_at.
            createdAt: parseIsoToMsOrNow(d.created_at),
            cardCount: cardCounts[d.id] || 0,
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



