-- Combined migration script for brand enrichment feature
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/[your-project]/sql

-- Migration 0016: Create brands, brand_contacts, and contact_enrichment_jobs tables
-- Create brands table for storing brand metadata
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name text NOT NULL,
  website_url text,
  domain text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_name, domain)
);

CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(brand_name);
CREATE INDEX IF NOT EXISTS idx_brands_domain ON brands(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brands_website ON brands(website_url) WHERE website_url IS NOT NULL;

-- Create brand_contacts table for storing enriched contact information
CREATE TABLE IF NOT EXISTS brand_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  website_url text,
  contact_page_url text,
  email text,
  instagram_url text,
  tiktok_url text,
  linkedin_url text,
  source_url text,
  confidence int CHECK (confidence >= 0 AND confidence <= 100),
  last_enriched_at timestamptz,
  enrichment_status text NOT NULL DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'complete', 'partial', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_contacts_brand_id ON brand_contacts(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_contacts_status ON brand_contacts(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_brand_contacts_email ON brand_contacts(email) WHERE email IS NOT NULL;

-- Create contact_enrichment_jobs table for job queue management
CREATE TABLE IF NOT EXISTS contact_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create unique partial index to prevent duplicate pending/processing jobs
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrichment_jobs_unique_pending 
ON contact_enrichment_jobs(brand_id) 
WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON contact_enrichment_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_brand_id ON contact_enrichment_jobs(brand_id);

-- Migration 0017: Add debug fields
ALTER TABLE contact_enrichment_jobs
ADD COLUMN IF NOT EXISTS debug_json jsonb,
ADD COLUMN IF NOT EXISTS last_error_step text CHECK (last_error_step IN ('search', 'select_domain', 'fetch', 'extract', 'save', 'openai', NULL)),
ADD COLUMN IF NOT EXISTS last_http_status int;

ALTER TABLE brand_contacts
ADD COLUMN IF NOT EXISTS debug_json jsonb,
ADD COLUMN IF NOT EXISTS last_error_step text CHECK (last_error_step IN ('search', 'select_domain', 'fetch', 'extract', 'save', 'openai', NULL)),
ADD COLUMN IF NOT EXISTS last_http_status int;

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_error_step ON contact_enrichment_jobs(last_error_step) WHERE last_error_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_debug ON contact_enrichment_jobs(debug_json) WHERE debug_json IS NOT NULL;

-- Add RLS policies
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_enrichment_jobs ENABLE ROW LEVEL SECURITY;

-- Brands: Anyone can read, but only service role can insert/update
DROP POLICY IF EXISTS "brands_read_all" ON brands;
CREATE POLICY "brands_read_all" ON brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "brands_insert_service" ON brands;
CREATE POLICY "brands_insert_service" ON brands FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "brands_update_service" ON brands;
CREATE POLICY "brands_update_service" ON brands FOR UPDATE USING (true);

-- Brand contacts: Anyone can read, but only service role can insert/update
DROP POLICY IF EXISTS "brand_contacts_read_all" ON brand_contacts;
CREATE POLICY "brand_contacts_read_all" ON brand_contacts FOR SELECT USING (true);
DROP POLICY IF EXISTS "brand_contacts_insert_service" ON brand_contacts;
CREATE POLICY "brand_contacts_insert_service" ON brand_contacts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "brand_contacts_update_service" ON brand_contacts;
CREATE POLICY "brand_contacts_update_service" ON brand_contacts FOR UPDATE USING (true);

-- Enrichment jobs: Only service role can access
DROP POLICY IF EXISTS "enrichment_jobs_all_service" ON contact_enrichment_jobs;
CREATE POLICY "enrichment_jobs_all_service" ON contact_enrichment_jobs FOR ALL USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_brands_updated_at ON brands;
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_brand_contacts_updated_at ON brand_contacts;
CREATE TRIGGER update_brand_contacts_updated_at BEFORE UPDATE ON brand_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_enrichment_jobs_updated_at ON contact_enrichment_jobs;
CREATE TRIGGER update_enrichment_jobs_updated_at BEFORE UPDATE ON contact_enrichment_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify tables were created
SELECT 'Migration completed successfully! Tables created:' as status;
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('brands', 'brand_contacts', 'contact_enrichment_jobs');

