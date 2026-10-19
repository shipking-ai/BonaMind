import {
  acceptClassDeck, createAssignment, createClassroom, fetchMyRole, fetchMyClassrooms,
  fetchProgressRows, fetchQuizQuestions, joinClassroom, recordDeckProgress,
  submitQuizAttempt, syncProgressForDeck, classifyJoinError,
} from '../../data/classroom';

type SupabaseLike = {
  rpc: jest.Mock;
  from: jest.Mock;
};

let supabase: SupabaseLike;

jest.mock('../../data/supabase', () => ({
  getSupabase: () => (globalThis as any).__supabaseMock,
}));

/** A thenable that also carries .select().single() for create/join RPCs. */
function rpcResult(data: unknown, err: Error | null = null) {
  const payload = Promise.resolve({ data, error: err });
  return Object.assign(payload, { select: () => ({ single: () => payload }) });
}

function fromRows(rows: unknown[], err: Error | null = null) {
  const q: any = {};
  p(q, Promise.resolve({ data: rows, error: err }));
  q.select = () => q;
  q.eq = () => q;
  q.order = () => q;
  q.limit = () => q;
  return q;
}

function p(target: any, promise: Promise<{ data: unknown; error: Error | null }>) {
  target.then = promise.then.bind(promise);
  target.catch = promise.catch.bind(promise);
  target.finally = promise.finally.bind(promise);
}

beforeEach(() => {
  (globalThis as any).__supabaseMock = supabase = {
    rpc: jest.fn(),
    from: jest.fn(),
  };
});

it('maps memberships joined with classrooms', async () => {
  supabase.from.mockReturnValue(fromRows([
    { classroom_id: 'c1', user_id: 'u1', role: 'student', joined_at: '2026-09-01T00:00:00Z', classrooms: { id: 'c1', owner_id: 'o2', title: 'Bio', color: 'pink', invite_code: 'QQQQZZ', created_at: '2026-08-01T00:00:00Z' } },
  ]));
  const ms = await fetchMyClassrooms('u1');
  expect(ms[0]).toMatchObject({ role: 'student', classroom: { id: 'c1', title: 'Bio', color: 'pink', inviteCode: 'QQQQZZ' } });
});

it('creates a class through create_classroom and maps the row', async () => {
  supabase.rpc.mockReturnValue(rpcResult({
    id: 'c1', owner_id: 'u1', title: 'Violet', invite_code: 'ABC123', created_at: '2026-09-01T00:00:00Z',
  }));
  const c = await createClassroom('Violet');
  expect(c).toMatchObject({ id: 'c1', ownerId: 'u1', title: 'Violet', inviteCode: 'ABC123' });
  expect(supabase.rpc).toHaveBeenCalledWith('create_classroom', expect.objectContaining({ p_title: 'Violet' }));
});

it('passes the code through (the screen trims and uppercases it)', async () => {
  supabase.rpc.mockReturnValue(rpcResult({ id: 'c7', owner_id: 'o', title: 'Phys', invite_code: 'XYZ', created_at: null }));
  await joinClassroom('  xyz ');
  expect(supabase.rpc).toHaveBeenLastCalledWith('join_classroom_with_code', { p_code: '  xyz ' });
});

it('classifies join errors', () => {
  expect(classifyJoinError(new Error('join_classroom_with_code: not_found'))).toBe('not_found');
  expect(classifyJoinError(new Error('already_member'))).toBe('already_member');
  expect(classifyJoinError(new Error('other'))).toBe('other');
});

it('maps quiz questions and keeps choices as-is', async () => {
  supabase.rpc.mockReturnValue(rpcResult([
    { card_id: 'k1', prompt: 'Front', choices: ['B', 'A', 'C'] },
  ]));
  await expect(fetchQuizQuestions('a1')).resolves.toEqual([
    { id: 'k1', prompt: 'Front', choices: ['B', 'A', 'C'] },
  ]);
  expect(supabase.rpc).toHaveBeenCalledWith('get_quiz_questions', { p_assignment_id: 'a1' });
});

it('submits answers and maps the graded result', async () => {
  supabase.rpc.mockReturnValue(rpcResult({
    progress_id: 'p', score: 3, score_total: 4, accuracy: 75, attempts: 2,
    missed: [{ front: 'Capital of France' }],
  }));
  const r = await submitQuizAttempt('a1', { k1: 'Berlin' });
  expect(r).toEqual({ score: 3, total: 4, accuracy: 75, attempts: 2, missed: ['Capital of France'] });
  expect(supabase.rpc).toHaveBeenCalledWith('submit_quiz_attempt', { p_assignment_id: 'a1', p_answers: { k1: 'Berlin' } });
});

it('records deck progress with the local deck id', async () => {
  supabase.rpc.mockReturnValue(rpcResult({ status: 'in_progress' }));
  await expect(recordDeckProgress('a1', 'deck9')).resolves.toBe('in_progress');
  expect(supabase.rpc).toHaveBeenCalledWith('record_assignment_progress', {
    p_assignment_id: 'a1', p_local_deck_id: 'deck9',
  });
});

it('refreshes every assignment that a class-copy deck belongs to', async () => {
  supabase.from.mockReturnValue(fromRows([{ assignment_id: 'a1' }, { assignment_id: 'a2' }]));
  const record = supabase.rpc as jest.Mock;
  record.mockReturnValue(rpcResult({ status: 'in_progress' }));
  await syncProgressForDeck('deck9');
  const names = record.mock.calls.map((c: any[]) => c[0]);
  expect(names).toEqual(['record_assignment_progress', 'record_assignment_progress']);
  expect(record.mock.calls.map((c: any[]) => c[1].p_assignment_id)).toEqual(['a1', 'a2']);
});

it('reads the caller role from memberships', async () => {
  supabase.from.mockReturnValue(fromRows([{ role: 'teacher' }]));
  await expect(fetchMyRole('c1')).resolves.toBe('teacher');
  supabase.from.mockReturnValue(fromRows([]));
  await expect(fetchMyRole('c1')).resolves.toBeNull();
});

it('maps progress rows including attempts and local deck', async () => {
  supabase.from.mockReturnValue(fromRows([{
    assignment_id: 'a1', user_id: 'u1', status: 'completed', local_deck_id: 'd9',
    score: 4, score_total: 4, accuracy: 100, cards_total: 4, cards_reviewed: 4,
    details: { attempts: 2 },
  }]));
  await expect(fetchProgressRows('c1')).resolves.toEqual([{
    assignmentId: 'a1', userId: 'u1', status: 'completed', localDeckId: 'd9',
    score: 4, scoreTotal: 4, accuracy: 100, cardsTotal: 4, cardsReviewed: 4, attempts: 2,
  }]);
});

it('creates an assignment of each kind with the deck', async () => {
  supabase.rpc.mockReturnValue(rpcResult({ id: 'z', classroom_id: 'c1', created_by: 'u1', title: 'T', kind: 'quiz', deck_id: 'd1', deck_title: 'D', deck_card_count: 4, created_at: '2026-09-02T00:00:00Z' }));
  const a = await createAssignment({ classroomId: 'c1', title: 'T', kind: 'quiz', deckId: 'd1' });
  expect(a).toMatchObject({ id: 'z', kind: 'quiz', deckId: 'd1', dueAt: null });
  expect(supabase.rpc).toHaveBeenLastCalledWith('create_assignment', expect.objectContaining({ p_kind: 'quiz', p_deck_id: 'd1' }));

  supabase.rpc.mockReturnValue(rpcResult({ id: 'z2', classroom_id: 'c1', created_by: 'u1', title: 'W', kind: 'deck', deck_id: 'd1', due_at: '2026-09-30T00:00:00Z', created_at: '2026-09-02T00:00:00Z' }));
  await expect(createAssignment({ classroomId: 'c1', title: 'W', deckId: 'd1' })).resolves.toMatchObject({ kind: 'deck' as const, dueAt: expect.any(Number) });
});

it('maps the accepted deck result', async () => {
  supabase.rpc.mockReturnValue(rpcResult({ deck_id: 'd1', title: 'Copy' }));
  await expect(acceptClassDeck('a1')).resolves.toEqual({ deckId: 'd1', title: 'Copy' });
});
