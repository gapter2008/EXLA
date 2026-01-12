-- Add website column to brand_recommendations

alter table brand_recommendations
  add column if not exists website text;

-- RLS stays the same (already enforced on the table level)

