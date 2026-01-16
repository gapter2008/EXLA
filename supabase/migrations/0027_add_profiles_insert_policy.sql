-- Add insert policy for profiles to support upsert operations
-- This ensures authenticated users can create their own profile if it doesn't exist

drop policy if exists "profiles self insert" on profiles;
create policy "profiles self insert" on profiles
  for insert with check (auth.uid() = id);

-- Ensure update policy allows all fields (including new niche metadata)
drop policy if exists "profiles self update" on profiles;
create policy "profiles self update" on profiles
  for update using (auth.uid() = id);

