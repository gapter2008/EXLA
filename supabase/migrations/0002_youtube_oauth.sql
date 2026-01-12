-- YouTube OAuth and scanning tables

-- social_accounts: stores OAuth tokens for connected platforms
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  platform_user_id text not null,
  handle text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, platform)
);

create index if not exists idx_social_accounts_user on social_accounts(user_id);
create index if not exists idx_social_accounts_platform on social_accounts(platform);

-- scan_jobs: tracks scanning progress
create table if not exists scan_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  status text not null check (status in ('queued', 'running', 'complete', 'failed')) default 'queued',
  progress int not null default 0 check (progress >= 0 and progress <= 100),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scan_jobs_user on scan_jobs(user_id);
create index if not exists idx_scan_jobs_status on scan_jobs(status);
create index if not exists idx_scan_jobs_user_platform on scan_jobs(user_id, platform);

-- creator_metrics: stores computed metrics from scans
create table if not exists creator_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  followers int,
  total_views bigint,
  video_count int,
  avg_views_10 numeric,
  engagement_rate_10 numeric,
  top_videos jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, platform)
);

create index if not exists idx_creator_metrics_user on creator_metrics(user_id);
create index if not exists idx_creator_metrics_platform on creator_metrics(platform);

-- RLS Policies

alter table social_accounts enable row level security;
alter table scan_jobs enable row level security;
alter table creator_metrics enable row level security;

-- social_accounts: users can only access their own accounts
drop policy if exists "social_accounts_own_all" on social_accounts;
create policy "social_accounts_own_all" on social_accounts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- scan_jobs: users can only access their own scan jobs
drop policy if exists "scan_jobs_own_all" on scan_jobs;
create policy "scan_jobs_own_all" on scan_jobs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- creator_metrics: users can only access their own metrics
drop policy if exists "creator_metrics_own_all" on creator_metrics;
create policy "creator_metrics_own_all" on creator_metrics
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

