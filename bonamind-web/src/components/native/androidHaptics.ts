import { Capacitor, Haptics, ImpactStyle, NotificationType } from "../../lib/nativeShim";

/**
 * Standalone haptic helpers for the Android shell.
 *
 * The shell has dozens of small tap targets (nav items, action cards, deck
 * rows) that don't warrant a `useHaptics()` hook each. These fire-and-forget
 * helpers give every control a real device "tick" so the installed app feels
 * like a native Android product instead of a website in a WebView. Every call
 * is a no-op on the web build and swallows plugin failures so a missing bridge
 * can never crash an interaction.
 */

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function hapticTap(style: ImpactStyle = ImpactStyle.Light): void {
  if (!isNative()) return;
  void Haptics.impact({ style }).catch(() => undefined);
}

/** A lighter "tick" for selection changes (segmented controls, tab switches). */
export function hapticSelection(): void {
  if (!isNative()) return;
  void Haptics.selectionStart().catch(() => undefined);
}

export function hapticSuccess(): void {
  if (!isNative()) return;
  void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
}

export function hapticWarning(): void {
  if (!isNative()) return;
  void Haptics.notification({ type: NotificationType.Warning }).catch(() => undefined);
}

export function hapticError(): void {
  if (!isNative()) return;
  void Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
}
