import { ONBOARDING_ROLE_VALUES } from '@bonamind/core';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSupabase } from '../data/supabase';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { haptic } from '../design/haptics';
import { colors, fonts, radius, space } from '../design/tokens';
import { useMotion } from '../design/motion';

export function OnboardingScreen() {
  const { reduce } = useMotion();
  const [role, setRole] = useState<string>(ONBOARDING_ROLE_VALUES[1]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setError(null);
    setBusy(true);
    const { error: e } = await getSupabase().auth.updateUser({
      data: { onboarding_completed: true, role, onboarding_topic: topic.trim() || null },
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    // Auth state change will flip the gate; nothing else to do.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={reduce ? undefined : FadeInDown.duration(700)} style={styles.brand}>
            <Text style={styles.title}>Welcome to BonaMind</Text>
            <Text style={styles.subtitle}>Tell us a little about you so Prof. Linnea can tailor your course.</Text>
          </Animated.View>

          <View style={styles.section}>
            <Text style={styles.label}>I am a…</Text>
            <View style={styles.chips}>
              {ONBOARDING_ROLE_VALUES.map((r) => (
                <Pressable
                  key={r}
                  accessibilityRole="button"
                  accessibilityState={{ selected: role === r }}
                  onPress={() => { haptic('selection'); setRole(r); }}
                  style={[styles.chip, role === r && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, role === r && styles.chipTextSelected]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>What are you studying?</Text>
            <TextInput
              accessibilityLabel="Topic"
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Neuroscience, Spanish, Calculus"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton label={busy ? 'One moment…' : 'Get started'} onPress={() => { if (!busy) void finish(); }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { padding: space.xl, gap: space.xl },
  brand: { gap: space.sm },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 34 },
  subtitle: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 16 },
  section: { gap: space.sm },
  label: { color: colors.text, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.tile, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  chipSelected: { backgroundColor: colors.violet, borderColor: colors.violet },
  chipText: { color: colors.text, fontFamily: fonts.ui, fontSize: 14, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.text },
  input: { backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.ui, fontSize: 16, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  error: { color: colors.again, fontFamily: fonts.ui, fontSize: 14 },
});
