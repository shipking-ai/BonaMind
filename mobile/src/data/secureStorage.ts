import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Session storage. Native: Keychain/Keystore-backed, and secure-store values
 * are capped at about 2 KB while a session is larger, so values are split
 * into chunks `${key}.0..n-1` with the count under `${key}.n`.
 * Web: expo-secure-store has no web implementation, so the session lives in
 * localStorage (like the website's) behind the same three-method adapter.
 */
export const CHUNK_SIZE = 1800;

const countKey = (k: string) => `${k}.n`;
const chunkKey = (k: string, i: number) => `${k}.${i}`;

const nativeBacked = {
  async getItem(key: string): Promise<string | null> {
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    if (!n) return null;
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
    const m = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let i = 0; i < m; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(countKey(key), String(m));
  },
  async removeItem(key: string): Promise<void> {
    const n = Number((await SecureStore.getItemAsync(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

const webBacked = {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};

export const chunkedSecureStorage = Platform.OS === 'web' ? webBacked : nativeBacked;
