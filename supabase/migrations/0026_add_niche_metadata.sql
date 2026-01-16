-- Add niche metadata columns to profiles table
-- This enables intentional niche storage with confidence and source tracking

alter table profiles
  add column if not exists niche_confidence numeric default null,
  add column if not exists niche_source text default null check (niche_source in ('inferred', 'user', null));

comment on column profiles.niche_confidence is 'Confidence score (0-100) for inferred niche';
comment on column profiles.niche_source is 'Source of niche: inferred (auto-detected) or user (manually set)';

