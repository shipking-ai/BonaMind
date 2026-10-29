import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pins the signup-funnel analytics contract: with a real PostHog key
 * configured, each funnel step must fire a capture so the landing →
 * signup path is measurable on day one. The module gates on the key, so we
 * stub a non-placeholder key and re-import after resetting modules.
 */
const captures = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: (name: string, _props?: Record<string, unknown>) => {
      captures.names.push(name);
    },
  },
}));

describe('analyticsService funnel instrumentation', () => {
  beforeEach(() => {
    captures.names.length = 0;
    vi.resetModules();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_testkey123456789');
  });

  it('trackFunnel fires a capture per step when PostHog is configured', async () => {
    const { analyticsService } = await import('../services/analytics/analyticsService');

    await analyticsService.trackFunnel('landing_cta_click');
    await analyticsService.trackFunnel('signup_started');
    await analyticsService.trackFunnel('signup_completed');

    expect(captures.names).toEqual([
      'Funnel: landing_cta_click',
      'Funnel: signup_started',
      'Funnel: signup_completed',
    ]);
  });

  it('no capture fires with a placeholder key (prod must set a real key)', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_placeholder');
    const { analyticsService } = await import('../services/analytics/analyticsService');

    await analyticsService.trackFunnel('landing_cta_click');

    expect(captures.names).toEqual([]);
  });
});
