-- Add niche_locked column to profiles table
-- This prevents auto-updating niche if user has manually edited it

alter table profiles
  add column if not exists niche_locked boolean default false;

comment on column profiles.niche_locked is 'If true, niche should not be auto-updated by inference';

