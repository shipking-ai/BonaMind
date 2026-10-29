import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { colors } from '../tokens';

/** App-wide warmth (0..1); shared with the native AuroraBackground API. */
export const auroraWarmth = makeMutable(0);

type Point = { x: number; y: number } | null;

/**
 * Web stand-in for the Skia aurora (CanvasKit is not bundled on web): the same
 * three glows as static radial gradients sized relative to the viewport.
 * Warmth/touch are accepted for API parity but have no visual on web yet.
 */
export function AuroraBackground({
  intensity = 0.6,
}: { intensity?: number; warmth?: SharedValue<number>; touch?: SharedValue<Point> }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: 'absolute', top: '-45%', left: '70%', width: 900, height: 900,
          opacity: 0.9 * intensity,
          backgroundImage: `radial-gradient(circle at center, ${colors.violet} 0%, rgba(0,0,0,0) 65%)`,
        } as never}
      />
      <View
        style={{
          position: 'absolute', top: '25%', left: '-45%', width: 720, height: 720,
          opacity: 0.5 * intensity,
          backgroundImage: `radial-gradient(circle at center, ${colors.cyan} 0%, rgba(0,0,0,0) 65%)`,
        } as never}
      />
      <View
        style={{
          position: 'absolute', bottom: '-48%', right: '-42%', width: 780, height: 780,
          opacity: 0.45 * intensity,
          backgroundImage: `radial-gradient(circle at center, ${colors.pink} 0%, rgba(0,0,0,0) 65%)`,
        } as never}
      />
    </View>
  );
}

/** A screen with the aurora behind it; identical shell to the native API. */
export function AuroraScreen({
  children, intensity, warmth,
}: { children: ReactNode; intensity?: number; warmth?: SharedValue<number> }) {
  void warmth;
  return (
    <View style={styles.screen} testID="aurora-screen">
      <AuroraBackground intensity={intensity} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.night } });
