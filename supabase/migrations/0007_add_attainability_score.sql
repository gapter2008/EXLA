-- Add attainability_score to brand_recommendations

alter table brand_recommendations
  add column if not exists attainability_score int check (attainability_score >= 0 and attainability_score <= 100);

create index if not exists idx_brand_recommendations_attainability on brand_recommendations(user_id, attainability_score desc);

