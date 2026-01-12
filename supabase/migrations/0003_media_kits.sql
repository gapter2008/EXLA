-- Media kits table for storing generated media kit data

create table if not exists media_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kit jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create index if not exists idx_media_kits_user on media_kits(user_id);
create index if not exists idx_media_kits_updated on media_kits(updated_at);

-- RLS Policies
alter table media_kits enable row level security;

drop policy if exists "media_kits_own_all" on media_kits;
create policy "media_kits_own_all" on media_kits
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

