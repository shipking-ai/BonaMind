/**
 * Guards the privacy policy against "the app sends data to a service the
 * policy never names" drift. A real gap shipped: the app talked to Sentry,
 * Cerebras, Google Gemini, OpenRouter, Puter, Cloudflare Turnstile and Google
 * Fonts while the policy only listed Groq, PostHog, Supabase, Stripe, Resend
 * and Vercel. Every runtime data path in src/ and api/ must be covered by a
 * policy disclosure.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(__dirname, '../..');
const POLICY = readFileSync(
  path.join(REPO, 'src/pages/legal/PrivacyPolicyPage.tsx'),
  'utf8',
);

const REQUIRED_DISCLOSURES: { label: string; pattern: RegExp }[] = [
  { label: 'Sentry (crash reports)', pattern: /Sentry/ },
  { label: 'Cerebras (AI fallback)', pattern: /Cerebras/ },
  { label: 'Google Gemini (AI fallback)', pattern: /Gemini/ },
  { label: 'OpenRouter (AI fallback)', pattern: /OpenRouter/ },
  { label: 'Puter (client-side AI)', pattern: /Puter/ },
  { label: 'Cloudflare Turnstile (sign-in bot check)', pattern: /Turnstile/ },
  { label: 'Google Fonts (font hosting)', pattern: /Google Fonts/ },
  {
    label: 'read-aloud: AI voices send text to the API/Groq, built-in voices stay on-device',
    pattern: /Read-Aloud[\s\S]{0,400}AI voice[\s\S]{0,200}Groq/,
  },
];

describe('the privacy policy names every third-party data path', () => {
  it.each(REQUIRED_DISCLOSURES)('discloses $label', ({ pattern }) => {
    expect(POLICY).toMatch(pattern);
  });

  it('keeps the operator name untouched (blocked on the CogniVect decision)', () => {
    // The policy must keep using the branding constant, not a new company name.
    expect(POLICY).toContain('{PARENT_COMPANY_LEGAL}');
  });

  it('the read-aloud claim matches how speech actually works', () => {
    // aiVoice sends the spoken text to /api/ai/speech (server-side synthesis);
    // the built-in Web Speech API path runs in the browser/device only.
    const aiVoice = readFileSync(path.join(REPO, 'src/services/voice/aiVoice.ts'), 'utf8');
    expect(aiVoice).toMatch(/\/api\/ai\/speech/);
    const speechOutput = readFileSync(path.join(REPO, 'src/services/voice/speechOutput.ts'), 'utf8');
    expect(speechOutput).toMatch(/SpeechSynthesisUtterance/);
  });
});
