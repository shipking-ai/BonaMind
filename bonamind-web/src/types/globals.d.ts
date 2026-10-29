/**
 * Ambient window globals for native shells.
 *
 * `window.Capacitor` is injected by the Capacitor runtime.
 * Platform detection code reads this defensively — it is optional and
 * typed loosely on purpose.
 */
export {};

declare global {
  interface Window {
    // The injected Capacitor global (see @capacitor/core). Typed as `any`
    // because the runtime object predates the npm package's types and
    // platform detection only needs isNativePlatform()/getPlatform().
    Capacitor?: {
      getPlatform(): 'android' | 'web';
      isNativePlatform(): boolean;
    };
  }
}
