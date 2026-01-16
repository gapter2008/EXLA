import { supabase } from "./supabaseClient";
import { User } from "@supabase/supabase-js";

export interface CreatorProfile {
  id: string;
  user_id: string;
  niche: string | null;
  platforms: string[] | string | null;
  audience_size: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string | null; // Added: name field from profiles table
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  primary_platform: string | null; // Added: primary_platform field
  niche: string | null; // Added: niche field
  onboarding_step: string | null; // Added: onboarding_step field
  onboarding_completed: boolean | null; // Added: onboarding_completed field
  created_at: string;
}

/**
 * Ensures a profile exists for the authenticated user.
 * Creates one if it doesn't exist.
 */
export async function ensureProfile(user: User): Promise<Profile | null> {
  if (!user?.id) return null;

  // Check if profile exists
  // DO NOT use select("*") - explicitly list columns (email does not exist)
  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, name, primary_platform, niche, onboarding_step, onboarding_completed")
    .eq("id", user.id)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // Error other than "not found"
    console.error("Error fetching profile:", fetchError);
    return null;
  }

  if (existingProfile) {
    // Construct Profile with all fields (missing schema fields default to null)
    const profile: Profile = {
      id: existingProfile.id,
      name: existingProfile.name ?? null,
      username: null, // Not in schema - always null
      full_name: null, // Not in schema - always null
      avatar_url: null, // Not in schema - always null
      primary_platform: existingProfile.primary_platform ?? null,
      niche: existingProfile.niche ?? null,
      onboarding_step: existingProfile.onboarding_step ?? null,
      onboarding_completed: existingProfile.onboarding_completed ?? null,
      created_at: new Date().toISOString(), // Default if not in query
    };
    return profile;
  }

  // Create profile if it doesn't exist
  // DO NOT include email, role, username, full_name, avatar_url - columns may not exist
  // Only include fields that definitely exist in profiles table
  const { data: newProfile, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      onboarding_step: 'welcome',
      onboarding_completed: false,
    })
    .select("id, name, primary_platform, niche, onboarding_step, onboarding_completed")
    .single();

  if (createError) {
    console.error("Error creating profile:", createError);
    return null;
  }

  // Construct Profile with all fields (missing schema fields default to null)
  const profile: Profile = {
    id: newProfile.id,
    name: newProfile.name ?? null,
    username: null, // Not in schema - always null
    full_name: null, // Not in schema - always null
    avatar_url: null, // Not in schema - always null
    primary_platform: newProfile.primary_platform ?? null,
    niche: newProfile.niche ?? null,
    onboarding_step: newProfile.onboarding_step ?? null,
    onboarding_completed: newProfile.onboarding_completed ?? null,
    created_at: new Date().toISOString(), // Default if not in query
  };
  return profile;
}

/**
 * Get creator profile for authenticated user
 */
export async function getCreatorProfile(
  userId: string
): Promise<CreatorProfile | null> {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("creators")
    .select("id, user_id, niche, created_at, updated_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found - return null
      return null;
    }
    console.error("Error fetching creator profile:", error);
    return null;
  }

  return data as CreatorProfile;
}

/**
 * Create creator profile
 */
export async function createCreatorProfile(
  userId: string,
  data: {
    niche?: string;
    platforms?: string[] | string;
    audience_size?: number;
  }
): Promise<CreatorProfile | null> {
  if (!userId) return null;

  const { data: creator, error } = await supabase
    .from("creators")
    .insert({
      user_id: userId,
      niche: data.niche || null,
      platforms: Array.isArray(data.platforms)
        ? data.platforms
        : data.platforms || null,
      audience_size: data.audience_size || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating creator profile:", error);
    return null;
  }

  return creator as CreatorProfile;
}

/**
 * Update creator profile
 */
export async function updateCreatorProfile(
  userId: string,
  updates: {
    niche?: string;
    platforms?: string[] | string;
    audience_size?: number;
  }
): Promise<CreatorProfile | null> {
  if (!userId) return null;

  const updateData: any = {};
  if (updates.niche !== undefined) updateData.niche = updates.niche;
  if (updates.platforms !== undefined) {
    updateData.platforms = Array.isArray(updates.platforms)
      ? updates.platforms
      : updates.platforms;
  }
  if (updates.audience_size !== undefined)
    updateData.audience_size = updates.audience_size;

  const { data: creator, error } = await supabase
    .from("creators")
    .update(updateData)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Error updating creator profile:", error);
    return null;
  }

  return creator as CreatorProfile;
}

/**
 * Get profile data for authenticated user
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!userId) return null;

  // DO NOT use select("*") - explicitly list columns that exist
  // Only select columns that definitely exist (name, primary_platform, niche, onboarding_step, onboarding_completed, created_at)
  // username, full_name, avatar_url may not exist in schema - set to null in return
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, primary_platform, niche, onboarding_step, onboarding_completed, created_at")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  // Construct Profile with all fields (missing schema fields default to null)
  const profile: Profile = {
    id: data.id,
    name: data.name ?? null,
    username: null, // Not in schema - always null
    full_name: null, // Not in schema - always null
    avatar_url: null, // Not in schema - always null
    primary_platform: data.primary_platform ?? null,
    niche: data.niche ?? null,
    onboarding_step: data.onboarding_step ?? null,
    onboarding_completed: data.onboarding_completed ?? null,
    created_at: data.created_at ?? new Date().toISOString(),
  };

  return profile;
}

