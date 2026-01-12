-- Enforce user isolation for all personalization data tables
-- This migration adds unique constraints and ensures proper user scoping

-- social_accounts: already has unique(user_id, platform) - verify it exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'social_accounts_user_id_platform_key'
  ) then
    alter table social_accounts
      add constraint social_accounts_user_id_platform_key unique(user_id, platform);
  end if;
end $$;

-- creator_metrics: already has unique(user_id, platform) - verify it exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'creator_metrics_user_id_platform_key'
  ) then
    alter table creator_metrics
      add constraint creator_metrics_user_id_platform_key unique(user_id, platform);
  end if;
end $$;

-- creator_profiles: ensure unique(user_id) - one profile per user
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'creator_profiles_user_id_key'
  ) then
    alter table creator_profiles
      add constraint creator_profiles_user_id_key unique(user_id);
  end if;
end $$;

-- brand_recommendations: ensure user_id is always set and unique per user
-- Note: Multiple recommendations per user are allowed, but they must all have user_id
-- Add check constraint to ensure user_id is never null
alter table brand_recommendations
  alter column user_id set not null;

-- cache_brand_candidates: ensure unique(user_id, topics_hash) exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'cache_brand_candidates_user_id_topics_hash_key'
  ) then
    alter table cache_brand_candidates
      add constraint cache_brand_candidates_user_id_topics_hash_key unique(user_id, topics_hash);
  end if;
end $$;

-- Add indexes for better query performance with user_id filters
create index if not exists idx_brand_recommendations_user_created 
  on brand_recommendations(user_id, created_at desc);

create index if not exists idx_brand_recommendations_user_status 
  on brand_recommendations(user_id, status);

-- Add comment explaining the isolation strategy
comment on table brand_recommendations is 
  'Brand recommendations are isolated per user_id. All queries must filter by user_id. Never query without user_id filter.';

comment on table creator_profiles is 
  'Creator profiles are isolated per user_id. One profile per user. All queries must filter by user_id.';

comment on table creator_metrics is 
  'Creator metrics are isolated per (user_id, platform). All queries must filter by user_id.';

comment on table cache_brand_candidates is 
  'Brand candidate cache is isolated per (user_id, topics_hash). All queries must filter by user_id.';

