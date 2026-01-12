-- Media kit view tracking table
create table if not exists media_kit_views (
  id uuid primary key default gen_random_uuid(),
  kit_user_id uuid not null references profiles(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_media_kit_views_kit_user on media_kit_views(kit_user_id, viewed_at desc);
create index if not exists idx_media_kit_views_viewer on media_kit_views(viewer_id);

-- RLS Policies
alter table media_kit_views enable row level security;

drop policy if exists "media_kit_views_insert_all" on media_kit_views;
create policy "media_kit_views_insert_all" on media_kit_views
  for insert with check (true); -- Anyone can insert (for public share links)

drop policy if exists "media_kit_views_select_own" on media_kit_views;
create policy "media_kit_views_select_own" on media_kit_views
  for select using (auth.uid() = kit_user_id); -- Users can see views of their own kit

