-- Add scan lifecycle fields to social_accounts (canonical "connected account" table)
-- This tracks the scan state per (user_id, platform) without duplicating data

alter table social_accounts
  add column if not exists scan_status text check (scan_status in ('connected', 'scanning', 'scanned', 'failed')),
  add column if not exists scanned_at timestamptz,
  add column if not exists scan_version int default 1;

-- Add index for querying scan status
create index if not exists idx_social_accounts_scan_status on social_accounts(user_id, scan_status) where scan_status is not null;

-- Add niche_json to creators table for structured niche data
alter table creators
  add column if not exists niche_json jsonb;

-- Add index for niche_json queries
create index if not exists idx_creators_niche_json on creators using gin(niche_json) where niche_json is not null;

-- Update comment to document scan lifecycle
comment on column social_accounts.scan_status is 'Scan lifecycle state: connected (OAuth done, scan pending), scanning (scan in progress), scanned (scan complete), failed (scan failed)';
comment on column social_accounts.scanned_at is 'Timestamp when scan completed successfully';
comment on column social_accounts.scan_version is 'Incremented on each rescan to invalidate stale matches';
comment on column creators.niche_json is 'Structured niche data: {primary: string, secondary: string[], confidence: number, keywords: string[]}';


