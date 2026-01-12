-- Creator profiles table for storing personalized creator data

create table if not exists creator_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  size_tier text not null check (size_tier in ('nano', 'micro', 'mid', 'large')),
  primary_topics text[] not null default '{}',
  keywords text[] not null default '{}',
  summary text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_profiles_user on creator_profiles(user_id);
create index if not exists idx_creator_profiles_topics on creator_profiles using gin(primary_topics);
create index if not exists idx_creator_profiles_keywords on creator_profiles using gin(keywords);

-- RLS Policies
alter table creator_profiles enable row level security;

drop policy if exists "creator_profiles_own_all" on creator_profiles;
create policy "creator_profiles_own_all" on creator_profiles
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

