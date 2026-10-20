import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOADING_LINES } from './loadingLines';
import { colors, fonts, space } from '../tokens';

const LINE_MS = 2_000;
const SIZE = 168;

/**
 * Web stand-in for the Skia prism (CanvasKit is not bundled on web): a static
 * diamond with a glowing core, sized so the title still centers well.
 */
export function Prism() {
  return (
    <View
      testID="prism"
      style={styles.mark}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <View style={styles.diamondOuter}>
        <View style={styles.diamondInner}>
          <View style={styles.core} />
        </View>
      </View>
    </View>
  );
}

/**
 * Full-screen loading state over the aurora: the prism, a title, and a line
 * that changes every two seconds so a slow network still feels alive.
 */
export function LoadingScreen({ title }: { title: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLine((i) => (i + 1) % LOADING_LINES.length), LINE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <SafeAreaView style={styles.fill}>
      <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={title}>
        <Animated.View entering={FadeIn.duration(500)}>
          <Prism />
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(150).duration(600)} style={styles.title}>{title}</Animated.Text>
        <View style={styles.lineBox}>
          <Animated.Text
            key={line}
            entering={FadeIn.duration(450)}
            exiting={FadeOut.duration(300)}
            style={styles.line}
          >
            {LOADING_LINES[line]}
          </Animated.Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  mark: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  diamondOuter: { width: 82, height: 82, borderWidth: 3, borderColor: colors.violetSoft, transform: [{ rotate: '45deg' }], borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  diamondInner: { width: 40, height: 40, borderWidth: 2, borderColor: colors.cyan, transform: [{ rotate: '0deg' }], borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  core: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.cyan, opacity: 0.9 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 32, lineHeight: 38, textAlign: 'center' },
  lineBox: { height: 24, alignSelf: 'stretch', alignItems: 'center' },
  line: { position: 'absolute', color: colors.violetMist, fontFamily: fonts.displayItalic, fontSize: 18 },
});
