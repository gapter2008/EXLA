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
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

/**
 * Ensures a profile exists for the authenticated user.
 * Creates one if it doesn't exist.
 */
export async function ensureProfile(user: User): Promise<Profile | null> {
  if (!user?.id) return null;

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (fetchError && fetchError.code !== "PGRST116") {
    // Error other than "not found"
    console.error("Error fetching profile:", fetchError);
    return null;
  }

  if (existingProfile) {
    return existingProfile as Profile;
  }

  // Create profile if it doesn't exist
  const { data: newProfile, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      username: user.email?.split("@")[0] || null,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select()
    .single();

  if (createError) {
    console.error("Error creating profile:", createError);
    return null;
  }

  return newProfile as Profile;
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
    .select("*")
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

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return null;
  }

  return data as Profile;
}

