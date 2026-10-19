import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface Settings {
  hapticsEnabled: boolean;
  setHapticsEnabled(v: boolean): void;
  targetRetention: string;
  setTargetRetention(v: string): void;
}

export const RETENTION_OPTIONS = ['Conservative - 90%', 'Balanced - 85%', 'Aggressive - 80%'] as const;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      targetRetention: 'Balanced - 85%',
      setTargetRetention: (targetRetention) => set({ targetRetention }),
    }),
    {
      name: 'bonamind.settings',
      storage: createJSONStorage(() => ({
        getItem: (k) => SecureStore.getItemAsync(k),
        setItem: (k, v) => SecureStore.setItemAsync(k, v),
        removeItem: (k) => SecureStore.deleteItemAsync(k),
      })),
      partialize: ({ hapticsEnabled, targetRetention }) => ({ hapticsEnabled, targetRetention }),
    },
  ),
);
