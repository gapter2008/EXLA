import { AppRouterInstance } from "next/navigation";

/**
 * Safe navigation helper for onboarding routes
 * Uses type assertion to bypass Next.js typed routes strict checking
 * This is the single escape hatch for onboarding navigation
 */
export function goOnboarding(
  router: AppRouterInstance,
  step: string,
  query?: string
) {
  const path = query ? `/onboarding/${step}?${query}` : `/onboarding/${step}`;
  router.replace(path as any);
}

/**
 * Safe push helper for onboarding routes (for navigation that should be in history)
 */
export function goOnboardingPush(
  router: AppRouterInstance,
  step: string,
  query?: string
) {
  const path = query ? `/onboarding/${step}?${query}` : `/onboarding/${step}`;
  router.push(path as any);
}

