"use client";

import { useRouter } from 'next/navigation';
import { goOnboardingPush } from '@/lib/safeNavigate';
import { useOnboarding } from '@/context/OnboardingContext';
import { useState } from 'react';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';

export default function OnboardingConnectPage() {
  const router = useRouter();
  const { advanceStep, profile } = useOnboarding();
  const [connecting, setConnecting] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  const handleConnectTikTok = async () => {
    setConnecting(true);
    try {
      // Start TikTok OAuth
      window.location.href = '/api/oauth/tiktok/start';
    } catch (err) {
      console.error('Error starting TikTok OAuth:', err);
      setConnecting(false);
    }
  };

  const handleSkip = async () => {
    setSkipLoading(true);
    await advanceStep('complete');
    goOnboardingPush(router, 'complete');
  };

  const primaryPlatform = profile?.primary_platform?.toLowerCase() || 'tiktok';

  return (
    <OnboardingPageGuard>
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-bold text-gray-900">Connect your account</h1>
              <p className="text-sm text-gray-500">
                Connect your {profile?.primary_platform || 'social media'} account to unlock personalized brand matches
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleConnectTikTok}
                disabled={connecting}
                className="w-full px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-transform duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting...' : `Connect ${profile?.primary_platform || 'TikTok'}`}
              </button>

              <button
                onClick={handleSkip}
                disabled={skipLoading}
                className="w-full px-5 py-3.5 bg-white border-2 border-gray-200 text-gray-900 font-semibold rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-transform duration-150 active:scale-[0.99] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {skipLoading ? 'Loading...' : 'Skip for now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </OnboardingPageGuard>
  );
}

