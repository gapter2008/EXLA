import { supabaseAdmin } from "./supabaseAdmin";

export interface MediaKit {
  name: string;
  niche?: string;
  platforms: Array<{
    platform: string;
    handle?: string;
    followers: number;
    avg_views_10: number;
    engagement_rate_10: number;
  }>;
  top_content: Array<{
    title: string;
    url: string;
    views: number;
    likes?: number;
    comments?: number;
    publishedAt?: string;
    platform?: string;
  }>;
  suggested_rates: {
    min: number;
    max: number;
    currency: string;
  };
}

async function generateMediaKit(userId: string, profileName?: string): Promise<MediaKit> {
  // Fetch all creator metrics for this user
  const { data: metrics, error: metricsError } = await supabaseAdmin
    .from("creator_metrics")
    .select("id, user_id, platform, followers, total_views, video_count, avg_views_10, engagement_rate_10, top_videos, updated_at")
    .eq("user_id", userId);

  // Fetch creator profile for niche
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("niche")
    .eq("user_id", userId)
    .single();

  // Fetch profile for name
  // DO NOT select full_name or username - columns may not exist
  // Use 'name' field which exists in profiles table
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();

  if (metricsError || !metrics || metrics.length === 0) {
    // Return minimal kit if no metrics
    return {
      name: profileName || profile?.name || "Creator",
      niche: creator?.niche,
      platforms: [],
      top_content: [],
      suggested_rates: { min: 0, max: 0, currency: "USD" },
    };
  }

  // Fetch social accounts for handles and channel titles
  const { data: socialAccounts } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, handle")
    .eq("user_id", userId);

  const handleMap = new Map(
    socialAccounts?.map((acc) => [acc.platform, acc.handle]) || []
  );

  // Get YouTube channel title if available (can be used as name fallback)
  const youtubeHandle = handleMap.get("youtube");

  // Build platforms summary - use exact field names from requirements
  const platforms = metrics.map((m) => ({
    platform: m.platform,
    handle: handleMap.get(m.platform),
    followers: m.followers || 0,
    avg_views_10: Number(m.avg_views_10) || 0,
    engagement_rate_10: Number(m.engagement_rate_10) || 0,
  }));

  // Collect top content from all platforms
  const top_content: MediaKit["top_content"] = [];
  metrics.forEach((m) => {
    if (m.top_videos && Array.isArray(m.top_videos)) {
      m.top_videos.forEach((video: any) => {
        top_content.push({
          title: video.title || "Untitled",
          url: video.url || "",
          views: video.views || 0,
          likes: video.likes,
          comments: video.comments,
          publishedAt: video.publishedAt,
          platform: m.platform,
        });
      });
    }
  });

  // Sort by views and take top 10
  top_content.sort((a, b) => b.views - a.views);
  const top10Content = top_content.slice(0, 10);

  // Calculate suggested rates (simple heuristic based on avg_views_10)
  // Use avg_views_10 as the primary metric for rate calculation
  const avgViews = platforms.reduce((sum, p) => sum + p.avg_views_10, 0) / platforms.length || 0;
  const avgEngagement = platforms.reduce((sum, p) => sum + p.engagement_rate_10, 0) / platforms.length || 0;

  // Simple heuristic: $0.01 per 1000 avg views, adjusted by engagement
  const baseRate = (avgViews / 1000) * 10;
  const engagementMultiplier = 1 + (avgEngagement / 100);
  const minRate = Math.max(50, Math.floor(baseRate * engagementMultiplier * 0.7));
  const maxRate = Math.floor(baseRate * engagementMultiplier * 1.5);

  // Use profile name or YouTube channel title as fallback
  // DO NOT use full_name or username - columns do not exist in profiles table
  const name = profileName || profile?.name || youtubeHandle || "Creator";

  return {
    name,
    niche: creator?.niche,
    platforms,
    top_content: top10Content,
    suggested_rates: {
      min: minRate,
      max: maxRate,
      currency: "USD",
    },
  };
}

export async function generateAndStoreMediaKit(userId: string, profileName?: string): Promise<void> {
  try {
    const kit = await generateMediaKit(userId, profileName);

    const { error } = await supabaseAdmin
      .from("media_kits")
      .upsert(
        {
          user_id: userId,
          kit: kit as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Failed to store media kit:", error);
      throw error;
    }
  } catch (err) {
    console.error("Error generating media kit:", err);
    // Don't throw - media kit generation shouldn't block the main flow
  }
}

