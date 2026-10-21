import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * The landing page and the Stripe checkout page state prices in two
 * separate hand-written places. They drifted once already ("$8" on the
 * landing page vs "$7.99" at checkout), which reads as a bait-and-switch
 * at the exact moment the user is deciding to pay.
 *
 * These tests pin the two surfaces to each other. If pricing changes,
 * both files change together or this fails.
 */

const SRC = path.resolve(__dirname, '..');
const landing = fs.readFileSync(
  path.join(SRC, 'components', 'landing', 'ModernLandingPage.tsx'),
  'utf8',
);
const payment = fs.readFileSync(
  path.join(SRC, 'components', 'auth', 'PaymentPage.tsx'),
  'utf8',
);

describe('pricing is stated consistently across surfaces', () => {
  it('quotes the same monthly price on the landing page and at checkout', () => {
    // PaymentPage is the source of truth — it is what Stripe actually bills.
    const monthly = payment.match(/price:\s*'(\$[\d.]+)',\s*\n\s*interval:\s*'\/month'/);
    expect(monthly, 'could not read the monthly price out of PaymentPage').not.toBeNull();

    const price = monthly![1]; // "$7.99"
    expect(
      landing,
      `landing page must quote ${price} to match Stripe checkout`,
    ).toContain(`>${price}</span>`);
  });

  it('quotes the same annual price and billed total on both surfaces', () => {
    expect(payment).toContain('$47.88');
    expect(landing).toContain('$47.88');
    expect(landing).toContain('$3.99');
  });

  it('does not advertise a plan tier the app cannot grant', () => {
    // App.tsx gates on `active` / `trialing` only — there is no free
    // entitlement state, so a "$0 forever" card would send users straight
    // into the paywall and risks a store-listing rejection.
    //
    // If a real free tier ships, extend the subscription status union and
    // the App.tsx gate first, then relax this test.
    const app = fs.readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    const grantsFreeTier = /status\s*===\s*"free"/.test(app);

    if (!grantsFreeTier) {
      expect(
        landing,
        'landing page offers a "$0 forever" tier but App.tsx grants access only to active/trialing users',
      ).not.toMatch(/\$0<\/span>/);
    }
  });

  it('does not claim signup is card-free when checkout always takes a card', () => {
    // The checkout session sets payment_method_collection: 'always', so any
    // "no card required" copy on the landing page is false advertising at
    // the top of the funnel.
    const api = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'api', 'index.ts'),
      'utf8',
    );
    const alwaysTakesCard = /payment_method_collection:\s*'always'/.test(api);

    if (alwaysTakesCard) {
      expect(
        landing,
        'checkout always collects a card, so the landing page must not say otherwise',
      ).not.toMatch(/no card required/i);
    }
  });

  it('states the trial length that checkout actually grants', () => {
    const api = fs.readFileSync(
      path.resolve(__dirname, '..', '..', '..', 'api', 'index.ts'),
      'utf8',
    );
    const days = api.match(/trial_period_days:\s*(\d+)/);
    expect(days, 'could not read trial_period_days out of the checkout session').not.toBeNull();

    expect(
      landing,
      `landing page should state the real ${days![1]}-day trial`,
    ).toContain(`${days![1]} days free`);
  });
});
