"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { advanceStep } = useOnboarding();
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async () => {
    setIsLoading(true);
    
    // If user is logged in, update their onboarding step
    if (user) {
      try {
        await advanceStep('profile');
      } catch (err) {
        console.error('Error advancing step:', err);
        // Continue anyway
      }
    }
    
    // Navigate to profile step
    router.push('/onboarding/profile');
  };

  return (
    <OnboardingPageGuard>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 flex items-center justify-center overflow-hidden">
          <div className="w-full max-w-sm px-6 pb-28 text-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                  Let's get you set up
                </h1>
                <p className="text-base text-gray-500 font-normal">
                  Create a brand-ready profile in minutes
                </p>
              </div>

              <button
                onClick={handleContinue}
                disabled={isLoading}
                className="w-full px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-transform duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Loading...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OnboardingPageGuard>
  );
}
