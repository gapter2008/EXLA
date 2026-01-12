-- Brand Generation Jobs Table
-- Tracks progress of brand recommendation generation for real-time UI updates

CREATE TABLE IF NOT EXISTS brand_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed')),
  progress int NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  step text,
  error text,
  detail_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookups by user and status
CREATE INDEX IF NOT EXISTS idx_brand_generation_jobs_user_id ON brand_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_generation_jobs_status ON brand_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_brand_generation_jobs_created_at ON brand_generation_jobs(created_at DESC);

-- RLS Policies
ALTER TABLE brand_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can select their own brand generation jobs"
  ON brand_generation_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own jobs
CREATE POLICY "Users can update their own brand generation jobs"
  ON brand_generation_jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only insert their own jobs
CREATE POLICY "Users can insert their own brand generation jobs"
  ON brand_generation_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_brand_generation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_brand_generation_jobs_updated_at
  BEFORE UPDATE ON brand_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_generation_jobs_updated_at();

