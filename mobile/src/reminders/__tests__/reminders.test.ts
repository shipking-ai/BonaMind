import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { dailyReminderTrigger, type ReminderSync, syncDailyReminder } from '../reminders';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  IosAuthorizationStatus: { PROVISIONAL: 'provisional' },
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

beforeEach(() => {
  jest.clearAllMocks();
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
});

it('cancels and announces nothing when the reminder is off', async () => {
  await expect(syncDailyReminder(false, 9)).resolves.toBe<ReminderSync>('off');
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('schedules a repeating daily trigger at the chosen hour', async () => {
  await expect(syncDailyReminder(true, 21)).resolves.toBe('scheduled');
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: {
      title: 'BonaMind review reminder',
      body: 'Your review queue is ready. A few minutes keeps your memory curve sharp.',
    },
    trigger: { type: 'daily', hour: 21, minute: 0 },
  });
});

it('reports a refusal instead of scheduling silently', async () => {
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
  await expect(syncDailyReminder(true, 9)).resolves.toBe('denied');
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('accepts provisional iOS authorization like flight-test builds', async () => {
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    ios: { status: 'provisional' },
  });
  await expect(syncDailyReminder(true, 7)).resolves.toBe('scheduled');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({ trigger: { type: 'daily', hour: 7, minute: 0 } }),
  );
});

it('degrades to unsupported when the module or platform fails', async () => {
  (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockRejectedValue(new Error('no module'));
  await expect(syncDailyReminder(true, 9)).resolves.toBe('unsupported');
  await expect(syncDailyReminder(false, 9)).resolves.toBe('unsupported');
});

it('wraps hours into the 0-23 range the trigger requires', () => {
  expect(dailyReminderTrigger(9)).toEqual({ type: 'daily', hour: 9, minute: 0 });
  expect(dailyReminderTrigger(-3)).toEqual({ type: 'daily', hour: 21, minute: 0 });
});

it('never schedules on web', async () => {
  // Mutate Platform.OS directly rather than re-registering mocks: the app's
  // reminders module holds a live reference to React Native's Platform.
  const os = (Platform as { OS: string }).OS;
  (Platform as { OS: string }).OS = 'web';
  try {
    await expect(syncDailyReminder(true, 9)).resolves.toBe('unsupported');
  } finally {
    (Platform as { OS: string }).OS = os;
  }
  expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
