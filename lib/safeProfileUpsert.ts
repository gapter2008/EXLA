/**
 * Safe profile upsert helper
 * 
 * Prevents writing non-existent columns to the profiles table.
 * Only allows explicitly whitelisted fields.
 * 
 * Allowed fields:
 * - id (required)
 * - name
 * - primary_platform
 * - niche
 * - niche_confidence
 * - niche_source
 * - niche_locked
 * - onboarding_step
 * - onboarding_completed
 * 
 * DO NOT add email or role - these columns may not exist in the profiles table schema.
 */

const ALLOWED_FIELDS = [
  'id',
  'name',
  'primary_platform',
  'niche',
  'niche_confidence',
  'niche_source',
  'niche_locked',
  'onboarding_step',
  'onboarding_completed',
] as const;

type AllowedField = typeof ALLOWED_FIELDS[number];

export interface SafeProfileData {
  id: string; // Required
  name?: string | null;
  primary_platform?: string | null;
  niche?: string | null;
  niche_confidence?: number | null;
  niche_source?: string | null;
  niche_locked?: boolean | null;
  onboarding_step?: string | null;
  onboarding_completed?: boolean | null;
}

/**
 * Validates that only allowed fields are present in profile data
 * @throws Error if unknown fields are detected
 */
export function validateProfileData(data: any): SafeProfileData {
  const allowedSet = new Set(ALLOWED_FIELDS);
  const unknownFields: string[] = [];

  for (const key in data) {
    if (!allowedSet.has(key as AllowedField)) {
      unknownFields.push(key);
    }
  }

  if (unknownFields.length > 0) {
    throw new Error(
      `Invalid profile fields detected: ${unknownFields.join(', ')}. ` +
      `Allowed fields: ${ALLOWED_FIELDS.join(', ')}. ` +
      `DO NOT use email or role - these columns may not exist in the profiles table.`
    );
  }

  // Ensure id is present
  if (!data.id) {
    throw new Error('Profile data must include id field');
  }

  return data as SafeProfileData;
}

