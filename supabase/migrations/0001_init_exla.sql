-- ===== extensions =====
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
-- create extension if not exists "vector";  -- optional for embeddings

-- ===== tables =====
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text not null default 'creator' check (role in ('creator','brand')),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on profiles(email);

create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,                       -- 'tiktok' | 'instagram' | 'youtube'
  provider_user_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists social_posts (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('tiktok','instagram','youtube')),
  platform_post_id text not null,
  caption text,
  metrics jsonb,
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  constraint uq_social_post unique (user_id, platform, platform_post_id)
);

create index if not exists idx_social_posts_user on social_posts(user_id);
create index if not exists idx_social_posts_platform on social_posts(platform);
create index if not exists idx_social_posts_fetched_at on social_posts(fetched_at desc);

create table if not exists post_analyses (
  id bigserial primary key,
  post_id bigint not null references social_posts(id) on delete cascade,
  summary text,
  hooks text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_post_analyses_post on post_analyses(post_id);

create table if not exists api_usage (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  provider text not null,                        -- 'openai' | 'tiktok' | ...
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd numeric(10,4) default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_user_time on api_usage(user_id, created_at desc);

-- ===== RLS =====
alter table profiles enable row level security;
alter table tokens enable row level security;
alter table social_posts enable row level security;
alter table post_analyses enable row level security;
alter table api_usage enable row level security;

-- Policies:
-- Profiles: users can read their own profile; service role can do all.
drop policy if exists "profiles self read" on profiles;
create policy "profiles self read" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update using (auth.uid() = id);

-- Tokens: only owner can select/insert/update/delete
drop policy if exists "tokens owner all" on tokens;
create policy "tokens owner all" on tokens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Social posts: only owner can read/write their posts
drop policy if exists "social_posts owner all" on social_posts;
create policy "social_posts owner all" on social_posts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Post analyses: only owner can read/write via joined post ownership
drop policy if exists "post_analyses owner all" on post_analyses;
create policy "post_analyses owner all" on post_analyses
  for all using (
    exists (select 1 from social_posts sp where sp.id = post_id and sp.user_id = auth.uid())
  )
  with check (
    exists (select 1 from social_posts sp where sp.id = post_id and sp.user_id = auth.uid())
  );

-- API usage: user can read their own rows; inserts allowed from server via service role
drop policy if exists "api_usage self read" on api_usage;
create policy "api_usage self read" on api_usage
  for select using (auth.uid() = user_id);

-- Grant service role full access (handled via service key in server code).


