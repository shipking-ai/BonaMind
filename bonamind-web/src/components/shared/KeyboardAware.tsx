import { useEffect, useRef } from 'react';
import { Capacitor, Keyboard } from '../../lib/nativeShim';

const SCROLL_OFFSET = 120;

export function KeyboardAware({ children }: { children: React.ReactNode }) {
  const keyboardHeightRef = useRef(0);

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      const setupListeners = async () => {
        const showListener = await Keyboard.addListener('keyboardWillShow', (info: { keyboardHeight: number }) => {
          keyboardHeightRef.current = info.keyboardHeight;
          document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
          scrollActiveInput();
        });
        const hideListener = await Keyboard.addListener('keyboardWillHide', () => {
          keyboardHeightRef.current = 0;
          document.documentElement.style.removeProperty('--keyboard-height');
        });
        return () => {
          showListener.remove();
          hideListener.remove();
        };
      };
      const cleanup = setupListeners();
      return () => { cleanup.then(fn => fn()); };
    }

    return;
  }, []);

  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.matches?.('input, textarea, [contenteditable="true"]');
      if (!isInput) return;
      setTimeout(scrollActiveInput, 300);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  function scrollActiveInput() {
    const active = document.activeElement as HTMLElement | null;
    if (!active) return;
    const isInput = active.matches?.('input, textarea, [contenteditable="true"]');
    if (!isInput) return;
    const rect = active.getBoundingClientRect();
    const bottomOverflow = rect.bottom + SCROLL_OFFSET - (window.innerHeight - keyboardHeightRef.current);
    if (bottomOverflow > 0) {
      window.scrollBy({ top: bottomOverflow, behavior: 'smooth' });
    }
  }

  return <>{children}</>;
}
