-- Add theme_preference column to profiles table
-- This stores the user's preferred theme: 'system', 'light', or 'dark'

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('system', 'light', 'dark'));

-- Add comment for documentation
COMMENT ON COLUMN profiles.theme_preference IS 'User preference for app theme: system (follows OS), light, or dark';

