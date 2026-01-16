"use client";

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: onboardingLoading } = useOnboarding();

  useEffect(() => {
    // Don't redirect if still loading or not authenticated
    if (authLoading || onboardingLoading || !user) {
      return;
    }

    // Allow access to onboarding routes
    if (pathname?.startsWith('/onboarding')) {
      return;
    }

    // Allow access to auth routes
    if (pathname?.startsWith('/auth')) {
      return;
    }

    // Allow access to API routes
    if (pathname?.startsWith('/api')) {
      return;
    }

    // CRITICAL: If profile doesn't exist yet, wait for OnboardingContext to create it
    // Don't redirect until profile is loaded
    if (!profile) {
      return;
    }

    // If onboarding is completed, allow access to main app
    if (profile.onboarding_completed === true) {
      return; // User can access main app
    }

    // If onboarding is not completed, redirect to onboarding
    // Only redirect if onboarding_completed is explicitly false or null
    const step = profile.onboarding_step || 'welcome';
    // Map step to valid route
    const validSteps = ['welcome', 'profile', 'connect', 'scanning', 'complete'];
    const safeStep = validSteps.includes(step) ? step : 'welcome';
    router.replace(`/onboarding/${safeStep}`);
  }, [user, profile, authLoading, onboardingLoading, pathname, router]);

  // Always render children for logged-out users (they need to see landing screen)
  if (!user) {
    return <>{children}</>;
  }

  // Show loading state while checking (prevents flash) - but only for logged-in users
  if (authLoading || onboardingLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // CRITICAL: If profile doesn't exist yet, wait for OnboardingContext to create it
  // Show loading while profile is being created
  // But don't wait forever - if loading is done and no profile, allow rendering
  // (OnboardingContext will set a fallback profile on error)
  if (user && !profile && onboardingLoading) {
    // Still loading profile
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Setting up your profile...</p>
        </div>
      </div>
    );
  }
  
  // If loading is done but no profile, OnboardingContext should have set a fallback
  // Allow rendering to proceed (children will handle the state)
  if (user && !profile && !onboardingLoading) {
    // Profile creation may have failed, but allow rendering to proceed
    // The app should handle missing profile gracefully
    console.warn('[OnboardingGuard] User authenticated but no profile found after loading');
  }

  // If user is authenticated and onboarding not completed, and not on onboarding route, show loading
  // The redirect will happen in useEffect
  if (user && profile && profile.onboarding_completed !== true && !pathname?.startsWith('/onboarding') && !pathname?.startsWith('/auth')) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

