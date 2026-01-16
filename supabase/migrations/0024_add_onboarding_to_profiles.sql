-- Add onboarding columns to profiles table
-- This enables the onboarding flow to track progress and store creator data

alter table profiles
  add column if not exists primary_platform text,
  add column if not exists niche text,
  add column if not exists onboarding_step text default 'welcome',
  add column if not exists onboarding_completed boolean default false;

-- Add index for onboarding queries
create index if not exists idx_profiles_onboarding on profiles(onboarding_completed, onboarding_step) 
  where onboarding_completed = false;

-- Add comment for clarity
comment on column profiles.primary_platform is 'Primary platform: TikTok, Instagram, YouTube';
comment on column profiles.niche is 'Creator niche/category';
comment on column profiles.onboarding_step is 'Current onboarding step: welcome, profile, connect, scanning, complete';
comment on column profiles.onboarding_completed is 'Whether onboarding has been completed';

