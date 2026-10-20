import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../data/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptClassDeck, fetchAssignments, fetchMyRole, fetchProgressRows, fetchRoster,
  leaveClassroom, recordDeckProgress, type Assignment, type ProgressRow,
} from '../data/classroom';
import { AssignSheet } from './AssignSheet';
import { QuizTakeSheet } from './QuizTakeSheet';
import { PaperCard } from '../design/components/PaperCard';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { colors, fonts, space } from '../design/tokens';
import { haptic } from '../design/haptics';

function ownProgressLine(row: ProgressRow): string {
  if (row.status === 'completed') {
    return (row.scoreTotal ?? 0) > 0
      ? `Completed · ${row.score}/${row.scoreTotal} (${Math.round(row.accuracy ?? 0)}%)`
      : 'Completed';
  }
  if (row.status === 'in_progress') {
    return (row.cardsTotal ?? 0) > 0
      ? `In progress · ${row.cardsReviewed}/${row.cardsTotal} cards`
      : 'In progress';
  }
  return 'Not started';
}

function teacherLine(rows: ProgressRow[], students: number): string {
  if (students === 0) return 'No students yet.';
  const done = rows.filter((r) => r.status === 'completed').length;
  const started = rows.length;
  return `${done} of ${students} completed · ${started} started`;
}

export function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Assignment | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const roster = useQuery({
    queryKey: ['classroom-roster', id],
    queryFn: () => (id ? fetchRoster(id) : Promise.resolve([])),
    enabled: !!id,
  });
  const assignments = useQuery({
    queryKey: ['classroom-assignments', id],
    queryFn: () => (id ? fetchAssignments(id) : Promise.resolve([])),
    enabled: !!id,
  });
  const progress = useQuery({
    queryKey: ['classroom-progress', id],
    queryFn: () => (id ? fetchProgressRows(id) : Promise.resolve([])),
    enabled: !!id,
  });
  const role = useQuery({
    queryKey: ['classroom-role', id, userId],
    queryFn: () => (id && userId ? fetchMyRole(id, userId) : Promise.resolve(null)),
    enabled: !!id,
  });

  const isTeacher = role.data === 'teacher';
  const rows = progress.data ?? [];
  const mineByAssignment = new Map<string, ProgressRow>();
  const classRowsByAssignment = new Map<string, ProgressRow[]>();
  for (const row of rows) {
    if (row.userId === userId) mineByAssignment.set(row.assignmentId, row);
    const list = classRowsByAssignment.get(row.assignmentId) ?? [];
    list.push(row);
    classRowsByAssignment.set(row.assignmentId, list);
  }
  const studentCount = (roster.data ?? []).filter((r) => r.role === 'student').length;

  async function onAccept(a: Assignment) {
    setBusyId(a.id);
    try {
      const res = await acceptClassDeck(a.id);
      // Record the local deck id so progress and 'Study now' work from now on.
      await recordDeckProgress(a.id, res.deckId);
      haptic('success');
      Alert.alert('Added to your library', res.title);
      void qc.invalidateQueries({ queryKey: ['courses'] });
      void qc.invalidateQueries({ queryKey: ['classroom-progress', id] });
    } catch (e) {
      Alert.alert('Could not accept', String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onRefreshProgress(a: Assignment, row: ProgressRow) {
    if (!row.localDeckId) return;
    setBusyId(a.id);
    try {
      await recordDeckProgress(a.id, row.localDeckId);
      void qc.invalidateQueries({ queryKey: ['classroom-progress', id] });
    } catch {
      // Offline or mid-flush: progress simply won't move until next time.
    } finally {
      setBusyId(null);
    }
  }

  async function onLeave() {
    if (!id) return;
    Alert.alert('Leave class?', 'You can rejoin with the code.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await leaveClassroom(id); router.back(); }
        catch (e) { Alert.alert('Could not leave', String(e)); }
      } },
    ]);
  }

  return (
    <View style={styles.fill}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Class</Text>

        {isTeacher && (
          <SecondaryButton label="Assign work" onPress={() => setShowAssign(true)} />
        )}

        <Text style={styles.sectionTitle}>Assignments</Text>
        {(assignments.data ?? []).length === 0 && (
          <Text style={styles.empty}>{isTeacher ? 'Assign your first deck.' : 'No assignments yet.'}</Text>
        )}
        {(assignments.data ?? []).map((a) => {
          const mine = mineByAssignment.get(a.id);
          return (
            <PaperCard key={a.id} style={styles.card}>
              <Text style={styles.cardTitle}>{a.title}</Text>
              <Text style={styles.cardMeta}>
                {a.kind === 'deck' ? 'Deck' : 'Quiz'}{a.deckTitle ? ` · ${a.deckTitle}` : ''}
                {a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString()}` : ''}
              </Text>
              {isTeacher ? (
                <Text style={styles.cardStatus}>{teacherLine(classRowsByAssignment.get(a.id) ?? [], studentCount)}</Text>
              ) : mine ? (
                <Text style={styles.cardStatus}>{ownProgressLine(mine)}</Text>
              ) : null}
              {a.kind === 'deck' && (isTeacher ? (
                <SecondaryButton label="Study now" onPress={() => a.deckId ? router.push(`/study/${a.deckId}`) : undefined} />
              ) : mine?.localDeckId ? (
                <>
                  <SecondaryButton label="Study now" onPress={() => router.push(`/study/${mine.localDeckId}`)} />
                  <SecondaryButton
                    label={busyId === a.id ? 'Refreshing…' : 'Refresh progress'}
                    onPress={() => void onRefreshProgress(a, mine)}
                  />
                </>
              ) : (
                <SecondaryButton
                  label={busyId === a.id ? 'Adding…' : 'Add to my library'}
                  onPress={() => void onAccept(a)}
                />
              ))}
              {a.kind === 'quiz' && (
                <SecondaryButton label="Take quiz" onPress={() => { haptic('light'); setQuiz(a); }} />
              )}
            </PaperCard>
          );
        })}

        <Text style={styles.sectionTitle}>People</Text>
        {(roster.data ?? []).map((r) => (
          <View key={r.userId} style={styles.person}>
            <Text style={styles.personName}>{r.displayName}</Text>
            <Text style={styles.personRole}>{r.role === 'teacher' ? 'Teacher' : 'Student'}</Text>
          </View>
        ))}

        <SecondaryButton label="Leave class" onPress={() => void onLeave()} />
      </ScrollView>
      {showAssign && id && (
        <AssignSheet
          classroomId={id}
          onClose={() => setShowAssign(false)}
          onCreated={() => {
            void qc.invalidateQueries({ queryKey: ['classroom-assignments', id] });
          }}
        />
      )}
      {quiz && (
        <QuizTakeSheet assignmentId={quiz.id} assignmentTitle={quiz.title} onClose={() => { setQuiz(null); void qc.invalidateQueries({ queryKey: ['classroom-progress', id] }); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  heading: { color: colors.text, fontFamily: fonts.display, fontSize: 34 },
  sectionTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', marginTop: space.md },
  card: { gap: space.sm },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20 },
  cardMeta: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 13 },
  cardStatus: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 13 },
  person: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  personName: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  personRole: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  empty: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
});
