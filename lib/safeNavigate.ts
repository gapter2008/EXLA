/**
 * Safe navigation helper for onboarding routes
 * Uses type assertion to bypass Next.js typed routes strict checking
 * This is the single escape hatch for onboarding navigation
 */
export function goOnboarding(
  router: { push: any; replace: any } | any,
  step: string,
  query?: string
) {
  const path = query ? `/onboarding/${step}?${query}` : `/onboarding/${step}`;
  (router as any).replace(path as any);
}

/**
 * Safe push helper for onboarding routes (for navigation that should be in history)
 */
export function goOnboardingPush(
  router: { push: any; replace: any } | any,
  step: string,
  query?: string
) {
  const path = query ? `/onboarding/${step}?${query}` : `/onboarding/${step}`;
  (router as any).push(path as any);
}

