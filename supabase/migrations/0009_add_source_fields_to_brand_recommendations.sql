-- Add source tracking fields to brand_recommendations

alter table brand_recommendations
  add column if not exists source_url text,
  add column if not exists domain text;

-- RLS stays the same (already enforced on the table level)

