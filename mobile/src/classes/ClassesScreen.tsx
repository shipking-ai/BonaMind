import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../data/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClassroom, fetchMyClassrooms, joinClassroom } from '../data/classroom';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { colors, fonts, radius, space } from '../design/tokens';
import { haptic } from '../design/haptics';

export function ClassesScreen() {
  const { userId } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const memberships = useQuery({
    queryKey: ['classrooms', userId],
    queryFn: () => (userId ? fetchMyClassrooms(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  async function onCreate() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createClassroom(title.trim());
      setTitle('');
      setShowCreate(false);
      haptic('success');
      void qc.invalidateQueries({ queryKey: ['classrooms', userId] });
    } catch (e) {
      Alert.alert('Could not create class', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const c = await joinClassroom(code.trim().toUpperCase());
      setCode('');
      setShowJoin(false);
      haptic('success');
      void qc.invalidateQueries({ queryKey: ['classrooms', userId] });
      router.push(`/classes/${c.id}` as any);
    } catch (e) {
      Alert.alert('Could not join', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Classes</Text>
      <View style={styles.actions}>
        <PrimaryButton label="Create a class" onPress={() => { setShowCreate((v) => !v); setShowJoin(false); }} />
        <SecondaryButton label="Join with a code" onPress={() => { setShowJoin((v) => !v); setShowCreate(false); }} />
      </View>

      {showCreate && (
        <PaperCard style={styles.form}>
          <TextInput
            accessibilityLabel="Class title"
            value={title}
            onChangeText={setTitle}
            placeholder="Class title"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <PrimaryButton label={busy ? 'Creating…' : 'Create'} onPress={() => void onCreate()} />
        </PaperCard>
      )}

      {showJoin && (
        <PaperCard style={styles.form}>
          <TextInput
            accessibilityLabel="Invite code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
            placeholder="6-character code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            style={styles.input}
          />
          <PrimaryButton label={busy ? 'Joining…' : 'Join'} onPress={() => void onJoin()} />
        </PaperCard>
      )}

      {(memberships.data ?? []).map((m) => (
        <Pressable key={m.classroom.id} onPress={() => router.push(`/classes/${m.classroom.id}` as any)} style={styles.card}>
          <PaperCard>
            <Text style={styles.cardTitle}>{m.classroom.title}</Text>
            <Text style={styles.cardMeta}>{m.role === 'teacher' ? 'Teacher' : 'Student'} · {m.classroom.inviteCode}</Text>
          </PaperCard>
        </Pressable>
      ))}

      {memberships.data?.length === 0 && (
        <Text style={styles.empty}>No classes yet. Create one or join with a code.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  heading: { color: colors.text, fontFamily: fonts.display, fontSize: 34 },
  actions: { gap: space.sm },
  form: { gap: space.sm },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: 14, borderWidth: 1, borderColor: colors.hairline },
  card: {},
  cardTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 20 },
  cardMeta: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 13, marginTop: 4 },
  empty: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14, textAlign: 'center', marginTop: space.xl },
});
