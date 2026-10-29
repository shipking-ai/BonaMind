const ONBOARDING_ROLE_VALUES = ['learner', 'student', 'teacher', 'doctor', 'professional', 'researcher'];
const INTERNAL_ROLE_VALUES = ['owner', 'ceo', 'admin', 'employee', 'tester'];

export function hasCompletedOnboarding(userMetadata: Record<string, unknown> | undefined | null): boolean {
  if (!userMetadata) return false;
  if (userMetadata.onboarding_completed === true) return true;
  const existingRole = userMetadata.role;
  if (typeof existingRole !== 'string') return false;
  return (ONBOARDING_ROLE_VALUES as string[]).includes(existingRole) || (INTERNAL_ROLE_VALUES as string[]).includes(existingRole);
}

export { ONBOARDING_ROLE_VALUES, INTERNAL_ROLE_VALUES };
