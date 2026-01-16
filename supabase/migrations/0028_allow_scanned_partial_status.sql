-- Allow 'scanned_partial' as a valid scan_status value
-- This represents a scan that completed with partial data (e.g., missing stats or videos due to insufficient OAuth scopes)

alter table social_accounts
  drop constraint if exists social_accounts_scan_status_check,
  add constraint social_accounts_scan_status_check check (scan_status in ('connected', 'scanning', 'scanned', 'scanned_partial', 'failed'));

-- Update comment to document scanned_partial status
comment on column social_accounts.scan_status is 'Scan lifecycle state: connected (OAuth done, scan pending), scanning (scan in progress), scanned (scan complete with full data), scanned_partial (scan complete with partial data due to missing scopes), failed (scan failed)';

