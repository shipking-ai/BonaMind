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

export function classifyJoinError(err: unknown): 'not_found' | 'already_member' | 'other' {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('not_found')) return 'not_found';
  if (message.includes('already_member')) return 'already_member';
  return 'other';
}
