"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';

interface Profile {
  id: string;
  name: string | null;
  primary_platform: string | null;
  niche: string | null;
  onboarding_step: string | null;
  onboarding_completed: boolean;
}

interface OnboardingContextType {
  profile: Profile | null;
  onboardingStep: string;
  loading: boolean;
  updateProfile: (partial: Partial<Profile>) => Promise<void>;
  advanceStep: (step: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, primary_platform, niche, onboarding_step, onboarding_completed')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
        setLoading(false);
        return;
      }

      if (data) {
        setProfile({
          id: data.id,
          name: data.name || null,
          primary_platform: data.primary_platform || null,
          niche: data.niche || null,
          onboarding_step: data.onboarding_step || 'welcome',
          onboarding_completed: data.onboarding_completed || false,
        });
      } else {
        // Create profile if it doesn't exist (do not include email - column may not exist)
        // Use upsert to handle race conditions
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            onboarding_step: 'welcome',
            onboarding_completed: false,
          }, {
            onConflict: 'id'
          })
          .select('id, name, primary_platform, niche, onboarding_step, onboarding_completed')
          .single();

        if (createError) {
          console.error('[OnboardingContext] Error creating profile:', createError);
          // Even if create fails, set a minimal profile to prevent infinite loading
          setProfile({
            id: user.id,
            name: null,
            primary_platform: null,
            niche: null,
            onboarding_step: 'welcome',
            onboarding_completed: false,
          });
        } else if (newProfile) {
          setProfile({
            id: newProfile.id,
            name: newProfile.name || null,
            primary_platform: newProfile.primary_platform || null,
            niche: newProfile.niche || null,
            onboarding_step: newProfile.onboarding_step || 'welcome',
            onboarding_completed: newProfile.onboarding_completed || false,
          });
        } else {
          // Fallback: set minimal profile even if upsert returns no data
          setProfile({
            id: user.id,
            name: null,
            primary_platform: null,
            niche: null,
            onboarding_step: 'welcome',
            onboarding_completed: false,
          });
        }
      }
    } catch (err) {
      console.error('Exception loading profile:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const updateProfile = useCallback(async (partial: Partial<Profile>) => {
    if (!user) return;

    // Optimistic update
    setProfile((prev) => prev ? { ...prev, ...partial } : null);

    try {
      // Ensure profile exists first (upsert pattern)
      // DO NOT include email or role - columns may not exist
      const safePartial: any = {};
      if (partial.name !== undefined) safePartial.name = partial.name;
      if (partial.primary_platform !== undefined) safePartial.primary_platform = partial.primary_platform;
      if (partial.niche !== undefined) safePartial.niche = partial.niche;
      if (partial.onboarding_step !== undefined) safePartial.onboarding_step = partial.onboarding_step;
      if (partial.onboarding_completed !== undefined) safePartial.onboarding_completed = partial.onboarding_completed;

      // Use upsert to ensure profile exists
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          ...safePartial,
        }, {
          onConflict: 'id'
        });

      if (upsertError) {
        console.error('Error upserting profile:', upsertError);
        // Revert optimistic update on error
        await loadProfile();
        throw upsertError;
      }
      
      // Reload to get latest state from DB
      await loadProfile();
    } catch (err) {
      console.error('Exception updating profile:', err);
      await loadProfile();
      throw err;
    }
  }, [user, loadProfile]);

  const advanceStep = useCallback(async (step: string) => {
    await updateProfile({ onboarding_step: step });
  }, [updateProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile();
  }, [loadProfile]);

  const onboardingStep = profile?.onboarding_step || 'welcome';

  return (
    <OnboardingContext.Provider
      value={{
        profile,
        onboardingStep,
        loading,
        updateProfile,
        advanceStep,
        refreshProfile,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

