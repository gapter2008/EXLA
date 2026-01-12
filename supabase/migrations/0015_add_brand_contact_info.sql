-- Add contact information fields to brand_recommendations table
-- These fields store contact methods for brands so creators can reach out

ALTER TABLE brand_recommendations 
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_website TEXT,
ADD COLUMN IF NOT EXISTS contact_instagram TEXT,
ADD COLUMN IF NOT EXISTS contact_tiktok TEXT,
ADD COLUMN IF NOT EXISTS contact_linkedin TEXT,
ADD COLUMN IF NOT EXISTS contact_form_url TEXT,
ADD COLUMN IF NOT EXISTS preferred_contact TEXT CHECK (preferred_contact IN ('email', 'instagram', 'tiktok', 'linkedin', 'website', 'form', NULL));

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_brand_recommendations_contact_email ON brand_recommendations(contact_email) WHERE contact_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brand_recommendations_contact_website ON brand_recommendations(contact_website) WHERE contact_website IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN brand_recommendations.contact_email IS 'Brand contact email address';
COMMENT ON COLUMN brand_recommendations.contact_website IS 'Brand website URL (may differ from main website field)';
COMMENT ON COLUMN brand_recommendations.contact_instagram IS 'Instagram handle (without @) or URL';
COMMENT ON COLUMN brand_recommendations.contact_tiktok IS 'TikTok handle (without @) or URL';
COMMENT ON COLUMN brand_recommendations.contact_linkedin IS 'LinkedIn company page URL';
COMMENT ON COLUMN brand_recommendations.contact_form_url IS 'Contact form URL';
COMMENT ON COLUMN brand_recommendations.preferred_contact IS 'Preferred contact method: email, instagram, tiktok, linkedin, website, or form';

