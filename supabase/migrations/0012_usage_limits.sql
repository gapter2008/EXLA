-- Usage limits tracking for pro gating
create table if not exists usage_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  matches_generated int not null default 0,
  pitches_generated int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

create index if not exists idx_usage_limits_user_date on usage_limits(user_id, date desc);

-- RLS Policies
alter table usage_limits enable row level security;

drop policy if exists "usage_limits_own_all" on usage_limits;
create policy "usage_limits_own_all" on usage_limits
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

