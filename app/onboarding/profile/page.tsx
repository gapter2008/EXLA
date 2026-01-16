"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/context/OnboardingContext';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';
import { supabase } from '@/lib/supabaseClient';

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

  return (
    <OnboardingPageGuard>
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-gray-900">Tell us about yourself</h1>
              <p className="text-sm text-gray-500">We'll use this to personalize your experience</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Platform <span className="text-red-500">*</span>
                </label>
                <select
                  value={primaryPlatform}
                  onChange={(e) => setPrimaryPlatform(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
                >
                  <option value="">Select a platform</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Instagram">Instagram</option>
                  <option value="YouTube">YouTube</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

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
