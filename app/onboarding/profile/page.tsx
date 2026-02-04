"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';
import { supabase } from '@/lib/supabaseClient';
import { goOnboardingPush } from '@/lib/safeNavigate';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChevronLeft, Check } from 'lucide-react';

export default function OnboardingProfilePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { updateProfile, advanceStep } = useOnboarding();
  const [name, setName] = useState('');
  const [primaryPlatform, setPrimaryPlatform] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If user is logged in, load their existing data
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('name, primary_platform')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.name) setName(data.name);
            if (data.primary_platform) setPrimaryPlatform(data.primary_platform);
          }
        });
    }
  }, [user]);

  const handleContinue = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!primaryPlatform) {
      setError('Please select your primary platform');
      return;
    }

    setError(null);
    setIsLoading(true);

    if (user) {
      // User is already logged in, save to profile and continue
      try {
        // Get auth token for API request
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
          throw new Error('Not authenticated');
        }

        // Use server-side API route for reliable profile updates
        const response = await fetch('/api/profile/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: name.trim(),
            primary_platform: primaryPlatform,
            onboarding_step: 'connect',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save profile');
        }

        // Update local context if available
        try {
          await updateProfile({
            name: name.trim(),
            primary_platform: primaryPlatform,
          });
          await advanceStep('connect');
        } catch (contextErr) {
          // Context update failed, but server update succeeded - continue anyway
          console.warn('Context update failed:', contextErr);
        }

        // Small delay to ensure state is synced
        await new Promise(resolve => setTimeout(resolve, 100));
        
        goOnboardingPush(router, 'connect');
      } catch (err: any) {
        console.error('Error saving profile:', err);
        setError(err.message || 'Failed to save profile. Please try again.');
        setIsLoading(false);
      }
    } else {
      // User is not logged in, save to localStorage and go to signup
      const onboardingData = {
        name: name.trim(),
        primary_platform: primaryPlatform,
      };
      localStorage.setItem('exla_onboarding', JSON.stringify(onboardingData));

      // Navigate to email signup
      router.push('/auth/email-signup');
    }
  };

  const platforms = ['YouTube', 'TikTok', 'Instagram', 'Twitch'];

  return (
    <OnboardingPageGuard>
      <div className="min-h-screen bg-white flex flex-col px-6 py-12">
        {/* Step Indicator */}
        <p className="text-[12px] text-[#64748B] uppercase tracking-[0.06em] mb-6">
          Step 2 of 3
        </p>

        <button onClick={() => router.back()} className="mb-12 flex items-center gap-2 text-[#64748B]">
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1">
          <h1 className="text-[28px] font-semibold text-[#0F172A] mb-8">
            Tell us about yourself
          </h1>
          
          <div className="space-y-8">
            <div>
              <Input
                label="Your Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                disabled={isLoading}
                helperText="This appears on your public media kit"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0F172A] mb-3">
                Primary Platform
              </label>
              <div className="grid grid-cols-2 gap-3">
                {platforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrimaryPlatform(p)}
                    disabled={isLoading}
                    className={`h-12 rounded-[12px] text-[15px] font-semibold transition-all flex items-center justify-center gap-2 ${
                      primaryPlatform === p
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-[#F8FAFC] text-[#0F172A] border border-[rgba(15,23,42,0.06)]'
                    }`}
                  >
                    {p}
                    {primaryPlatform === p && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
              {primaryPlatform && (
                <p className="text-[12px] text-[#94A3B8] mt-3">
                  We use this to personalize your matches
                </p>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <Button 
          variant="primary" 
          className="w-full" 
          onClick={handleContinue}
          isLoading={isLoading}
          disabled={!name || !primaryPlatform || isLoading}
        >
          Continue
        </Button>
      </div>
    </OnboardingPageGuard>
  );
}
