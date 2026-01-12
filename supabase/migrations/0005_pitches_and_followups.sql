-- Pitches and followups tables for pitch tracking

-- Pitches table
create table if not exists pitches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  brand_name text not null,
  brand_website text,
  channel text not null check (channel in ('email','dm')),
  subject text,
  body text not null,
  suggested_rate int,
  deliverable text,
  status text not null default 'draft' check (status in ('draft','sent','replied','closed','ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pitches_user on pitches(user_id);
create index if not exists idx_pitches_status on pitches(user_id, status);
create index if not exists idx_pitches_updated on pitches(updated_at desc);

-- Followups table
create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pitch_id uuid not null references pitches(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_followups_user on followups(user_id);
create index if not exists idx_followups_pitch on followups(pitch_id);
create index if not exists idx_followups_due on followups(user_id, status, due_at);

-- RLS Policies for pitches
alter table pitches enable row level security;

drop policy if exists "pitches_own_all" on pitches;
create policy "pitches_own_all" on pitches
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- RLS Policies for followups
alter table followups enable row level security;

drop policy if exists "followups_own_all" on followups;
create policy "followups_own_all" on followups
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

