import { Redirect } from 'expo-router';
import { useAuth } from '../data/auth';
import { hasCompletedOnboarding } from '@bonamind/core';

// Pick the target by auth: a redirect into a screen Stack.Protected refuses is
// dropped, which would strand a signed-out launch on this empty route.
export default function Index() {
  const { status, session } = useAuth();
  if (status !== 'signed-in') return <Redirect href="/welcome" />;
  const needsOnboarding = !hasCompletedOnboarding(session?.user?.user_metadata as Record<string, unknown> | null | undefined);
  return <Redirect href={needsOnboarding ? '/onboarding' : '/today'} />;
}
