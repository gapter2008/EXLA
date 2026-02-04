"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { goOnboardingPush } from '@/lib/safeNavigate';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';

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
    goOnboardingPush(router, 'profile');
  };

  return (
    <OnboardingPageGuard>
      <div className="min-h-screen bg-white flex flex-col px-6 py-16">
        {/* Step Indicator */}
        <p className="text-[12px] text-[#64748B] uppercase tracking-[0.06em] mb-8">
          Step 1 of 3
        </p>

        <img 
          src="/brand/logo.png" 
          alt="Exla" 
          className="w-16 h-16 mb-16"
        />
        
        <div className="flex-1">
          <h1 className="text-[28px] font-semibold text-[#0F172A] mb-3">
            Let's get you set up
          </h1>
          
          <p className="text-[15px] text-[#64748B] mb-2">
            This takes under a minute
          </p>
          
          <p className="text-[13px] text-[#94A3B8]">
            Most creators finish in under 60 seconds
          </p>
        </div>

        <Button 
          variant="primary" 
          className="w-full" 
          onClick={handleContinue}
          isLoading={isLoading}
          disabled={isLoading}
        >
          Continue
        </Button>
      </div>
    </OnboardingPageGuard>
  );
}
