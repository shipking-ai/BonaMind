import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../data/auth';
import { createAssignment } from '../data/classroom';
import { useDecks } from '../data/hooks';
import { GlassButton } from '../design/components/GlassButton';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { colors, fonts, radius, space } from '../design/tokens';
import { haptic } from '../design/haptics';

type Kind = 'deck' | 'quiz';

export function AssignSheet({ classroomId, onClose, onCreated }: {
  classroomId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { userId } = useAuth();
  const decks = useDecks(userId).data ?? [];
  const [kind, setKind] = useState<Kind>('deck');
  const [title, setTitle] = useState('');
  const [deckId, setDeckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!title.trim() || !deckId) return;
    setBusy(true);
    try {
      await createAssignment({ classroomId, title: title.trim(), kind, deckId });
      haptic('success');
      setTitle('');
      setDeckId(null);
      onCreated();
      onClose();
    } catch (e) {
      Alert.alert(kind === 'quiz' ? 'Could not assign quiz' : 'Could not assign', String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.top}>
          <GlassButton symbol={{ ios: 'xmark', android: 'close' }} label="Close" onPress={onClose} tint={colors.text} />
          <Text style={styles.title} numberOfLines={1}>Assign work</Text>
          <View style={styles.spacer} />
        </View>
        <ScrollView contentContainerStyle={styles.flow}>
          <Text style={styles.sectionTitle}>What kind?</Text>
          <View style={styles.kinds}>
            {(['deck', 'quiz'] as Kind[]).map((k) => (
              <Pressable
                key={k}
                style={[styles.kind, kind === k && styles.kindActive]}
                onPress={() => { setKind(k); }}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === k }}
              >
                <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>{k === 'deck' ? 'Deck' : 'Quiz'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sectionTitle}>{kind === 'deck' ? 'Title and deck for the class to open' : 'Title and deck to quiz with'}</Text>
          <TextInput
            accessibilityLabel="Assignment title"
            value={title}
            onChangeText={setTitle}
            placeholder={kind === 'deck' ? 'e.g. Photosynthesis basics' : 'e.g. Photosynthesis quiz'}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.deckLabel}>Your deck</Text>
          <View style={styles.deckList}>
            {decks.length === 0 && <Text style={styles.empty}>Create a deck in Courses first.</Text>}
            {decks.map((d) => (
              <Pressable
                key={d.id}
                style={[styles.deck, deckId === d.id && styles.deckActive]}
                onPress={() => { haptic('light'); setDeckId(d.id); }}
                accessibilityRole="button"
                accessibilityState={{ selected: deckId === d.id }}
              >
                <Text style={[styles.deckText, deckId === d.id && styles.deckTextActive]}>{d.title}</Text>
              </Pressable>
            ))}
          </View>
          {kind === 'quiz' && (
            <Text style={styles.hint}>The quiz builds multiple-choice questions from this deck — pick a deck with a few cards.</Text>
          )}
          <PrimaryButton
            label={busy ? 'Assigning…' : 'Assign'}
            onPress={() => { if (!busy) void onCreate(); }}
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.night },
  fill: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  title: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15, textAlign: 'center' },
  spacer: { width: 44 },
  flow: { padding: space.xl, gap: space.lg },
  sectionTitle: { color: colors.text, fontFamily: fonts.ui, fontSize: 16, fontWeight: '600' },
  kinds: { flexDirection: 'row', gap: space.md },
  kind: {
    flex: 1, borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    backgroundColor: colors.surface, paddingVertical: space.md, alignItems: 'center',
  },
  kindActive: { borderColor: colors.violet, borderWidth: 2 },
  kindText: { color: colors.textMuted, fontFamily: fonts.uiBold, fontSize: 15 },
  kindTextActive: { color: colors.text },
  input: {
    backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16,
    borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: 14, borderWidth: 1, borderColor: colors.hairline,
  },
  deckLabel: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  deckList: { gap: space.sm },
  deck: {
    borderRadius: radius.tile, borderWidth: 1, borderColor: colors.hairline,
    backgroundColor: colors.surface, paddingVertical: space.md, paddingHorizontal: space.lg,
  },
  deckActive: { borderColor: colors.violet, borderWidth: 2 },
  deckText: { color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  deckTextActive: { color: colors.violetSoft, fontWeight: '600' },
  hint: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13 },
  empty: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
});
