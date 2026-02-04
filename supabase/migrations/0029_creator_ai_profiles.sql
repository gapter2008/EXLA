-- AI-analyzed creator profile (niche, themes, headline, brand fit, etc.)
-- One row per user; upserted on each analysis run.

create table if not exists creator_ai_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  primary_platform text check (primary_platform in ('youtube', 'tiktok', 'instagram')),
  headline text,
  bio text,
  niches text[] not null default '{}',
  themes text[] not null default '{}',
  content_formats text[] not null default '{}',
  style_descriptors text[] not null default '{}',
  audience_summary text,
  brand_fit jsonb default '[]',
  suggested_collab_types text[] not null default '{}',
  confidence numeric check (confidence >= 0 and confidence <= 1),
  evidence jsonb default '{}',
  last_analysis_status text,
  last_analysis_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_ai_profiles_user on creator_ai_profiles(user_id);
create index if not exists idx_creator_ai_profiles_updated on creator_ai_profiles(updated_at desc);

comment on table creator_ai_profiles is 'AI-generated creator profile: headline, niches, themes, brand fit. One per user, updated by analyze-creator-profile.';
comment on column creator_ai_profiles.brand_fit is 'Array of { category, reasoning } objects.';
comment on column creator_ai_profiles.evidence is 'Examples used: top_video_titles, keywords, stats.';
comment on column creator_ai_profiles.last_analysis_status is 'ok | partial | failed';
comment on column creator_ai_profiles.last_analysis_error is 'Error message if analysis failed.';

-- RLS
alter table creator_ai_profiles enable row level security;

drop policy if exists "creator_ai_profiles_own_all" on creator_ai_profiles;
create policy "creator_ai_profiles_own_all" on creator_ai_profiles
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
