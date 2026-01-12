-- Brand recommendations table for AI-generated brand suggestions

create table if not exists brand_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  brand_name text not null,
  category text,
  why_match text,
  suggested_pitch_angle text,
  confidence int not null default 0 check (confidence >= 0 and confidence <= 100),
  status text not null default 'new' check (status in ('new', 'saved', 'ignored')),
  created_at timestamptz not null default now()
);

create index if not exists idx_brand_recommendations_user on brand_recommendations(user_id);
create index if not exists idx_brand_recommendations_status on brand_recommendations(user_id, status);
create index if not exists idx_brand_recommendations_created on brand_recommendations(created_at desc);

-- RLS Policies
alter table brand_recommendations enable row level security;

drop policy if exists "brand_recommendations_own_all" on brand_recommendations;
create policy "brand_recommendations_own_all" on brand_recommendations
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
