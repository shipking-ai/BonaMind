import { describe, it, expect } from 'vitest';
import { isAllowedSupabaseUrl } from '../lib/env';

describe('isAllowedSupabaseUrl', () => {
  it('accepts a deployed project over https', () => {
    expect(isAllowedSupabaseUrl('https://abc.supabase.co')).toBe(true);
  });

  it('accepts a local `supabase start` stack over http', () => {
    expect(isAllowedSupabaseUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isAllowedSupabaseUrl('http://localhost:54321')).toBe(true);
  });

  it('rejects plain http anywhere else, and junk', () => {
    expect(isAllowedSupabaseUrl('http://abc.supabase.co')).toBe(false);
    expect(isAllowedSupabaseUrl('http://localhost.evil.example')).toBe(false);
    expect(isAllowedSupabaseUrl('not a url')).toBe(false);
  });
});
