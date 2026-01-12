-- Add bio_description and avatar_url columns to social_accounts for TikTok personalization
-- This enables bio-based niche inference for TikTok accounts

alter table social_accounts
  add column if not exists bio_description text,
  add column if not exists avatar_url text;

create index if not exists idx_social_accounts_bio on social_accounts(bio_description) where bio_description is not null;

comment on column social_accounts.bio_description is 'Bio/description from platform (used for niche inference, especially TikTok)';
comment on column social_accounts.avatar_url is 'Avatar/profile picture URL from platform';

