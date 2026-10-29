import type { UserProfile } from '../types';

/**
 * The plan name every screen shows: the Windows, iPhone and Android settings,
 * the full settings page, and analytics' `plan` trait.
 *
 * It is derived from `app_metadata.subscription_status`, the field
 * api/_lib/entitlement.ts reads to decide access. Only the service-role key
 * can write app_metadata, so the label cannot drift from what billing says.
 *
 * DELIBERATELY NO FALLBACK to user_metadata. The label used to be
 * `user_metadata.plan`, which a signed-in user can set with one
 * `auth.updateUser` call, and the full settings page read `user_profiles.plan`,
 * which nothing in the billing path keeps current. The same account showed
 * "Pro" in one place and "Free" in the other, and neither was the
 * subscription.
 *
 * `past_due` counts as Pro: the subscription still exists while Stripe
 * retries the card, and App.tsx keeps access open for the grace window. Once
 * that window ends the cron writes `expired`, and the label follows.
 *
 * A staff role is not a plan. hasFreeAccess unlocks the product for staff, but
 * a staff account with no subscription is shown as Starter, because that is
 * what billing records.
 */
export type PlanName = UserProfile['plan'];

const PAID_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

export function resolvePlan(
  user:
    | { app_metadata?: Record<string, unknown> | null; user_metadata?: Record<string, unknown> | null }
    | null
    | undefined,
): PlanName {
  const status = user?.app_metadata?.subscription_status;
  return typeof status === 'string' && PAID_STATUSES.has(status) ? 'Pro' : 'Starter';
}
