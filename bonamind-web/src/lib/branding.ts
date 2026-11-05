/**
 * Branding — single source of truth for the operating company (parent) and
 * BonaMind (first product) brand surface.
 *
 * Load-bearing contract (pinned by `__tests__/branding.test.ts` v3 + every
 * legal/footer page consumer). Any future rename touches exactly this
 * file; consumers reference `BRAND.*` or the named exports — never the
 * company name inline.
 *
 * Placement policy (M6.5.b round 14):
 *   - BonaMind is the PRIMARY mark everywhere it's seen.
 *   - The company line appears BENEATH or BESIDE the BonaMind mark,
 *     never inside it, never replacing it. See `CogniWordmark.tsx`.
 *   - Store-listing metadata (capacitor.config appName, package.json
 *     metadata, index.html <title>) MUST stay "BonaMind" only — Google
 *     rejects anything that looks like a tagline in the visual app name,
 *     and only the "Developer/Vendor Name" field accepts the parent
 *     brand. The company name goes in that field at the storefront console.
 *   - Mobile chrome (TopAppBar, MobileTabBar) is intentionally too
 *     cramped for the parent line.
 *
 * Per the test contract:
 *   - `PARENT_COMPANY_LEGAL` and `TRADEMARK_STATEMENT` carry NO trailing
 *     period because consumers re-attach their own punctuation, and a
 *     missing trailing dot at the source avoids "Inc.." double-period
 *     bugs at the site of use.
 *   - `LEGAL_YEAR` and `LEGAL_COPYRIGHT_LINE` share a stable year so the
 *     parity test can re-extract the year string from the copyright
 *     line and compare it byte-for-byte to `LEGAL_YEAR`.
 */

import { APP_NAME } from '../../app-identity.ts';

/* ── Named exports (canonical, pinned by branding.test.ts) ───────────── */

/**
 * The entity that operates the service, as decided by the owner on 2026-11-04
 * (#225). It replaced CogniVect, Inc., which is being dissolved. Every constant
 * from here to LEGAL_COPYRIGHT_LINE names that entity, and a privacy policy has
 * to name a real data controller, so change these only on a legal decision.
 *
 * These are not in this repository and have to be changed by hand, because they
 * keep working until someone does, which makes them easy to miss:
 *   1. Stripe's merchant entity of record: payouts fail if it is dissolved.
 *   2. Google Play Console's verified developer entity name and address.
 *   3. Google/Notion OAuth consent screens, which show the verified entity.
 *   4. The W-9 (or W-8) filed with Play and Stripe.
 */

/** The entity that operates the service. See the note above. */
export const PARENT_COMPANY_NAME    = 'CastleRock Investors Group';
/** Legal suffix matters: consumers add their own punctuation after it. */
export const PARENT_COMPANY_LEGAL   = 'CastleRock Investors Group, LLC'; /* no trailing period */
export const PARENT_BRAND_SLUG     = 'castlerock';
/**
 * The product name, sourced from app-identity.ts rather than retyped.
 *
 * These two used to be independent literals, which is precisely how a rename
 * ends up showing the new name in the tab title and the old one in the footer.
 * TRADEMARK_STATEMENT and the BRAND aggregate both derive from this.
 */
export const PRODUCT_NAME          = APP_NAME;
export const CONTACT_EMAIL         = 'hello@bonamind.app';
/* Until the operating entity provisions its own mailbox, contact-mail aliases
 * to the deliverability-warmed production mailbox. */
export const PARENT_CONTACT_EMAIL  = CONTACT_EMAIL;
export const LEGAL_ADDRESS         = `${PARENT_COMPANY_LEGAL}, ADDRESS NEEDED`;
export const TRADEMARK_STATEMENT   = `${PRODUCT_NAME} is a trademark of ${PARENT_COMPANY_LEGAL}`;

/* Year must be computed BEFORE the copyright line so the inlined value
 * inside LEGAL_COPYRIGHT_LINE matches LEGAL_YEAR byte-for-byte. */
export const LEGAL_YEAR: number                       = new Date().getFullYear();
export const LEGAL_COPYRIGHT_LINE: string             = `© ${LEGAL_YEAR} ${PARENT_COMPANY_LEGAL}. All rights reserved.`;

/**
 * The product's own web origin, for surfaces that need an absolute URL.
 *
 * It lives here rather than in seo.ts because it is a brand/legal surface: the
 * privacy policy and terms have to name the site the service actually runs on.
 * seo.ts needs the same value, and two literals would drift.
 *
 * The API keeps its own copy in api/_lib/origin.ts — a separate runtime that
 * cannot import from the web app, and overridable by env so the deploy target
 * can change without a code change. Keep the two in step.
 */
export const PRODUCT_SITE_URL                          = 'https://bonamind.app';

/**
 * Store "Developer/Vendor URL" and the About page's external link.
 *
 * Repointed from cogniavect.app, which belonged to the dissolved parent, to the
 * product's own origin. Both stores require this field, so it cannot simply be
 * left blank.
 */
export const VENDOR_URL                                = PRODUCT_SITE_URL;

/* ── BRAND aggregate — every key mirrors its named export ─────────────── */
/* The branding.test.ts parity test asserts Object.keys(BRAND).sort()
 * equals a fixed enumeration, so adding a constant requires updating
 * both surfaces. */
export const BRAND = {
  parentName:           PARENT_COMPANY_NAME,
  parentLegal:          PARENT_COMPANY_LEGAL,
  parentSlug:           PARENT_BRAND_SLUG,
  product:              PRODUCT_NAME,
  contactEmail:         CONTACT_EMAIL,
  parentContactEmail:   PARENT_CONTACT_EMAIL,
  legalAddress:         LEGAL_ADDRESS,
  trademarkStatement:   TRADEMARK_STATEMENT,
  copyrightLine:        LEGAL_COPYRIGHT_LINE,
} as const;

/* ── Type-safe helpers ────────────────────────────────────────────────── */

export type BrandParent = typeof PARENT_COMPANY_NAME;
export type BrandAggregateKeys = keyof typeof BRAND;
