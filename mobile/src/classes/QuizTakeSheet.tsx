import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchQuizQuestions, submitQuizAttempt, type QuizQuestion, type QuizResult } from '../data/classroom';
import { GlassButton } from '../design/components/GlassButton';
import { PaperCard } from '../design/components/PaperCard';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { colors, fonts, radius, space } from '../design/tokens';
import { haptic } from '../design/haptics';

export function QuizTakeSheet({ assignmentId, assignmentTitle, onClose }: {
  assignmentId: string;
  assignmentTitle: string;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchQuizQuestions(assignmentId)
      .then((qs) => { if (alive) setQuestions(qs); })
      .catch((e) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [assignmentId]);

  function pick(questionId: string, choice: string) {
    haptic('light');
    setAnswers((a) => ({ ...a, [questionId]: choice }));
  }

  async function submit() {
    if (!questions) return;
    setBusy(true);
    try {
      const r = await submitQuizAttempt(assignmentId, answers);
      haptic(r.score === r.total ? 'success' : 'light');
      setResult(r);
    } catch (e) {
      Alert.alert('Could not submit', String(e));
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setAnswers({});
    setIndex(0);
    setResult(null);
  }

  const q = questions?.[index];
  const answeredAll = questions ? questions.every((x) => answers[x.id]) : false;
  const isLast = questions ? index >= questions.length - 1 : false;

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.fill}>
        <View style={styles.top}>
          <GlassButton symbol={{ ios: 'xmark', android: 'close' }} label="Close" onPress={onClose} tint={colors.text} />
          <Text style={styles.title} numberOfLines={1}>{assignmentTitle}</Text>
          <View style={styles.spacer} />
        </View>

        {error && (
          <View style={styles.center}>
            <PaperCard style={styles.resultCard}>
              <Text style={styles.emptyTitle}>The quiz is not open yet</Text>
              <Text style={styles.emptyBody}>{error}</Text>
            </PaperCard>
            <PrimaryButton label="Try again" onPress={() => { setError(null); setQuestions(null); void fetchQuizQuestions(assignmentId).then(setQuestions).catch((e) => setError(String(e))); }} />
          </View>
        )}

        {!error && !questions && <Text style={styles.loading}>Getting the questions…</Text>}

        {!error && questions && result && (
          <View style={styles.center}>
            <PaperCard style={styles.resultCard}>
              <Text style={styles.scoreTitle}>{`${result.score} of ${result.total}`}</Text>
              <Text style={styles.scoreMeta}>{`Score ${Math.round(result.accuracy)}% · attempt ${result.attempts}`}</Text>
              {result.missed.length > 0 && (
                <>
                  <Text style={styles.missedTitle}>To revisit</Text>
                  {result.missed.map((m, i) => <Text key={i} style={styles.missedItem}>• {m}</Text>)}
                </>
              )}
            </PaperCard>
            <PrimaryButton label="Review again" onPress={retake} />
            <SecondaryButton label="Done" onPress={onClose} />
          </View>
        )}

        {!error && questions && !result && q && (
          <ScrollView contentContainerStyle={styles.flow} keyboardShouldPersistTaps="handled">
            <Text style={styles.progress}>{`Question ${index + 1} of ${questions.length}`}</Text>
            <PaperCard style={styles.card}>
              <Text style={styles.prompt}>{q.prompt}</Text>
              <View style={styles.choices}>
                {q.choices.map((choice) => {
                  const selected = answers[q.id] === choice;
                  return (
                    <Pressable
                      key={choice}
                      style={[styles.choice, selected && styles.choiceSelected]}
                      onPress={() => pick(q.id, choice)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{choice}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </PaperCard>
            <View style={styles.nav}>
              {index > 0 ? <SecondaryButton label="Back" onPress={() => setIndex((i) => Math.max(0, i - 1))} /> : <View style={styles.half} />}
              {isLast ? (
                <View style={styles.half}>
                  <PrimaryButton
                    label={busy ? 'Sending…' : answeredAll ? 'Submit quiz' : 'Answer all first'}
                    onPress={() => { if (answeredAll && !busy) void submit(); }}
                  />
                </View>
              ) : (
                <View style={styles.half}>
                  <PrimaryButton
                    label="Next"
                    onPress={() => { if (q.id in answers) setIndex((i) => Math.min(questions.length - 1, i + 1)); }}
                  />
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {!error && questions && !result && !q && (
          <View style={styles.center}>
            <PaperCard style={styles.resultCard}>
              <Text style={styles.emptyTitle}>Nothing to answer</Text>
              <Text style={styles.emptyBody}>This deck needs cards before it can run as a quiz.</Text>
            </PaperCard>
          </View>
        )}
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
  loading: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 15, marginTop: space.xxl, textAlign: 'center' },
  flow: { padding: space.xl, gap: space.lg },
  progress: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 13, textAlign: 'center' },
  card: { gap: space.lg },
  prompt: { color: colors.ink, fontFamily: fonts.display, fontSize: 22 },
  choices: { gap: space.md },
  choice: {
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.16)',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: '#FBF6EA',
  },
  choiceSelected: { borderColor: colors.violet, borderWidth: 2 },
  choiceText: { color: colors.ink, fontFamily: fonts.ui, fontSize: 16 },
  choiceTextSelected: { color: colors.violet, fontWeight: '600' },
  nav: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.xl, gap: space.lg },
  resultCard: { gap: space.sm, alignSelf: 'stretch' },
  scoreTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 40 },
  scoreMeta: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 14 },
  missedTitle: { color: colors.ink, fontFamily: fonts.ui, fontSize: 14, fontWeight: '600', marginTop: space.sm },
  missedItem: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 14 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.display, fontSize: 26 },
  emptyBody: { color: '#57534E', fontFamily: fonts.ui, fontSize: 15 },
});
