-- ====== prerequisites (Supabase/Postgres) ======
-- Enable extensions commonly available on Supabase:
create extension if not exists "pgcrypto";   -- for gen_random_uuid()
create extension if not exists "uuid-ossp";  -- optional
-- If you plan to use vectors later, uncomment:
-- create extension if not exists "vector";

-- ====== profiles (users) ======
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text not null default 'creator' check (role in ('creator','brand')),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on profiles (email);

-- ====== tokens (oauth/provider tokens) ======
create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,                       -- 'tiktok' | 'instagram' | etc
  provider_user_id text,
  access_token text,                            -- store encrypted at app layer if needed
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_tokens_user_provider on tokens(user_id, provider);

-- ====== social_posts (ingested content) ======
create table if not exists social_posts (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('tiktok','instagram','youtube')),
  platform_post_id text not null,
  caption text,
  metrics jsonb,                                -- { views, likes, comments, shares, ... }
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  constraint uq_social_post unique (user_id, platform, platform_post_id)
);

create index if not exists idx_social_posts_user on social_posts(user_id);
create index if not exists idx_social_posts_platform on social_posts(platform);
create index if not exists idx_social_posts_fetched_at on social_posts(fetched_at desc);

-- If using embeddings later (pgvector):
-- alter table social_posts add column if not exists embedding vector(1536);

-- ====== post_analyses (OpenAI output) ======
create table if not exists post_analyses (
  id bigserial primary key,
  post_id bigint not null references social_posts(id) on delete cascade,
  summary text,
  hooks text[],                                  -- 3 short hooks
  created_at timestamptz not null default now()
);

create index if not exists idx_post_analyses_post on post_analyses(post_id);

-- ====== optional: api_usage (token/cost tracking) ======
create table if not exists api_usage (
  id bigserial primary key,
  user_id uuid references profiles(id) on delete set null,
  provider text not null,                        -- 'openai' | 'tiktok' ...
  tokens_in int default 0,
  tokens_out int default 0,
  cost_usd numeric(10,4) default 0,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_usage_user_time on api_usage(user_id, created_at desc);


