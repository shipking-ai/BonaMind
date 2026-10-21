/**
 * Local review reminders — one "your review queue is ready" notification per
 * day at the chosen hour. Device-local on purpose: remote push needs Firebase
 * credentials and stays out of the app's hands (HANDOFF: push sender awaits
 * them). Mirrors the website's daily reminder (`auramind-gemini/src/lib/
 * reminderSchedule.ts`, `buildReminderNotifications`) for the one interval
 * every platform can honor.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { SchedulableNotificationTriggerInput } from 'expo-notifications';

export const REMINDER_HOURS = [7, 9, 12, 18, 21] as const;

export function dailyReminderTrigger(hour: number): SchedulableNotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: ((hour % 24) + 24) % 24,
    minute: 0,
  };
}

const CONTENT = {
  title: 'BonaMind review reminder',
  body: 'Your review queue is ready. A few minutes keeps your memory curve sharp.',
} as const;

export type ReminderSync = 'scheduled' | 'off' | 'denied' | 'unsupported';

/**
 * Cancel everything and reschedule when enabled. Returns why (or that it
 * worked). Any platform or module failure degrades to `unsupported` —
 * scheduling is a nicety, never a blocker.
 */
export async function syncDailyReminder(enabled: boolean, hour: number): Promise<ReminderSync> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!enabled) return 'off';
    const p = await Notifications.requestPermissionsAsync();
    const granted = p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) return 'denied';
    await Notifications.scheduleNotificationAsync({ content: { ...CONTENT }, trigger: dailyReminderTrigger(hour) });
    return 'scheduled';
  } catch {
    return 'unsupported';
  }
}
