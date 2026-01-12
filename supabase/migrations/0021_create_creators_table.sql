-- Create creators table for storing creator profile data (niche, platforms, audience_size)
-- This table is separate from creator_profiles which stores AI-generated topics/keywords

create table if not exists creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  niche text,
  platforms text[], -- Array of platform names like ['youtube', 'tiktok']
  audience_size numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creators_user_id on creators(user_id);
create index if not exists idx_creators_niche on creators(niche) where niche is not null;

-- RLS Policies
alter table creators enable row level security;

drop policy if exists "creators_own_all" on creators;
create policy "creators_own_all" on creators
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

