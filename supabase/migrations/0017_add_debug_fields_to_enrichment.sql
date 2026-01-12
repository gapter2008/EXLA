-- Add debug and error tracking fields to enrichment tables

-- Add debug fields to contact_enrichment_jobs
ALTER TABLE contact_enrichment_jobs
ADD COLUMN IF NOT EXISTS debug_json jsonb,
ADD COLUMN IF NOT EXISTS last_error_step text CHECK (last_error_step IN ('search', 'select_domain', 'fetch', 'extract', 'save', 'openai', NULL)),
ADD COLUMN IF NOT EXISTS last_http_status int;

-- Add debug fields to brand_contacts
ALTER TABLE brand_contacts
ADD COLUMN IF NOT EXISTS debug_json jsonb,
ADD COLUMN IF NOT EXISTS last_error_step text CHECK (last_error_step IN ('search', 'select_domain', 'fetch', 'extract', 'save', 'openai', NULL)),
ADD COLUMN IF NOT EXISTS last_http_status int;

-- Add indexes for debugging
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_error_step ON contact_enrichment_jobs(last_error_step) WHERE last_error_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_debug ON contact_enrichment_jobs(debug_json) WHERE debug_json IS NOT NULL;

COMMENT ON COLUMN contact_enrichment_jobs.debug_json IS 'Debug information from enrichment process: search results, fetch statuses, extraction counts';
COMMENT ON COLUMN contact_enrichment_jobs.last_error_step IS 'Last step that failed: search, select_domain, fetch, extract, save, openai';
COMMENT ON COLUMN contact_enrichment_jobs.last_http_status IS 'HTTP status code from last failed fetch request';

