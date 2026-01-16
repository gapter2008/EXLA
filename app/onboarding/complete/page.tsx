"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/context/OnboardingContext';
import { supabase } from '@/lib/supabaseClient';
import { FileText, Users, TrendingUp, DollarSign } from 'lucide-react';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { profile, updateProfile } = useOnboarding();
  const [buttonLoading, setButtonLoading] = useState(false);
  const [stats, setStats] = useState<{
    followers: number | null;
    niche: string | null;
    rateRange: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      try {
        // Get creator stats from social_accounts
        const { data: socialAccounts } = await supabase
          .from('social_accounts')
          .select('followers, niche')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get niche from creator profile or social account
        const { data: creatorProfile } = await supabase
          .from('creators')
          .select('niche')
          .eq('user_id', profile.id)
          .maybeSingle();

        const niche = creatorProfile?.niche || socialAccounts?.niche || profile.niche || 'General';

        // Calculate rate range based on followers (rough estimate)
        const followers = socialAccounts?.followers || 0;
        let rateRange = 'N/A';
        if (followers > 0) {
          if (followers < 10000) {
            rateRange = '$50 - $200';
          } else if (followers < 100000) {
            rateRange = '$200 - $1,000';
          } else if (followers < 1000000) {
            rateRange = '$1,000 - $5,000';
          } else {
            rateRange = '$5,000+';
          }
        }

        setStats({
          followers: socialAccounts?.followers || null,
          niche,
          rateRange,
        });
      } catch (err) {
        console.error('Error loading stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [profile]);

  const handleViewMediaKit = async () => {
    setButtonLoading(true);
    try {
      // Mark onboarding as completed - CRITICAL: set onboarding_completed = true
      // Use direct Supabase call to ensure it's saved
      const { error } = await supabase
        .from('profiles')
        .update({ 
          onboarding_completed: true,
          onboarding_step: null,
        })
        .eq('id', profile?.id);
      
      if (error) {
        console.error('Failed to mark onboarding complete:', error);
        // Also try via context
        await updateProfile({ 
          onboarding_completed: true,
          onboarding_step: null,
        });
      } else {
        // Update context state
        await updateProfile({ 
          onboarding_completed: true,
          onboarding_step: null,
        });
      }
      
      // Navigate to home
      router.replace('/');
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setButtonLoading(false);
      alert('Failed to complete onboarding. Please try again.');
    }
  };

  return (
    <OnboardingPageGuard>
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-6 pb-28">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                <FileText size={40} className="text-green-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">You're all set!</h1>
              <p className="text-gray-600">
                Your brand-ready profile is ready to share
              </p>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-600 text-sm">Loading your stats...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {stats && stats.followers !== null && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Users size={18} />
                        <span className="text-sm font-medium">Followers</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {stats.followers.toLocaleString()}
                      </span>
                    </div>
                  )}

                  {stats && stats.niche && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <TrendingUp size={18} />
                        <span className="text-sm font-medium">Niche</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {stats.niche}
                      </span>
                    </div>
                  )}

                  {stats && stats.rateRange && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-700">
                        <DollarSign size={18} />
                        <span className="text-sm font-medium">Rate Range</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {stats.rateRange}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleViewMediaKit}
                  disabled={buttonLoading}
                  className="w-full px-5 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:from-indigo-700 hover:to-purple-700 transition-transform duration-150 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buttonLoading ? 'Loading...' : 'View Full Media Kit'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </OnboardingPageGuard>
  );
}

