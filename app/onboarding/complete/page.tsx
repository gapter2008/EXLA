"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/context/OnboardingContext';
import { supabase } from '@/lib/supabaseClient';
import { CheckCircle2 } from 'lucide-react';
import { OnboardingPageGuard } from '@/components/OnboardingPageGuard';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center max-w-[320px]">
          {/* Success Icon */}
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-8">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          
          {/* Title */}
          <h1 className="text-[28px] font-semibold text-[#0F172A] mb-3 text-center">
            Your media kit is ready
          </h1>
          
          {/* Subtitle */}
          <p className="text-[15px] text-[#64748B] text-center mb-12">
            Brands can now discover and contact you
          </p>

          {/* Primary CTA */}
          <Button 
            variant="primary" 
            className="w-full mb-4" 
            onClick={handleViewMediaKit}
            isLoading={buttonLoading}
            disabled={buttonLoading}
          >
            View my media kit
          </Button>
          
          {/* Helper text */}
          <p className="text-[12px] text-[#94A3B8] text-center">
            You can update this anytime
          </p>
        </div>
      </div>
    </OnboardingPageGuard>
  );
}

