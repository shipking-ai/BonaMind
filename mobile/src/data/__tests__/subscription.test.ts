import { fetchSubscription, needsUpgrade, startCheckout, startPortal, subscriptionLine, type SubscriptionView } from '../subscription';

jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://api.example.com/' } }));

let status = 200;
let respond: Record<string, unknown> = {};

beforeEach(() => {
  status = 200;
  respond = {};
  jest.resetAllMocks();
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    // Respect the caller's abort signal the way a real transport would, so
    // the timeout test can observe a rejection instead of hanging forever.
    return new Promise<Response>((resolve, reject) => {
      if (init?.signal) init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      const ok = status >= 200 && status < 300;
      resolve({
        ok,
        status,
        json: async () => respond,
      } as Response);
    });
  }) as jest.Mock;
});

const view = (over: Partial<SubscriptionView> = {}): SubscriptionView => ({
  subscribed: false,
  status: 'none',
  plan: 'Starter',
  graceEndedAt: null,
  ...over,
});

it('posts a bearer identity to /api/subscription and normalizes the response', async () => {
  respond = { subscribed: true, status: 'active', plan: 'Pro' };
  const res = await fetchSubscription('tok', 'auth-1', 'sam@example.com');
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.example.com/api/subscription',
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    }),
  );
  const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
  expect(body).toEqual({ userId: 'auth-1', email: 'sam@example.com' });
  expect(res).toEqual(view({ subscribed: true, status: 'active', plan: 'Pro' }));
});

it('fills a missing status with none and keeps an untouched plan', async () => {
  respond = { subscribed: false };
  expect(await fetchSubscription('tok', 'u', 'e')).toEqual(view());
});

it('reports the failure message a server error or unknown route returns', async () => {
  status = 404;
  respond = { error: 'Unknown endpoint' };
  await expect(fetchSubscription('tok', 'u', 'e')).rejects.toThrow('Unknown endpoint');
});

it('aborts a hanging subscription check after the timeout', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  ) as unknown as jest.Mock;
  const pending = fetchSubscription('tok', 'u', 'e');
  const assertion = expect(pending).rejects.toThrow('Aborted');
  await jest.advanceTimersByTimeAsync(8_100);
  jest.useRealTimers();
  await assertion;
});

it('opens checkout with the configured price', async () => {
  respond = { url: 'https://checkout.stripe.com/c/sess' };
  await expect(startCheckout('tok', 'price_1')).resolves.toBe('https://checkout.stripe.com/c/sess');
  const call = (global.fetch as jest.Mock).mock.calls[0];
  expect(call[0]).toBe('https://api.example.com/api/stripe/checkout');
  expect(JSON.parse(call[1].body)).toEqual({ priceId: 'price_1' });
});

it('refuses to call checkout without a configured price', async () => {
  await expect(startCheckout('tok', '')).rejects.toThrow('no subscription price configured');
});

it('surfaces an already-subscribed checkout as an error', async () => {
  respond = { alreadySubscribed: true };
  await expect(startCheckout('tok', 'price_1')).rejects.toThrow('already subscribed');
});

it('opens the billing portal for an existing customer', async () => {
  respond = { url: 'https://billing.stripe.com/p/session' };
  await expect(startPortal('tok', 'cus_1')).resolves.toBe('https://billing.stripe.com/p/session');
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({ customerId: 'cus_1' });
});

it('requires a customer for the portal', async () => {
  await expect(startPortal('tok', '')).rejects.toThrow('No billing account found');
});

it('maps statuses to one line each', async () => {
  expect(subscriptionLine(view({ status: 'active', plan: 'Pro' }))).toBe('Pro subscription active');
  expect(subscriptionLine(view({ status: 'trialing' }))).toBe('Pro trial running');
  expect(subscriptionLine(view({ status: 'past_due' }))).toBe('Payment failed — update your card to keep access');
  expect(subscriptionLine(view({ status: 'canceled' }))).toBe('Subscription canceled');
  expect(subscriptionLine(view({ status: 'expired' }))).toBe('Upgrade to Pro for unlimited courses and Prof. Linnea');
  expect(subscriptionLine(view({ status: 'none' }))).toBe('Upgrade to Pro for unlimited courses and Prof. Linnea');
});

it('decides the upgrade button from the granting statuses', () => {
  expect(needsUpgrade(view({ status: 'active' }))).toBe(false);
  expect(needsUpgrade(view({ status: 'past_due' }))).toBe(false);
  expect(needsUpgrade(view({ status: 'canceled' }))).toBe(true);
  expect(needsUpgrade(view({ status: 'none' }))).toBe(true);
});
