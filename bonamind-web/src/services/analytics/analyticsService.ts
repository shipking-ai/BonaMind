import { getAppPreference } from '../../lib/appPreferences';
import { CONSENT_CHOICE_KEY } from '../../lib/consent';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

// Check if PostHog is properly configured (not using placeholder values)
export const isPostHogConfigured = POSTHOG_KEY && POSTHOG_KEY !== 'phc_placeholder' && POSTHOG_KEY.length > 10;

let posthog: any = null;

export async function getPostHog() {
  if (getAppPreference<boolean>('bonamind_usageAnalytics', true) === false) return null;
  if (!posthog && isPostHogConfigured && typeof window !== 'undefined') {
    const module = await import('posthog-js');
    posthog = module.default;
  }
  return posthog;
}

let initialized = false;

export const analyticsService = {
  init: async () => {
    if (getAppPreference<boolean>('bonamind_usageAnalytics', true) === false) return;
    // No consent choice yet: tracking must not start before the banner
    // answer. (The banner backfills the marker for legacy explicit
    // opt-outs, so this only delays first-run init until Accept.)
    if (getAppPreference<string | null>(CONSENT_CHOICE_KEY, null) === null) return;
    if (import.meta.env.MODE === 'test' || initialized) return;
    initialized = true;
    const ph = await getPostHog();
    if (ph) {
      try {
        ph.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          autocapture: true,
          capture_pageview: true,
          capture_pageleave: true,
          advanced_disable_feature_flags: true,
          // Session recording fires from inside `posthog-js`'s dynamically-
          // imported chunk — visible in DevTools as `mf.js`. BonaMind does
          // not use session replay (a different internal hook powers study
          // replay), so the recorder throws `Error: Params are not set`
          // during eager init because no recorder params are wired up.
          // Top-level `disable_session_recording` is the single source of
          // truth — the older `session_recording: { disabled: true }`
          // object path is deprecated in posthog-js v1 and would double-
          // drift if we ever flipped it back. Keep only this flag.
          disable_session_recording: true,
        });
      } catch (e) {
        console.warn('[Analytics] PostHog init failed:', e);
      }
    }
  },

  identify: async (userId: string, properties?: Record<string, any>) => {
    const ph = await getPostHog();
    if (ph) ph.identify(userId, properties);
  },

  reset: async () => {
    const ph = await getPostHog();
    if (ph) ph.reset();
  },

  track: async (eventName: string, properties?: Record<string, any>) => {
    const ph = await getPostHog();
    if (ph) ph.capture(eventName, properties);
  },

  trackHeart: async (
    dimension: 'happiness' | 'engagement' | 'adoption' | 'retention' | 'task_success',
    event: string,
    properties?: Record<string, any>
  ) => {
    const ph = await getPostHog();
    if (ph) ph.capture(`HEART:${dimension}:${event}`, properties);
  },

  trackOnboardingStep: async (stepNumber: number, stepName: string) => {
    const ph = await getPostHog();
    if (ph) ph.capture('Onboarding Step Completed', { step: stepNumber, stepName });
  },

  trackCoreAction: async (actionType: 'generate_deck' | 'study_session' | 'chat_message', details?: any) => {
    const ph = await getPostHog();
    if (ph) ph.capture(`Core Action: ${actionType}`, details);
  },

  /**
   * Funnel events. PostHog autocapture handles raw pageviews; these give the
   * measurable funnel steps:
   *   landing_cta_click → signup_started → signup_completed → onboarding_completed.
   */
  trackFunnel: async (
    step: 'landing_cta_click' | 'signup_started' | 'signup_completed' | 'onboarding_completed',
    properties?: Record<string, any>,
  ) => {
    const ph = await getPostHog();
    if (ph) ph.capture(`Funnel: ${step}`, properties);
  },

  trackSubscription: async (status: string, plan: string) => {
    const ph = await getPostHog();
    if (ph) ph.capture('Subscription Change', { status, plan });
  }
};



