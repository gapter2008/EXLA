-- OAuth states table for persisting PKCE verifier and state across redirects
-- This ensures OAuth flows work reliably on Vercel where cookies may not persist

create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, -- nullable if unauthenticated
  provider text not null default 'tiktok',
  state text not null unique,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- Indexes for fast lookups
create index if not exists idx_oauth_states_provider_state on oauth_states(provider, state);
create index if not exists idx_oauth_states_expires_at on oauth_states(expires_at);
create index if not exists idx_oauth_states_user_provider on oauth_states(user_id, provider) where user_id is not null;

-- RLS: Service role has full access (used in server routes)
-- Client-side access not needed for this table
alter table oauth_states enable row level security;

-- Policy: Service role can do everything (bypasses RLS when using service key)
-- No explicit policy needed - service role bypasses RLS automatically

-- Cleanup function: Delete expired states (can be run periodically)
create or replace function cleanup_expired_oauth_states()
returns void
language sql
security definer
as $$
  delete from oauth_states where expires_at < now();
$$;

