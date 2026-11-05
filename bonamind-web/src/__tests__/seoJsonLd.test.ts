/**
 * Guards the structured data search engines read. BonaMind has no verifiable
 * store ratings, so the JSON-LD must never claim one: a made-up
 * aggregateRating is a false claim that Google can penalise and
 * consumer-protection rules treat as advertising fiction.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setDefaultJsonLd } from '../lib/seo';

const SEO_SOURCE = path.resolve(__dirname, '../lib/seo.ts');

function jsonLd(): Record<string, unknown> {
  const script = document.querySelector('script[type="application/ld+json"]');
  if (!script || !script.textContent) throw new Error('no JSON-LD script in the head');
  return JSON.parse(script.textContent) as Record<string, unknown>;
}

describe('the JSON-LD structured data', () => {
  beforeEach(() => {
    document.head
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((script) => script.remove());
  });

  it('carries the application facts without a fabricated aggregateRating', () => {
    setDefaultJsonLd();

    const ld = jsonLd();
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      applicationCategory: 'EducationalApplication',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    });
    expect(ld).not.toHaveProperty('aggregateRating');
  });

  it('never reintroduces an authored rating claim anywhere in seo.ts', () => {
    // Reading the source pins the module itself: a future edit could add the
    // rating back through setJsonLd with a different wrapper name, and the
    // runtime test above would not see it.
    const source = readFileSync(SEO_SOURCE, 'utf8');
    expect(source).not.toMatch(/aggregateRating|ratingValue|ratingCount/);
  });
});
