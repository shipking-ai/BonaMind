/**
 * Billing: subscription status + Stripe checkout, through the deployed API.
 *
 * Entitlement is read from the server (app_metadata via the service-role
 * side); the client only receives the decision. Identity in a request always
 * comes from the bearer token — the body userId/email are informational only,
 * kept for parity with the website's calls to the same routes.
 */
import { env } from '../env';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'none';

export interface SubscriptionView {
  subscribed: boolean;
  status: SubscriptionStatus;
  plan: string;
  graceEndedAt: string | null;
}

const base = () => env.apiBaseUrl.replace(/\/+$/, '');

async function post(token: string, path: string, body: unknown, timeoutMs = 8_000): Promise<Record<string, any>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: Record<string, any>;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Could not read ${path} (HTTP ${res.status}).`);
    }
    if (!res.ok || data.error) throw new Error(String(data.error || `HTTP ${res.status}`));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** The authoritative status for the signed-in user. Throwing means "unknown". */
export async function fetchSubscription(token: string, userId: string, email: string): Promise<SubscriptionView> {
  const data = await post(token, '/api/subscription', { userId, email });
  const status = String(data.status ?? 'none') as SubscriptionStatus;
  return {
    subscribed: Boolean(data.subscribed),
    status,
    plan: String(data.plan ?? 'Starter'),
    graceEndedAt: data.graceEndedAt ?? null,
  };
}

/** A hosted Stripe Checkout URL to open in the system browser. */
export async function startCheckout(token: string, priceId: string): Promise<string> {
  if (!priceId) throw new Error('This install has no subscription price configured.');
  const data = await post(token, '/api/stripe/checkout', { priceId });
  if (typeof data.url === 'string') return data.url;
  if (data.alreadySubscribed) throw new Error('You are already subscribed to BonaMind Pro.');
  throw new Error('Could not start checkout.');
}

/** A Stripe billing-portal URL; only valid for the caller's own customer. */
export async function startPortal(token: string, customerId: string): Promise<string> {
  if (!customerId) throw new Error('No billing account found on this login — upgrade first.');
  const data = await post(token, '/api/stripe/portal', { customerId });
  if (typeof data.url === 'string') return data.url;
  throw new Error('Could not open the billing portal.');
}

const GRANTING: ReadonlySet<SubscriptionStatus> = new Set(['active', 'trialing', 'past_due']);

/** One line that tells the user where they stand (drives the You card). */
export function subscriptionLine(view: SubscriptionView): string {
  switch (view.status) {
    case 'active':
      return 'Pro subscription active';
    case 'trialing':
      return 'Pro trial running';
    case 'past_due':
      return 'Payment failed — update your card to keep access';
    case 'canceled':
      return 'Subscription canceled';
    case 'expired':
    case 'none':
      return 'Upgrade to Pro for unlimited courses and Prof. Linnea';
  }
}

/** Whether the Upgrade button applies to this view. */
export function needsUpgrade(view: SubscriptionView): boolean {
  return !GRANTING.has(view.status);
}
