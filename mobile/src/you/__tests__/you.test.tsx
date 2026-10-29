import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { getOutbox } from '../../data/app';
import { signOut } from '../../data/auth';
import { fetchSubscription } from '../../data/subscription';
import { useSettings } from '../../design/settings';
import { syncDailyReminder } from '../../reminders/reminders';
import { YouScreen } from '../YouScreen';

jest.mock('../../data/auth', () => {
  const state = { session: { user: { email: 'sam@example.com' } } as Record<string, any> };
  return {
    useAuth: () => ({ userId: 'u1', status: 'signed-in', session: state.session }),
    signOut: jest.fn(async () => {}),
    __setState: (s: Record<string, any>) => { state.session = s; },
  };
});
jest.mock('../../data/hooks', () => ({ useDisplayName: () => ({ data: 'Sam Rivera' }), useSessions: () => ({ data: [] }) }));
jest.mock('../../data/sync', () => ({ useSync: () => ({ online: true, pending: 0, flushNow: jest.fn(async () => {}) }) }));
jest.mock('../../data/app', () => ({ getOutbox: jest.fn() }));
jest.mock('../../data/subscription', () => ({
  ...jest.requireActual('../../data/subscription'),
  fetchSubscription: jest.fn(async () => ({ subscribed: false, status: 'none', plan: 'Starter', graceEndedAt: null })),
  startCheckout: jest.fn(async () => 'https://checkout.example.com'),
  startPortal: jest.fn(async () => 'https://portal.example.com'),
}));
jest.mock('../../reminders/reminders', () => ({
  REMINDER_HOURS: [7, 9, 12, 18, 21],
  syncDailyReminder: jest.fn(async () => 'scheduled'),
}));
jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://bonamind.app', stripePriceIdAnnual: 'price_annual', stripePriceIdMonthly: 'price_monthly' } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), selectionAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));

const authModule = require('../../data/auth') as { __setState: (s: Record<string, any>) => void };
const pending = (n: number) => (getOutbox as jest.Mock).mockReturnValue({ pending: jest.fn(async () => n) });
const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const renderYou = () =>
  render(
    <QueryClientProvider client={client()}>
      <YouScreen />
    </QueryClientProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  authModule.__setState({ user: { email: 'sam@example.com' } });
  useSettings.setState({ hapticsEnabled: true, reminderEnabled: false, reminderHour: 9 });
  (fetchSubscription as jest.Mock).mockResolvedValue({ subscribed: false, status: 'none', plan: 'Starter', graceEndedAt: null });
  (syncDailyReminder as jest.Mock).mockResolvedValue('scheduled');
});

it('shows who is signed in', async () => {
  pending(0);
  await renderYou();
  expect(screen.getByText('Sam Rivera')).toBeTruthy();
});

it('toggles haptics', async () => {
  pending(0);
  await renderYou();
  await fireEvent(screen.getByRole('switch', { name: 'Haptics' }), 'valueChange', false);
  expect(useSettings.getState().hapticsEnabled).toBe(false);
});

it('shows the Starter plan and an Upgrade button for an unpaid account', async () => {
  pending(0);
  authModule.__setState({ access_token: 'tok', user: { id: 'auth-1', email: 'sam@example.com' } });
  await renderYou();
  await waitFor(() => expect(fetchSubscription).toHaveBeenCalledWith('tok', 'auth-1', 'sam@example.com'));
  await waitFor(() => expect(screen.getByText('Starter')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Upgrade to Pro' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Manage billing' })).toBeNull();
});

it('shows Pro with a Manage billing button for a customer', async () => {
  pending(0);
  authModule.__setState({
    access_token: 'tok',
    user: { id: 'auth-1', email: 'sam@example.com', user_metadata: { stripe_customer_id: 'cus_123' } },
  });
  (fetchSubscription as jest.Mock).mockResolvedValue({ subscribed: true, status: 'active', plan: 'Pro', graceEndedAt: null });
  await renderYou();
  await waitFor(() => expect(screen.getByText('Pro')).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
});

it('flags a failed payment and points to the billing portal', async () => {
  pending(0);
  authModule.__setState({
    access_token: 'tok',
    user: { id: 'auth-1', email: 'sam@example.com', user_metadata: { stripe_customer_id: 'cus_123' } },
  });
  (fetchSubscription as jest.Mock).mockResolvedValue({
    subscribed: true,
    status: 'past_due',
    plan: 'Pro',
    graceEndedAt: '2026-10-30T00:00:00.000Z',
  });
  await renderYou();
  await waitFor(() => expect(screen.getByText(/Payment failed — update your card/)).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
});

it('says the status could not be checked when the route fails', async () => {
  pending(0);
  authModule.__setState({ access_token: 'tok', user: { id: 'auth-1', email: 'sam@example.com' } });
  (fetchSubscription as jest.Mock).mockRejectedValue(new Error('boom'));
  await renderYou();
  await waitFor(() => expect(screen.getByText('Status could not be checked')).toBeTruthy());
  expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();
});

it('schedules a reminder when switched on', async () => {
  pending(0);
  await renderYou();
  await fireEvent(screen.getByRole('switch', { name: 'Review reminder' }), 'valueChange', true);
  await waitFor(() => expect(syncDailyReminder).toHaveBeenCalledWith(true, 9));
  expect(useSettings.getState().reminderEnabled).toBe(true);
});

it('reverts the reminder switch and explains when the system denies', async () => {
  pending(0);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (syncDailyReminder as jest.Mock).mockResolvedValue('denied');
  await renderYou();
  await fireEvent(screen.getByRole('switch', { name: 'Review reminder' }), 'valueChange', true);
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(useSettings.getState().reminderEnabled).toBe(false);
  expect(alert.mock.calls[0][0]).toBe('Notifications are off');
});

it('reverts the reminder switch silently where notifications do not exist', async () => {
  pending(0);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (syncDailyReminder as jest.Mock).mockResolvedValue('unsupported');
  await renderYou();
  await fireEvent(screen.getByRole('switch', { name: 'Review reminder' }), 'valueChange', true);
  await waitFor(() => expect(useSettings.getState().reminderEnabled).toBe(false));
  expect(alert).not.toHaveBeenCalled();
});

it('cycles the reminder hour', async () => {
  pending(0);
  await renderYou();
  await fireEvent.press(screen.getByRole('button', { name: 'Reminder hour' }));
  expect(useSettings.getState().reminderHour).toBe(12);
  await waitFor(() => expect(syncDailyReminder).toHaveBeenCalledWith(false, 12));
});

it('warns before signing out with reviews still queued', async () => {
  pending(2);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderYou();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(alert.mock.calls[0][1]).toBe("You have 2 reviews waiting to sync. They'll upload next time you sign in to this account.");
  expect(signOut).not.toHaveBeenCalled();
});

it('signs straight out when everything has synced', async () => {
  pending(0);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderYou();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(signOut).toHaveBeenCalled());
  expect(alert).not.toHaveBeenCalled();
});
