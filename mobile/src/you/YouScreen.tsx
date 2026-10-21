import { computeStreak } from '@bonamind/core';
import { useEffect } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOutbox } from '../data/app';
import { signOut, useAuth } from '../data/auth';
import { useDisplayName, useSessions } from '../data/hooks';
import { fetchSubscription, needsUpgrade, startCheckout, startPortal, subscriptionLine } from '../data/subscription';
import { useSync } from '../data/sync';
import { PaperCard } from '../design/components/PaperCard';
import { SecondaryButton } from '../design/components/SecondaryButton';
import { useSettings, RETENTION_OPTIONS } from '../design/settings';
import { colors, fonts, radius, space } from '../design/tokens';
import { env } from '../env';
import { useNow } from '../hooks/useNow';
import { REMINDER_HOURS, syncDailyReminder } from '../reminders/reminders';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

export function YouScreen() {
  const { userId, session } = useAuth();
  const now = useNow();
  const name = useDisplayName(userId).data || session?.user.email?.split('@')[0] || 'You';
  const streak = computeStreak(useSessions(userId).data ?? [], new Date(now));
  const { flushNow } = useSync(userId);
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettings((s) => s.setHapticsEnabled);
  const targetRetention = useSettings((s) => s.targetRetention);
  const setTargetRetention = useSettings((s) => s.setTargetRetention);
  const reminderEnabled = useSettings((s) => s.reminderEnabled);
  const setReminderEnabled = useSettings((s) => s.setReminderEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const setReminderHour = useSettings((s) => s.setReminderHour);
  const qc = useQueryClient();

  const token = session?.access_token ?? '';
  const subscription = useQuery({
    queryKey: ['subscription', userId],
    queryFn: async () => fetchSubscription(token, session?.user.id ?? '', session?.user.email ?? ''),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });
  const customerId = (session?.user as { user_metadata?: { stripe_customer_id?: string } })?.user_metadata
    ?.stripe_customer_id;

  // Re-check the plan whenever the app comes back to the foreground: a
  // checkout just finished in the system browser and this screen was paused.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void qc.invalidateQueries({ queryKey: ['subscription'] });
    });
    return () => sub.remove();
  }, [qc]);

  const checkout = useMutation({
    mutationFn: async () => {
      const priceId = env.stripePriceIdAnnual || env.stripePriceIdMonthly;
      return startCheckout(token, priceId);
    },
    onSuccess: (url) => void Linking.openURL(url),
    onError: (e) => Alert.alert('Upgrade', String(e)),
  });
  const portal = useMutation({
    mutationFn: () => startPortal(token, customerId ?? ''),
    onSuccess: (url) => void Linking.openURL(url),
    onError: (e) => Alert.alert('Billing', String(e)),
  });

  async function onSignOut() {
    await flushNow();
    const waiting = userId ? await getOutbox().pending(userId) : 0;
    if (waiting === 0) return void signOut();
    Alert.alert(
      'Reviews waiting to sync',
      `You have ${plural(waiting, 'review')} waiting to sync. They'll upload next time you sign in to this account.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }],
    );
  }

  async function onReminderToggle(v: boolean) {
    setReminderEnabled(v);
    const result = await syncDailyReminder(v, reminderHour);
    if (result === 'unsupported') setReminderEnabled(false);
    if (result === 'denied') {
      setReminderEnabled(false);
      Alert.alert(
        'Notifications are off',
        'Allow notifications for BonaMind in system settings to get review reminders.',
      );
    }
  }

  function onReminderHour() {
    const i = REMINDER_HOURS.indexOf(reminderHour as (typeof REMINDER_HOURS)[number]);
    const h = REMINDER_HOURS[(i + 1) % REMINDER_HOURS.length];
    setReminderHour(h);
    void syncDailyReminder(reminderEnabled, h);
  }

  const view = subscription.data;
  const failed = subscription.isError;
  const planLabel = view?.plan ?? (failed ? '—' : '…');
  const statusText = failed ? 'Status could not be checked' : view ? subscriptionLine(view) : '';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <PaperCard style={styles.who}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.streak}>{`${plural(streak, 'day')} streak`}</Text>
      </PaperCard>
      <PaperCard style={styles.plan}>
        <Text style={styles.planTitle}>Subscription</Text>
        <Text style={styles.planName}>{planLabel}</Text>
        <Text style={styles.streak}>{statusText}{graceTime(view)}</Text>
        <View style={styles.planActions}>
          {view && !subscription.isError && subscription.isSuccess && needsUpgrade(view) ? (
            <SecondaryButton label="Upgrade to Pro" onPress={() => checkout.mutate()} />
          ) : null}
          {subscription.isSuccess && customerId ? (
            <SecondaryButton label="Manage billing" onPress={() => portal.mutate()} />
          ) : null}
        </View>
      </PaperCard>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Haptics</Text>
        <Switch
          accessibilityLabel="Haptics"
          accessibilityRole="switch"
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
          trackColor={{ true: colors.violet, false: colors.raised }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Target retention"
        onPress={() => {
          const i = RETENTION_OPTIONS.indexOf(targetRetention as (typeof RETENTION_OPTIONS)[number]);
          setTargetRetention(RETENTION_OPTIONS[(i + 1) % RETENTION_OPTIONS.length]);
        }}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>Target retention</Text>
        <Text style={styles.rowValue}>{targetRetention}</Text>
      </Pressable>
      {Platform.OS !== 'web' ? (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Review reminder</Text>
            <Switch
              accessibilityLabel="Review reminder"
              accessibilityRole="switch"
              value={reminderEnabled}
              onValueChange={(v) => void onReminderToggle(v)}
              trackColor={{ true: colors.violet, false: colors.raised }}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Reminder hour" onPress={onReminderHour} style={styles.row}>
            <Text style={styles.rowLabel}>Reminder hour</Text>
            <Text style={styles.rowValue}>{hourLabel(reminderHour)}</Text>
          </Pressable>
        </>
      ) : null}
      <SecondaryButton label="Open BonaMind on the web" onPress={() => void Linking.openURL(env.apiBaseUrl)} />
      <SecondaryButton label="Sign out" onPress={() => void onSignOut()} />
    </ScrollView>
  );
}

/** " until Oct 24" — the grace window the server granted for a failed payment. */
function graceTime(view: { graceEndedAt: string | null } | undefined): string {
  if (!view?.graceEndedAt) return '';
  const then = new Date(view.graceEndedAt).getTime();
  if (Number.isNaN(then)) return '';
  return ` until ${new Date(then).toLocaleDateString()}`;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120, gap: space.md },
  who: { gap: space.xs },
  name: { color: colors.ink, fontFamily: fonts.display, fontSize: 32 },
  plan: { gap: space.xs },
  planTitle: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 13 },
  planName: { color: colors.ink, fontFamily: fonts.display, fontSize: 26 },
  planActions: { gap: space.sm },
  streak: { color: colors.inkMuted, fontFamily: fonts.ui, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: radius.tile, paddingHorizontal: space.lg, paddingVertical: space.md },
  rowLabel: { color: colors.text, fontFamily: fonts.ui, fontSize: 16 },
  rowValue: { color: colors.textMuted, fontFamily: fonts.ui, fontSize: 14 },
});
