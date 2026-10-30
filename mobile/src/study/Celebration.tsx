import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring, ZoomIn } from 'react-native-reanimated';
import { Confetti } from '../design/components/Confetti';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { haptic } from '../design/haptics';
import { useMotion } from '../design/motion';
import { env } from '../env';
import { colors, fonts, space } from '../design/tokens';

const DIGIT_HEIGHT = 64;
const ROLL_DELAY_MS = 650;

/** End of a session: the flame grows in, the streak rolls over, confetti rains. */
export function Celebration({ fromStreak, toStreak, line, onDone }: { fromStreak: number; toStreak: number; line: string; onDone(): void }) {
  const { reduce } = useMotion();
  const e2e = env.e2e;
  const roll = useSharedValue(0);
  useEffect(() => {
    // Bridged-async module calls (haptics among them) have stalled the
    // JS bridge indefinitely on the iOS 26.4 CI simulator — right when the
    // accessibility tree is read — so e2e skips the celebratory haptic.
    if (e2e) return;
    haptic('success');
    if (toStreak === fromStreak) return;
    roll.set(reduce ? -DIGIT_HEIGHT : withDelay(ROLL_DELAY_MS, withSpring(-DIGIT_HEIGHT, { damping: 11, stiffness: 120 })));
  }, [fromStreak, toStreak, reduce, roll, e2e]);
  const rolling = useAnimatedStyle(() => ({ transform: [{ translateY: roll.value }] }));

  // E2E builds render the plain-views variant: the accessibility tree on
  // the iOS 26.4 CI simulator came back EMPTY for this screen in three
  // consecutive runs (asserts never saw "day streak" although the failure
  // screenshot showed it), so every native-view layer this screen mounts —
  // the Skia confetti canvas, the SwiftUI-backed SymbolView, and all
  // reanimated entries — is bypassed under e2e. Real builds look identical.
  if (e2e) {
    return (
      <View style={styles.wrap} testID="celebration-e2e">
        {/* NO accessible+accessibilityLabel on this row in e2e: flattened
            groups expose only the group's label to XCUITest on iOS 26.4,
            which the engine's text matcher reportedly doesn't see — plain
            Text children match reliably (as every other screen's asserts do). */}
        <View style={styles.streakRow}>
          <Text style={styles.digit}>{toStreak}</Text>
          <Text style={styles.unit}>day streak</Text>
        </View>
        <Text style={styles.line}>{line}</Text>
        <View style={styles.done}><PrimaryButton label="Done" onPress={onDone} /></View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Confetti trigger={1} origin={{ x: 0, y: 0 }} mode="rain" />
      <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(9)}>
        <SymbolView name={{ ios: 'flame.fill', android: 'local_fire_department' }} size={84} tintColor={colors.streak} />
      </Animated.View>
      <View style={styles.streakRow} accessible accessibilityLabel={`${toStreak} day streak`}>
        <View style={styles.window}>
          <Animated.View style={rolling}>
            <Text style={styles.digit}>{fromStreak}</Text>
            <Text style={[styles.digit, styles.next]}>{toStreak}</Text>
          </Animated.View>
        </View>
        <Text style={styles.unit}>day streak</Text>
      </View>
      <Animated.Text entering={reduce ? undefined : FadeIn.delay(900)} style={styles.line}>{line}</Animated.Text>
      <View style={styles.done}><PrimaryButton label="Done" onPress={onDone} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  streakRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  window: { height: DIGIT_HEIGHT, overflow: 'hidden' },
  digit: { height: DIGIT_HEIGHT, color: colors.text, fontFamily: fonts.display, fontSize: 60, lineHeight: DIGIT_HEIGHT },
  next: { color: '#FDBA74' },
  unit: { color: colors.text, fontFamily: fonts.display, fontSize: 26, paddingBottom: 8 },
  line: { color: colors.violetMist, fontFamily: fonts.displayItalic, fontSize: 20, textAlign: 'center', marginHorizontal: space.lg },
  done: { alignSelf: 'stretch', marginTop: space.lg },
});
