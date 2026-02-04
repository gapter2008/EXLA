import { supabaseAdmin } from "./supabaseAdmin";
import { supabase } from "./supabaseClient";

export interface MediaKitData {
  profile: {
    name: string | null;
    username: string | null;
    niche: string | null;
    avatar_url: string | null;
    bio: string | null;
  };
  platforms: Array<{
    platform: string;
    handle: string | null;
    followers: number | null;
    avg_views_10: number | null;
    engagement_rate_10: number | null;
    total_videos: number | null;
    avatar_url: string | null;
  }>;
  stats: {
    audience: number;
    avgViews: number;
    engagement: number;
  };
  topContent: Array<{
    title: string;
    views: number;
    platform: string;
    url: string;
    thumbnailUrl?: string;
    likes?: number;
    comments?: number;
  }>;
  suggestedRateRange: {
    min: number;
    max: number;
    currency: string;
  };
  status: "ready" | "scanning" | "missing";
  scanJobId?: string;
  /** ISO timestamp of latest creator_metrics or media_kits update */
  updatedAt?: string | null;
  /** AI-analyzed creator profile (headline, themes, brand fit) */
  aiProfile?: {
    headline: string | null;
    bio: string | null;
    niches: string[];
    themes: string[];
    content_formats: string[];
    style_descriptors: string[];
    audience_summary: string | null;
    brand_fit: Array<{ category: string; reasoning?: string }>;
    suggested_collab_types: string[];
    confidence: number | null;
    last_analysis_status: string | null;
    last_analysis_error: string | null;
    updated_at: string | null;
  } | null;
}

/**
 * Unified function to fetch all media kit data
 * Handles scanning state, missing data, and aggregates from multiple sources
 */
export async function getMediaKitData(userId: string): Promise<MediaKitData> {
  // Fetch profile first (needed for all states)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("name, niche")
    .eq("id", userId)
    .maybeSingle();

  // Check for latest scan job (any status) - ONE consistent query
  const { data: latestScanJob } = await supabaseAdmin
    .from("scan_jobs")
    .select("id, status, progress, error, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // CRITICAL: Check for active scan jobs FIRST
  // If scan job exists and is active (queued/running), return scanning state
  // NEVER show "missing" if there's an active scan job
  if (latestScanJob && (latestScanJob.status === "queued" || latestScanJob.status === "running")) {
    return {
      profile: { 
        name: profile?.name || null, 
        username: null, 
        niche: profile?.niche || null, 
        avatar_url: null, 
        bio: null 
      },
      platforms: [],
      stats: { audience: 0, avgViews: 0, engagement: 0 },
      topContent: [],
      suggestedRateRange: { min: 0, max: 0, currency: "USD" },
      status: "scanning",
      scanJobId: latestScanJob.id,
    };
  }

  // If scan job exists but failed, we'll check for data but also return error info
  const scanJobFailed = latestScanJob && latestScanJob.status === "failed";

  // Fetch creator profile for niche
  const { data: creator } = await supabaseAdmin
    .from("creators")
    .select("niche")
    .eq("user_id", userId)
    .maybeSingle();

  // Check if scan job is complete (needed for fallback logic below)
  const scanJobComplete = latestScanJob && 
                          (latestScanJob.status === "complete" || 
                           latestScanJob.status === "scanned" || 
                           latestScanJob.status === "scanned_partial");

  // Fetch social accounts (platform info, handles, stats)
  // First try with scan_status filter, then fallback to all accounts if scan job is complete
  let { data: socialAccounts, error: accountsError } = await supabaseAdmin
    .from("social_accounts")
    .select("platform, handle, followers, avg_views_10, engagement_rate_10, total_videos, avatar_url, bio_description, scan_status")
    .eq("user_id", userId)
    .in("scan_status", ["scanned", "scanned_partial", "connected"]); // Include connected as fallback
  
  // If scan job is complete but no accounts found, try without scan_status filter
  // This handles cases where scan_status wasn't updated properly
  if (scanJobComplete && (!socialAccounts || socialAccounts.length === 0)) {
    const { data: allAccounts, error: allAccountsError } = await supabaseAdmin
      .from("social_accounts")
      .select("platform, handle, followers, avg_views_10, engagement_rate_10, total_videos, avatar_url, bio_description, scan_status")
      .eq("user_id", userId);
    
    if (allAccounts && allAccounts.length > 0) {
      socialAccounts = allAccounts;
      accountsError = null;
      if (process.env.NODE_ENV === 'development') {
        console.log('[getMediaKitData] Found accounts without scan_status filter:', allAccounts.length);
      }
    }
  }

  // Fetch creator metrics (canonical source for audience/avg_views/engagement)
  const { data: metrics, error: metricsError } = await supabaseAdmin
    .from("creator_metrics")
    .select("platform, followers, avg_views_10, engagement_rate_10, video_count, top_videos, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  // Fetch media kit (cached generated kit)
  const { data: mediaKitRow } = await supabaseAdmin
    .from("media_kits")
    .select("kit, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Fetch AI creator profile (headline, themes, brand fit)
  const { data: aiProfileRow } = await supabaseAdmin
    .from("creator_ai_profiles")
    .select("headline, bio, niches, themes, content_formats, style_descriptors, audience_summary, brand_fit, suggested_collab_types, confidence, last_analysis_status, last_analysis_error, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Check if we have any data
  // Data exists if:
  // 1. Latest scan job exists and is complete/partial (indicates scan was done)
  // 2. Social accounts with scanned status exist
  // 3. Creator metrics exist
  // 4. Media kit exists
  // Note: scanJobComplete is already declared above (after fetching creator profile)
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[getMediaKitData] Data check:', {
      userId,
      scanJobComplete,
      scanJobStatus: latestScanJob?.status,
      socialAccountsCount: socialAccounts?.length || 0,
      metricsCount: metrics?.length || 0,
      hasMediaKit: !!mediaKitRow?.kit,
      socialAccountsError: accountsError?.message,
      metricsError: metricsError?.message,
    });
  }
  
  // If scan job is complete, we should proceed even if queries fail
  // The scan job completion is the source of truth
  const hasAnyData = scanJobComplete ||
                     (socialAccounts && socialAccounts.length > 0) || 
                     (metrics && metrics.length > 0) ||
                     (mediaKitRow && mediaKitRow.kit);
  
  // CRITICAL: If scan job is complete, we MUST proceed to build data
  // Even if queries failed, we should return "ready" with empty/null values
  // This is better than "missing" because the scan DID complete

  // If scan job failed, return missing status but include error info in scanJobId
  // (we'll use scanJobId to pass error message in the UI)
  if (scanJobFailed) {
    return {
      profile: {
        name: profile?.name || null,
        username: null,
        niche: creator?.niche || profile?.niche || null,
        avatar_url: null,
        bio: null,
      },
      platforms: [],
      stats: { audience: 0, avgViews: 0, engagement: 0 },
      topContent: [],
      suggestedRateRange: { min: 0, max: 0, currency: "USD" },
      status: "missing", // Use missing status but we'll check for failed job in UI
      scanJobId: latestScanJob.id, // Include job ID so UI can fetch error
    };
  }

  // Only return "missing" if:
  // 1. NO scan job exists at all AND no data exists, OR
  // 2. Latest scan job is failed AND no data exists
  // NEVER show "missing" if there's a complete scan job (even if data queries failed)
  const shouldShowMissing = (!latestScanJob && !hasAnyData) || 
                            (scanJobFailed && !hasAnyData);
  
  if (shouldShowMissing) {
    return {
      profile: {
        name: profile?.name || null,
        username: null,
        niche: creator?.niche || profile?.niche || null,
        avatar_url: null,
        bio: null,
      },
      platforms: [],
      stats: { audience: 0, avgViews: 0, engagement: 0 },
      topContent: [],
      suggestedRateRange: { min: 0, max: 0, currency: "USD" },
      status: "missing",
      scanJobId: scanJobFailed ? latestScanJob?.id : undefined,
    };
  }

  // CRITICAL FIX: If scan job is complete/partial, ALWAYS proceed to build data
  // Since hasAnyData includes scanJobComplete, if scanJobComplete is true, hasAnyData is true
  // So this condition should never be true, but we keep it as a safety check
  // If somehow queries failed, we still proceed to build data (will return "ready" with empty values)
  if (scanJobComplete && !hasAnyData) {
    // This should never happen (scanJobComplete makes hasAnyData true)
    // But if it does, log warning and proceed anyway
    if (process.env.NODE_ENV === 'development') {
      console.warn('[getMediaKitData] WARNING: scanJobComplete is true but hasAnyData is false. This should not happen!', {
        userId,
        scanJobId: latestScanJob.id,
        scanJobStatus: latestScanJob.status,
        socialAccountsError: accountsError?.message,
        metricsError: metricsError?.message,
        socialAccountsCount: socialAccounts?.length || 0,
        metricsCount: metrics?.length || 0,
      });
    }
    // Continue to build data section below - will return "ready" with empty/null values
  }

  // Build platforms array: creator_metrics is source of truth for stats; social_accounts adds handle/avatar
  const platformMap = new Map<string, any>();

  // Prefer creator_metrics so Media Kit shows real numbers even if social_accounts stats are null
  if (metrics && metrics.length > 0) {
    metrics.forEach((metric: any) => {
      const existing = platformMap.get(metric.platform);
      platformMap.set(metric.platform, {
        platform: metric.platform,
        handle: existing?.handle ?? null,
        followers: existing?.followers ?? metric.followers ?? null,
        avg_views_10: existing?.avg_views_10 ?? metric.avg_views_10 ?? null,
        engagement_rate_10: existing?.engagement_rate_10 ?? metric.engagement_rate_10 ?? null,
        total_videos: existing?.total_videos ?? metric.video_count ?? null,
        avatar_url: existing?.avatar_url ?? null,
      });
    });
  }

  // Overlay social_accounts for handle and avatar (social_accounts does not store followers/avg_views from scan)
  if (socialAccounts) {
    socialAccounts.forEach((acc: any) => {
      const existing = platformMap.get(acc.platform) || {
        platform: acc.platform,
        handle: null,
        followers: null,
        avg_views_10: null,
        engagement_rate_10: null,
        total_videos: null,
        avatar_url: null,
      };
      platformMap.set(acc.platform, {
        ...existing,
        handle: acc.handle ?? existing.handle,
        avatar_url: acc.avatar_url ?? existing.avatar_url,
        followers: existing.followers ?? acc.followers ?? null,
        avg_views_10: existing.avg_views_10 ?? acc.avg_views_10 ?? null,
        engagement_rate_10: existing.engagement_rate_10 ?? acc.engagement_rate_10 ?? null,
        total_videos: existing.total_videos ?? acc.total_videos ?? null,
      });
    });
  }

  const platforms = Array.from(platformMap.values());

  // Collect top content from creator_metrics
  const topContent: MediaKitData["topContent"] = [];
  if (metrics) {
    metrics.forEach((metric: any) => {
      if (metric.top_videos && Array.isArray(metric.top_videos)) {
        metric.top_videos.forEach((video: any) => {
          const thumbnailUrl = video.thumbnail_url ?? video.thumbnail ?? null;
          if (!thumbnailUrl && (video.url || video.title)) {
            console.warn("[getMediaKitData] Top video missing thumbnail_url:", {
              title: video.title,
              url: video.url,
              platform: metric.platform,
            });
          }
          topContent.push({
            title: video.title || "Untitled",
            url: video.url || "",
            views: video.views || 0,
            platform: metric.platform,
            thumbnailUrl: thumbnailUrl ?? undefined,
            likes: video.likes,
            comments: video.comments,
          });
        });
      }
    });
  }

  // Sort by views and take top 10
  topContent.sort((a, b) => b.views - a.views);
  const top10Content = topContent.slice(0, 10);

  // Calculate aggregate stats
  const audience = platforms.reduce((sum, p) => sum + (p.followers || 0), 0);
  const avgViews = platforms.length > 0
    ? platforms.reduce((sum, p) => sum + (p.avg_views_10 || 0), 0) / platforms.length
    : 0;
  const engagement = platforms.length > 0
    ? platforms.reduce((sum, p) => sum + (p.engagement_rate_10 || 0), 0) / platforms.length
    : 0;

  // Calculate suggested rate range
  // Use logic from generateMediaKit: $0.01 per 1000 avg views, adjusted by engagement
  const baseRate = (avgViews / 1000) * 10;
  const engagementMultiplier = 1 + (engagement / 100);
  const minRate = Math.max(50, Math.floor(baseRate * engagementMultiplier * 0.7));
  const maxRate = Math.floor(baseRate * engagementMultiplier * 1.5);

  // Use cached media kit if available, otherwise use computed data
  const cachedKit = mediaKitRow?.kit;
  const finalTopContent = cachedKit?.top_content?.length > 0 
    ? cachedKit.top_content.slice(0, 10).map((c: any) => ({
        title: c.title || "Untitled",
        url: c.url || "",
        views: c.views || 0,
        platform: c.platform || "youtube",
        thumbnailUrl: c.thumbnail_url ?? c.thumbnail ?? undefined,
        likes: c.likes,
        comments: c.comments,
      }))
    : top10Content;

  const finalSuggestedRates = cachedKit?.suggested_rates || {
    min: minRate,
    max: maxRate,
    currency: "USD",
  };

  // Get username from first social account handle or email
  let username = null;
  if (platforms.length > 0 && platforms[0].handle) {
    username = platforms[0].handle;
  }

  // Get bio: prefer AI profile bio, else first social account
  let bio = aiProfileRow?.bio ?? null;
  if (!bio && socialAccounts && socialAccounts.length > 0 && socialAccounts[0].bio_description) {
    bio = socialAccounts[0].bio_description;
  }

  // Get avatar from first social account
  let avatar_url = null;
  if (platforms.length > 0 && platforms[0].avatar_url) {
    avatar_url = platforms[0].avatar_url;
  }

  // Latest updated_at from creator_metrics or media_kits for "Last updated" in UI
  let updatedAt: string | null = null;
  if (metrics && metrics.length > 0) {
    const fromMetrics = metrics
      .map((m: any) => m.updated_at)
      .filter(Boolean) as string[];
    if (fromMetrics.length > 0) updatedAt = fromMetrics.reduce((a, b) => (a > b ? a : b));
  }
  if (mediaKitRow?.updated_at && (!updatedAt || mediaKitRow.updated_at > updatedAt)) {
    updatedAt = mediaKitRow.updated_at;
  }

  const aiProfile = aiProfileRow ? {
    headline: aiProfileRow.headline ?? null,
    bio: aiProfileRow.bio ?? null,
    niches: (aiProfileRow.niches as string[]) ?? [],
    themes: (aiProfileRow.themes as string[]) ?? [],
    content_formats: (aiProfileRow.content_formats as string[]) ?? [],
    style_descriptors: (aiProfileRow.style_descriptors as string[]) ?? [],
    audience_summary: aiProfileRow.audience_summary ?? null,
    brand_fit: (Array.isArray(aiProfileRow.brand_fit) ? aiProfileRow.brand_fit : []) as Array<{ category: string; reasoning?: string }>,
    suggested_collab_types: (aiProfileRow.suggested_collab_types as string[]) ?? [],
    confidence: aiProfileRow.confidence ?? null,
    last_analysis_status: aiProfileRow.last_analysis_status ?? null,
    last_analysis_error: aiProfileRow.last_analysis_error ?? null,
    updated_at: aiProfileRow.updated_at ?? null,
  } : null;

  return {
    profile: {
      name: profile?.name || null,
      username,
      niche: creator?.niche || profile?.niche || cachedKit?.niche || aiProfile?.niches?.[0] || null,
      avatar_url,
      bio,
    },
    platforms,
    stats: {
      audience,
      avgViews: Math.round(avgViews),
      engagement: Math.round(engagement * 100) / 100,
    },
    topContent: finalTopContent,
    suggestedRateRange: finalSuggestedRates,
    status: "ready",
    updatedAt: updatedAt || null,
    aiProfile,
  };
}

