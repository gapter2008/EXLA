"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';
import { goOnboarding } from '@/lib/safeNavigate';

export function OnboardingPageGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: onboardingLoading } = useOnboarding();

  useEffect(() => {
    // Don't redirect if still loading
    if (authLoading || onboardingLoading) {
      return;
    }

    // If user is not logged in, allow access (for public onboarding steps)
    // This allows users to go through onboarding before signing up
    if (!user) {
      return;
    }

    // CRITICAL: If onboarding is completed, redirect to home immediately
    // This prevents users from seeing onboarding pages after completion
    if (profile?.onboarding_completed === true) {
      if (pathname?.startsWith('/onboarding')) {
        router.replace('/');
        return;
      }
      return;
    }

    // If user is logged in but not on the correct onboarding step, redirect them
    // But only if we have a profile loaded (avoid redirecting before profile is created)
    if (user && profile) {
      const expectedStep = profile.onboarding_step || 'welcome';
      const currentPathSegment = pathname?.split('/').pop();

      // Map step names to path segments
      const stepMap: Record<string, string> = {
        'welcome': 'welcome',
        'profile': 'profile',
        'connect': 'connect',
        'scanning': 'scanning',
        'complete': 'complete',
      };

      const expectedPathSegment = stepMap[expectedStep] || 'welcome';

      // If not on the expected step, redirect
      // But allow some flexibility - if user just signed up, they might be on welcome
      // even if step is 'connect' (race condition)
      if (currentPathSegment !== expectedPathSegment && expectedStep !== 'welcome') {
        // Only redirect if we're sure about the step (not welcome, which is the default)
        goOnboarding(router, expectedPathSegment);
      }
    }
  }, [user, profile, authLoading, onboardingLoading, pathname, router]);

  // Show nothing while checking (prevents flash) - but only for logged-in users
  if (authLoading || (user && onboardingLoading)) {
    return null;
  }

  return <>{children}</>;
}

