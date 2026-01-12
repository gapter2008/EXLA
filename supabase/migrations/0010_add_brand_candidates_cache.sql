-- Cache table for brand candidates to avoid expensive SerpAPI calls on regeneration
create table if not exists cache_brand_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  topics_hash text not null,
  candidates jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id, topics_hash)
);

create index if not exists idx_cache_brand_candidates_user_hash on cache_brand_candidates(user_id, topics_hash);
create index if not exists idx_cache_brand_candidates_created_at on cache_brand_candidates(created_at);

-- RLS Policies
alter table cache_brand_candidates enable row level security;

drop policy if exists "cache_brand_candidates_own_all" on cache_brand_candidates;
create policy "cache_brand_candidates_own_all" on cache_brand_candidates
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

