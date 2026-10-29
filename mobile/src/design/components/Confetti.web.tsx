/**
 * Web stand-in for the Skia confetti (CanvasKit is not bundled on web):
 * celebration works, just without particles.
 */
export function Confetti({ trigger, origin, mode }: { trigger: number; origin: { x: number; y: number }; mode: 'burst' | 'rain' }) {
  void trigger;
  void origin;
  void mode;
  return null;
}
