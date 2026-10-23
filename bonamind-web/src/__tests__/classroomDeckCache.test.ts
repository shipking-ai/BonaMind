import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/database/supabase', () => ({
  requireSupabase: () => ({ rpc }),
}));

import { assignmentService } from '../services/classroom/assignmentService';
import { cachedCards, cachedDecks, setCachedCards, setCachedDecks, setLastOwnerId } from '../services/database/modules/cache';

describe('acceptClassDeck', () => {
  it('drops the cached deck and card lists so the study screen finds the copy', async () => {
    // A primed cache is what made the first "Start" on an assignment bounce
    // back to /dashboard/study: the server-side copy was not in it.
    setCachedDecks([]);
    setCachedCards([]);
    setLastOwnerId('student');
    rpc.mockResolvedValue({ data: { deck_id: 'copy', title: 'Biology' }, error: null });

    await expect(assignmentService.acceptClassDeck('a1')).resolves.toEqual({ deckId: 'copy', title: 'Biology' });

    expect(cachedDecks).toBeNull();
    expect(cachedCards).toBeNull();
  });

  it('keeps the cache when the copy fails', async () => {
    setCachedDecks([]);
    rpc.mockResolvedValue({ data: null, error: { message: 'not a member' } });

    await expect(assignmentService.acceptClassDeck('a1')).rejects.toEqual({ message: 'not a member' });

    expect(cachedDecks).toEqual([]);
  });
});
