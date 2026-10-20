import { getSupabase } from './supabase';

export type ClassroomRole = 'teacher' | 'student';

export interface Classroom {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  subject: string | null;
  color: string;
  inviteCode: string;
  createdAt: number;
}

export interface ClassroomMembership {
  classroomId: string;
  userId: string;
  role: ClassroomRole;
  joinedAt: number;
  classroom: Classroom;
}

export interface RosterEntry {
  userId: string;
  displayName: string;
  email: string | null;
  role: ClassroomRole;
  joinedAt: number;
}

export interface Assignment {
  id: string;
  classroomId: string;
  createdBy: string;
  title: string;
  instructions: string | null;
  kind: 'deck' | 'quiz';
  deckId: string | null;
  deckTitle: string | null;
  deckCardCount: number;
  dueAt: number | null;
  createdAt: number;
}

export interface AssignmentProgress {
  id: string;
  assignmentId: string;
  classroomId: string;
  userId: string;
  localDeckId: string | null;
  status: 'assigned' | 'in_progress' | 'completed';
  cardsTotal: number | null;
  cardsReviewed: number | null;
}

/** A quiz question for one student. The server never sends which choice is right. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

/** The server's grading of one attempt. */
export interface QuizResult {
  score: number;
  total: number;
  accuracy: number;
  attempts: number;
  missed: string[];
}

/** One student's progress row for a class (own row for students, all rows for teachers). */
export interface ProgressRow {
  assignmentId: string;
  userId: string;
  status: 'assigned' | 'in_progress' | 'completed';
  localDeckId: string | null;
  score: number | null;
  scoreTotal: number | null;
  accuracy: number | null;
  cardsTotal: number | null;
  cardsReviewed: number | null;
  attempts: number;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function mapClassroomRow(row: Record<string, any>): Classroom {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? null,
    subject: row.subject ?? null,
    color: row.color ?? 'violet',
    inviteCode: row.invite_code,
    createdAt: toMs(row.created_at) ?? Date.now(),
  };
}

function mapMembershipRow(row: Record<string, any>, classroom: Classroom): ClassroomMembership {
  return {
    classroomId: row.classroom_id ?? classroom.id,
    userId: row.user_id,
    role: row.role === 'teacher' ? 'teacher' : 'student',
    joinedAt: toMs(row.joined_at) ?? Date.now(),
    classroom,
  };
}

function mapRosterRow(row: Record<string, any>): RosterEntry {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email ?? null,
    role: row.role === 'teacher' ? 'teacher' : 'student',
    joinedAt: toMs(row.joined_at) ?? Date.now(),
  };
}

function mapAssignmentRow(row: Record<string, any>): Assignment {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    createdBy: row.created_by,
    title: row.title,
    instructions: row.instructions ?? null,
    kind: row.kind === 'quiz' ? 'quiz' : 'deck',
    deckId: row.deck_id ?? null,
    deckTitle: row.deck_title ?? null,
    deckCardCount: Number(row.deck_card_count ?? 0),
    dueAt: toMs(row.due_at),
    createdAt: toMs(row.created_at) ?? Date.now(),
  };
}

export async function fetchMyClassrooms(userId: string): Promise<ClassroomMembership[]> {
  const { data, error } = await getSupabase()
    .from('classroom_memberships')
    .select('classroom_id, user_id, role, joined_at, classrooms(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  const out: ClassroomMembership[] = [];
  for (const row of (data ?? []) as any[]) {
    if (!row.classrooms) continue;
    out.push(mapMembershipRow(row, mapClassroomRow(row.classrooms)));
  }
  return out;
}

export async function createClassroom(title: string): Promise<Classroom> {
  const { data, error } = await getSupabase()
    .rpc('create_classroom', { p_title: title, p_description: null, p_subject: null, p_color: 'violet' })
    .select()
    .single();
  if (error) throw error;
  return mapClassroomRow((data ?? {}) as Record<string, any>);
}

export async function joinClassroom(code: string): Promise<Classroom> {
  const { data, error } = await getSupabase()
    .rpc('join_classroom_with_code', { p_code: code })
    .select()
    .single();
  if (error) throw error;
  return mapClassroomRow((data ?? {}) as Record<string, any>);
}

export async function leaveClassroom(classroomId: string): Promise<void> {
  const { error } = await getSupabase().rpc('leave_classroom', { p_classroom_id: classroomId });
  if (error) throw error;
}

export async function fetchRoster(classroomId: string): Promise<RosterEntry[]> {
  const { data, error } = await getSupabase().rpc('classroom_roster', { p_classroom_id: classroomId });
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapRosterRow);
}

export async function fetchAssignments(classroomId: string): Promise<Assignment[]> {
  const { data, error } = await getSupabase()
    .from('assignments')
    .select('*')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAssignmentRow);
}

export async function createAssignment(input: {
  classroomId: string;
  title: string;
  kind?: 'deck' | 'quiz';
  deckId?: string | null;
}): Promise<Assignment> {
  const { data, error } = await getSupabase()
    .rpc('create_assignment', {
      p_classroom_id: input.classroomId,
      p_title: input.title,
      p_instructions: null,
      p_kind: input.kind ?? 'deck',
      p_deck_id: input.deckId ?? null,
      p_payload: null,
      p_start_at: null,
      p_due_at: null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapAssignmentRow((data ?? {}) as Record<string, any>);
}

export async function acceptClassDeck(assignmentId: string): Promise<{ deckId: string; title: string }> {
  const { data, error } = await getSupabase().rpc('accept_class_deck', { p_assignment_id: assignmentId });
  if (error) throw error;
  return { deckId: (data as any)?.deck_id, title: (data as any)?.title };
}

/** The quiz's multiple-choice questions; the answer key never leaves the server. */
export async function fetchQuizQuestions(assignmentId: string): Promise<QuizQuestion[]> {
  const { data, error } = await getSupabase().rpc('get_quiz_questions', { p_assignment_id: assignmentId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    id: row.card_id as string,
    prompt: row.prompt as string,
    choices: (row.choices ?? []) as string[],
  }));
}

/** Submit answers ({ questionId: choice }); graded on the server. */
export async function submitQuizAttempt(assignmentId: string, answers: Record<string, string>): Promise<QuizResult> {
  const { data, error } = await getSupabase().rpc('submit_quiz_attempt', {
    p_assignment_id: assignmentId,
    p_answers: answers,
  });
  if (error) throw error;
  const row = (data ?? {}) as Record<string, any>;
  return {
    score: Number(row.score ?? 0),
    total: Number(row.score_total ?? 0),
    accuracy: Number(row.accuracy ?? 0),
    attempts: Number(row.attempts ?? 1),
    missed: Array.isArray(row.missed) ? row.missed.map((m: any) => String(m.front)) : [],
  };
}

/** Recompute + persist one assignment's progress for the caller. */
export async function recordDeckProgress(assignmentId: string, localDeckId: string): Promise<string | undefined> {
  const { data, error } = await getSupabase().rpc('record_assignment_progress', {
    p_assignment_id: assignmentId,
    p_local_deck_id: localDeckId,
  });
  if (error) throw error;
  return (data as any)?.status;
}

/** After studying a class-copy deck, refresh every assignment it belongs to. */
export async function syncProgressForDeck(localDeckId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from('assignment_progress')
    .select('assignment_id')
    .eq('local_deck_id', localDeckId);
  if (error) throw error;
  for (const row of (data ?? []) as any[]) {
    await recordDeckProgress(row.assignment_id, localDeckId);
  }
}

/** Own membership role (RLS only returns the caller's own row). */
export async function fetchMyRole(classroomId: string, userId: string): Promise<ClassroomRole | null> {
  // Filter on the user, not just the classroom: the membership table chats
  // back every member you may read, and without the filter limit(1) once
  // picked up the teacher's row for a student.
  const { data, error } = await getSupabase()
    .from('classroom_memberships')
    .select('role')
    .eq('classroom_id', classroomId)
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  const role = (data ?? [])[0]?.role;
  return role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : null;
}

/** Progress rows for the whole class (own rows only for students, via RLS). */
export async function fetchProgressRows(classroomId: string): Promise<ProgressRow[]> {
  const { data, error } = await getSupabase()
    .from('assignment_progress')
    .select('assignment_id, user_id, status, local_deck_id, score, score_total, accuracy, cards_total, cards_reviewed, details')
    .eq('classroom_id', classroomId);
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => ({
    assignmentId: row.assignment_id,
    userId: row.user_id,
    status: row.status === 'completed' ? 'completed' : row.status === 'in_progress' ? 'in_progress' : 'assigned',
    localDeckId: (row.local_deck_id ?? null) as string | null,
    score: row.score ?? null,
    scoreTotal: row.score_total ?? null,
    accuracy: row.accuracy ?? null,
    cardsTotal: row.cards_total ?? null,
    cardsReviewed: row.cards_reviewed ?? null,
    attempts: Number(row.details?.attempts ?? 0),
  }));
}

export function classifyJoinError(err: unknown): 'not_found' | 'already_member' | 'other' {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('not_found')) return 'not_found';
  if (message.includes('already_member')) return 'already_member';
  return 'other';
}
