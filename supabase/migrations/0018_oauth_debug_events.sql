-- OAuth Debug Events Table
-- Temporary table for debugging OAuth flows (can be dropped after fixing issues)

CREATE TABLE IF NOT EXISTS oauth_debug_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL CHECK (provider IN ('tiktok', 'youtube', 'instagram')),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  step text NOT NULL CHECK (step IN ('start', 'callback', 'exchange', 'store', 'redirect')),
  status text NOT NULL CHECK (status IN ('ok', 'fail')),
  message text,
  meta jsonb
);

CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_request_id ON oauth_debug_events(request_id);
CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_provider ON oauth_debug_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_debug_events_user_id ON oauth_debug_events(user_id, created_at DESC);

-- Allow service role to insert (used by API routes)
-- Users can view their own events for debugging
ALTER TABLE oauth_debug_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oauth_debug_events_service_all" ON oauth_debug_events;
CREATE POLICY "oauth_debug_events_service_all" ON oauth_debug_events
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE oauth_debug_events IS 'Temporary debug logging for OAuth flows. Can be cleaned up periodically.';
COMMENT ON COLUMN oauth_debug_events.request_id IS 'Unique request identifier for tracking a single OAuth flow';
COMMENT ON COLUMN oauth_debug_events.step IS 'OAuth flow step: start, callback, exchange, store, redirect';
COMMENT ON COLUMN oauth_debug_events.meta IS 'Safe debug metadata (no secrets): redirect_uri, state_prefix, has_code, error, http_status';

