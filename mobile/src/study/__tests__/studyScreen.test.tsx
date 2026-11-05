import type { Card } from '@bonamind/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StudyScreen } from '../StudyScreen';

const baseCards: Card[] = [
  { id: 'c1', deckId: 'bio', front: 'First question', back: 'A', nextReview: 0 },
  { id: 'c2', deckId: 'bio', front: 'Second question', back: 'B', nextReview: 0 },
];
let mockCards: Card[] = baseCards;
let mockDecks: { id: string; title: string }[] = [{ id: 'bio', title: 'Biology' }];

const NOW = new Date(2026, 0, 5, 12, 0, 0).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const due = (id: string, front: string): Card => ({ id, deckId: 'bio', front, back: 'x', nextReview: NOW - 1_000, lastReviewed: 0 });
const fsrs = (elapsedDays: number, stabilityDays: number): Card['fsrsState'] => ({
  stability: stabilityDays,
  difficulty: 5,
  elapsedDays,
  scheduledDays: stabilityDays,
  repetitions: 3,
  lapses: 0,
  lastReview: NOW - elapsedDays * DAY_MS,
});
const day = 33;
const spark: Card = {
  id: 'spark1', deckId: 'wc', front: 'Capital question', back: 'Bern', nextReview: NOW + DAY_MS, lastReviewed: NOW - day * DAY_MS, fsrsState: fsrs(day, 10),
};
const fetched = (data: unknown) => ({ data, isFetchedAfterMount: true, isError: false });

// The local save never settles: on a phone a slow (or failing) SQLite write
// held the next card back, so a swipe looked like it did nothing.
const mockEnqueueReview = jest.fn(() => new Promise<void>(() => {}));

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ deckId: 'bio' }) }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('../../data/hooks', () => ({
  useCards: () => fetched(mockCards),
  useFsrsProfile: () => fetched({ profileLabel: null }),
  useSessions: () => fetched([]),
  useDecks: () => fetched(mockDecks),
}));
jest.mock('../../data/sync', () => ({ useSync: () => ({ online: true }), getSyncEngine: () => ({ notifyEnqueued: jest.fn() }) }));
jest.mock('../../data/app', () => ({ getOutbox: () => ({ enqueueReview: mockEnqueueReview, enqueueSession: jest.fn(async () => {}) }) }));
jest.mock('../useCloseOnLeave', () => ({ useCloseOnLeave: () => {} }));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('../../design/components/Confetti', () => ({ Confetti: () => null }));
jest.mock('../../design/components/LoadingScreen', () => ({ LoadingScreen: () => null }));
jest.mock('../../design/components/AuroraBackground', () => ({ auroraWarmth: { set: jest.fn() } }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('../CardStack', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CardStack: ({ card, onRate }: { card: Card | null; onRate(r: number): void }) => (
      <Pressable accessibilityRole="button" onPress={() => onRate(require('@bonamind/core').Rating.GOOD)}><Text>{card?.front ?? 'no card'}</Text></Pressable>
    ),
  };
});

it('shows the next card as soon as a card is rated, without waiting for the save', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><StudyScreen /></QueryClientProvider>);
  expect(screen.getByText('First question')).toBeTruthy();
  await fireEvent.press(screen.getByText('First question'));
  expect(mockEnqueueReview).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Second question')).toBeTruthy();
});

it('labels a resurfaced spark card with its own deck', async () => {
  mockCards = [...Array(6)].map((_, i) => due(`d${i}`, `Question ${i}`));
  mockCards.push(spark);
  mockDecks = [{ id: 'bio', title: 'Biology' }, { id: 'wc', title: 'World Capitals' }];
  jest.useFakeTimers({ now: NOW });
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><StudyScreen /></QueryClientProvider>);
  expect(screen.getByText('Biology · 7 left')).toBeTruthy();
  await fireEvent.press(screen.getByText('Question 0'));
  expect(screen.getByText('Biology · 6 left')).toBeTruthy();
  await fireEvent.press(screen.getByText('Question 1'));
  expect(screen.getByText('Spark · World Capitals · 5 left')).toBeTruthy();
  jest.useRealTimers();
});
