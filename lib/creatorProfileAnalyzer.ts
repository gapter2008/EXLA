/**
 * Gathers normalized content samples from creator_metrics + social_accounts
 * for AI creator profile analysis.
 */
import { supabaseAdmin } from "./supabaseAdmin";

export interface ContentSampleVideo {
  title: string;
  description?: string;
  views: number;
  likes?: number;
  comments?: number;
  posted_at?: string;
}

export interface ContentSamplesChannel {
  handle: string | null;
  display_name: string | null;
  description: string | null;
  subscribers: number | null;
  platform: string;
}

export interface ContentSamples {
  user_id: string;
  platform: string;
  channel: ContentSamplesChannel;
  recent_videos: ContentSampleVideo[];
  top_videos_optional: ContentSampleVideo[];
}

/**
 * Load latest normalized platform content for a user (YouTube/TikTok).
 * Uses creator_metrics.top_videos and social_accounts.
 */
export async function getContentSamplesForUser(userId: string): Promise<ContentSamples | null> {
  if (!supabaseAdmin) return null;

  const { data: accounts } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, handle, bio_description")
    .eq("user_id", userId)
    .in("scan_status", ["scanned", "scanned_partial", "connected"]);

  const { data: metrics } = await supabaseAdmin
    .from("creator_metrics")
    .select("platform, followers, top_videos")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (!metrics || metrics.length === 0) return null;

  const primary = metrics[0];
  const platform = primary.platform as string;
  const account = accounts?.find((a: any) => a.platform === platform);

  const topVideosRaw = Array.isArray(primary.top_videos) ? primary.top_videos : [];
  const recent_videos: ContentSampleVideo[] = topVideosRaw.map((v: any) => ({
    title: v.title || "Untitled",
    description: v.description,
    views: typeof v.views === "number" ? v.views : parseInt(String(v.views || 0), 10),
    likes: v.likes,
    comments: v.comments,
    posted_at: v.posted_at || v.publishedAt,
  }));

  const channel: ContentSamplesChannel = {
    handle: account?.handle ?? null,
    display_name: account?.handle ?? null,
    description: account?.bio_description ?? null,
    subscribers: primary.followers ?? null,
    platform,
  };

  return {
    user_id: userId,
    platform,
    channel,
    recent_videos,
    top_videos_optional: recent_videos.slice(0, 5),
  };
}
