import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../data/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptClassDeck, fetchAssignments, fetchRoster, leaveClassroom } from '../data/classroom';
import { PaperCard } from '../design/components/PaperCard';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { colors, fonts, radius, space } from '../design/tokens';
import { haptic } from '../design/haptics';

export function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function onAccept(assignmentId: string) {
    setBusyId(assignmentId);
    try {
      const res = await acceptClassDeck(assignmentId);
      haptic('success');
      Alert.alert('Added to your library', res.title);
      void qc.invalidateQueries({ queryKey: ['courses'] });
    } catch (e) {
      Alert.alert('Could not accept', String(e));
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
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Class</Text>

      <Text style={styles.sectionTitle}>Assignments</Text>
      {(assignments.data ?? []).length === 0 && (
        <Text style={styles.empty}>No assignments yet.</Text>
      )}
      {(assignments.data ?? []).map((a) => (
        <PaperCard key={a.id} style={styles.card}>
          <Text style={styles.cardTitle}>{a.title}</Text>
          <Text style={styles.cardMeta}>{a.kind === 'deck' ? 'Deck' : 'Quiz'}{a.deckTitle ? ` · ${a.deckTitle}` : ''}</Text>
          {a.kind === 'deck' && (
            <SecondaryButton
              label={busyId === a.id ? 'Adding…' : 'Add to my library'}
              onPress={() => void onAccept(a.id)}
            />
          )}
        </PaperCard>
      ))}

      <Text style={styles.sectionTitle}>People</Text>
      {(roster.data ?? []).map((r) => (
        <View key={r.userId} style={styles.person}>
          <Text style={styles.personName}>{r.displayName}</Text>
          <Text style={styles.personRole}>{r.role === 'teacher' ? 'Teacher' : 'Student'}</Text>
        </View>
      ))}

      <SecondaryButton label="Leave class" onPress={() => void onLeave()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  heading: { color: colors.text, fontFamily: fonts.display, fontSize: 34 },
  sectionTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600', marginTop: space.md },
  card: { gap: space.sm },
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20 },
  cardMeta: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 13 },
  person: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  personName: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  personRole: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  empty: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
});
