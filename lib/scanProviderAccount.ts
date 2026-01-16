/**
 * Unified scan pipeline for provider accounts (YouTube, TikTok)
 * Implements strict "scan -> commit -> use everywhere" lifecycle
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { logScanStep, generateScanRunId } from "./scanLogging";

export type Provider = "youtube" | "tiktok";

export interface ScanResult {
  profile: {
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  };
  stats: {
    followers: number | null;
    avg_views: number | null;
    engagement_rate: number | null;
    total_videos: number | null;
    likes: number | null;
  };
  top_content: Array<{
    title: string;
    views: number;
    url: string;
  }>;
  niche: {
    primary: string;
    secondary: string[];
    confidence: number;
    keywords: string[];
  };
}

/**
 * Infer niche from bio, video titles, and keywords
 * Deterministic keyword mapping (no AI, fast, consistent)
 */
function inferNiche(
  bio: string | null,
  videoTitles: string[],
  keywords: string[]
): { primary: string; secondary: string[]; confidence: number; keywords: string[] } {
  const allText = [
    bio || "",
    ...videoTitles,
    ...keywords,
  ]
    .join(" ")
    .toLowerCase();

  // Keyword -> niche mapping
  const nicheMap: Record<string, string> = {
    // Health & Fitness
    health: "Health & Fitness",
    fitness: "Health & Fitness",
    workout: "Health & Fitness",
    gym: "Health & Fitness",
    exercise: "Health & Fitness",
    nutrition: "Health & Fitness",
    diet: "Health & Fitness",
    weight: "Health & Fitness",
    muscle: "Health & Fitness",
    running: "Health & Fitness",
    yoga: "Health & Fitness",
    // Gaming
    game: "Gaming",
    gaming: "Gaming",
    minecraft: "Gaming",
    fortnite: "Gaming",
    stream: "Gaming",
    twitch: "Gaming",
    // Beauty
    beauty: "Beauty",
    makeup: "Beauty",
    skincare: "Beauty",
    cosmetics: "Beauty",
    // Fashion
    fashion: "Fashion",
    style: "Fashion",
    outfit: "Fashion",
    clothing: "Fashion",
    // Tech
    tech: "Technology",
    technology: "Technology",
    coding: "Technology",
    programming: "Technology",
    // Education
    education: "Education",
    tutorial: "Education",
    learn: "Education",
    study: "Education",
    // Food
    food: "Food & Cooking",
    cooking: "Food & Cooking",
    recipe: "Food & Cooking",
    // Travel
    travel: "Travel",
    vacation: "Travel",
    // Lifestyle
    lifestyle: "Lifestyle",
    vlog: "Lifestyle",
  };

  // Count matches for each niche
  const nicheCounts: Record<string, number> = {};
  for (const [keyword, niche] of Object.entries(nicheMap)) {
    if (allText.includes(keyword)) {
      nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
    }
  }

  // Determine primary niche
  let primary = "General Content Creator";
  let maxCount = 0;
  for (const [niche, count] of Object.entries(nicheCounts)) {
    if (count > maxCount) {
      maxCount = count;
      primary = niche;
    }
  }

  // Secondary niches (others with counts > 0)
  const secondary = Object.entries(nicheCounts)
    .filter(([niche, count]) => niche !== primary && count > 0)
    .map(([niche]) => niche)
    .slice(0, 3); // Max 3 secondary

  // Confidence based on match strength
  const confidence = Math.min(maxCount / 3, 1.0); // Max 1.0

  return {
    primary,
    secondary,
    confidence,
    keywords: keywords.slice(0, 10), // Top 10 keywords
  };
}

/**
 * Scan a provider account and commit results to database
 * Returns the scan result and updates scan_status in social_accounts
 */
export async function scanProviderAccount(
  userId: string,
  provider: Provider
): Promise<ScanResult> {
  const scanRunId = generateScanRunId();
  
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider,
    step: "scan_start",
  });

  if (!supabaseAdmin) {
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "database_check",
      db_result: "failure",
      db_error: "Database not configured",
      error_code: "DB_NOT_CONFIGURED",
    });
    throw new Error("Database not configured");
  }

  // 1. Set scan_status = 'scanning'
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider,
    step: "set_scan_status",
  });
  
  const { error: statusError } = await supabaseAdmin
    .from("social_accounts")
    .update({ scan_status: "scanning" })
    .eq("user_id", userId)
    .eq("platform", provider);

  if (statusError) {
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "set_scan_status",
      db_result: "failure",
      db_error: statusError.message,
      error_code: "SET_STATUS_FAILED",
    });
    throw new Error(`Failed to set scan status: ${statusError.message}`);
  }

  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider,
    step: "set_scan_status",
    db_result: "success",
  });

  try {
    // 2. Fetch access token
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "load_tokens",
    });
    
    const { data: account, error: accountError } = await supabaseAdmin
      .from("social_accounts")
      .select("access_token, platform_user_id, handle")
      .eq("user_id", userId)
      .eq("platform", provider)
      .single();

    if (accountError || !account) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "load_tokens",
        db_result: "failure",
        db_error: accountError?.message || "Account not found",
        error_code: "TT_NO_TOKEN_FOR_USER",
      });
      const error: any = new Error(`Account not found for user ${userId}, provider ${provider}: ${accountError?.message || "Unknown error"}`);
      error.code = "TT_NO_TOKEN_FOR_USER";
      throw error;
    }

    if (!account.access_token) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "load_tokens",
        db_result: "failure",
        db_error: "Access token is null or empty",
        error_code: "TT_NO_TOKEN_FOR_USER",
      });
      const error: any = new Error("Access token not found in account");
      error.code = "TT_NO_TOKEN_FOR_USER";
      throw error;
    }

    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "load_tokens",
      db_result: "success",
    });

    // Try to fetch additional columns if they exist (gracefully handle if migration hasn't run)
    try {
      const { data: extendedAccount } = await supabaseAdmin
        .from("social_accounts")
        .select("bio_description, avatar_url")
        .eq("user_id", userId)
        .eq("platform", provider)
        .single();
      
      if (extendedAccount) {
        (account as any).bio_description = extendedAccount.bio_description || null;
        (account as any).avatar_url = extendedAccount.avatar_url || null;
      }
    } catch (e) {
      // Columns don't exist yet - that's ok, we'll just use null
      (account as any).bio_description = null;
      (account as any).avatar_url = null;
    }

    // 3. Fetch data from provider API (delegate to provider-specific functions)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "fetch_profile",
    });

    let scanData: ScanResult;
    try {
      if (provider === "youtube") {
        scanData = await scanYouTube(account.access_token, scanRunId, userId, provider);
      } else if (provider === "tiktok") {
        scanData = await scanTikTok(account.access_token, scanRunId, userId, provider);
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "fetch_profile",
        db_result: "success",
      });
    } catch (scanError: any) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "fetch_profile",
        http_status: scanError.status,
        http_error: scanError.message,
        error_code: scanError.code || "API_FETCH_FAILED",
      });
      throw scanError;
    }

    // Use existing bio if available (check if property exists)
    if ((account as any).bio_description && !scanData.profile.bio) {
      scanData.profile.bio = (account as any).bio_description;
    }
    if ((account as any).avatar_url && !scanData.profile.avatar_url) {
      scanData.profile.avatar_url = (account as any).avatar_url;
    }

    // 4. Infer niche
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "infer_niche",
    });
    const videoTitles = scanData.top_content.map((c) => c.title);
    const keywords = scanData.niche.keywords;
    scanData.niche = inferNiche(scanData.profile.bio, videoTitles, keywords);
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "infer_niche",
      db_result: "success",
    });

    // 5. Get current scan version
    const { data: currentAccount } = await supabaseAdmin
      .from("social_accounts")
      .select("scan_version")
      .eq("user_id", userId)
      .eq("platform", provider)
      .single();

    const newVersion = (currentAccount?.scan_version || 0) + 1;

    // 6. Commit to database (atomic transaction via multiple upserts)
    // Update social_accounts with scan status
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "write_db",
    });

    // Determine final scan status (scanned vs scanned_partial)
    // Check if stats are missing (indicates partial scan due to missing scopes)
    const hasStats = scanData.stats.followers !== null || 
                     scanData.stats.total_videos !== null || 
                     scanData.stats.likes !== null;
    const hasVideos = scanData.top_content.length > 0;
    const scanStatus = (!hasStats || !hasVideos) ? "scanned_partial" : "scanned";

    // Build update object - only include columns that exist
    const updateData: any = {
      scan_status: scanStatus,
      scanned_at: new Date().toISOString(),
      scan_version: newVersion,
      handle: scanData.profile.handle,
    };
    
    // Try to include bio/avatar, but handle gracefully if columns don't exist
    if (scanData.profile.bio !== null && scanData.profile.bio !== undefined) {
      updateData.bio_description = scanData.profile.bio;
    }
    if (scanData.profile.avatar_url !== null && scanData.profile.avatar_url !== undefined) {
      updateData.avatar_url = scanData.profile.avatar_url;
    }
    
    const { error: updateError } = await supabaseAdmin
      .from("social_accounts")
      .update(updateData)
      .eq("user_id", userId)
      .eq("platform", provider);

    // If update fails due to missing columns (scan_status, scanned_at, scan_version), 
    // it means migration 0022 hasn't run - throw a clearer error
    if (updateError) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "write_db",
        db_result: "failure",
        db_error: updateError.message,
        error_code: updateError.code || "DB_UPDATE_FAILED",
      });
      
      if (updateError.message?.includes("does not exist") && updateError.message?.includes("scan_status")) {
        throw new Error("Database migration required: Please run migration 0022_add_scan_lifecycle_fields.sql in Supabase");
      }
      // If it's just bio/avatar columns missing, try again without them
      if (updateError.message?.includes("bio_description") || updateError.message?.includes("avatar_url")) {
        const { error: retryError } = await supabaseAdmin
          .from("social_accounts")
          .update({
            scan_status: scanStatus,
            scanned_at: new Date().toISOString(),
            scan_version: newVersion,
            handle: scanData.profile.handle,
          })
          .eq("user_id", userId)
          .eq("platform", provider);
        
        if (retryError) {
          throw new Error(`Failed to update scan status: ${retryError.message}`);
        }
      } else {
        throw new Error(`Failed to update scan status: ${updateError.message}`);
      }
    }

    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "write_db",
      db_result: "success",
    });

    // Update creator_metrics (non-blocking - log but continue on failure)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "write_metrics",
    });

    const { error: metricsError } = await supabaseAdmin
      .from("creator_metrics")
      .upsert(
        {
          user_id: userId,
          platform: provider,
          followers: scanData.stats.followers,
          avg_views_10: scanData.stats.avg_views,
          engagement_rate_10: scanData.stats.engagement_rate,
          video_count: scanData.stats.total_videos,
          top_videos: scanData.top_content.slice(0, 5), // Store top 5
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );

    if (metricsError) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "write_metrics",
        db_result: "failure",
        db_error: metricsError.message,
        error_code: metricsError.code || "METRICS_UPDATE_FAILED",
      });
      console.warn(`Failed to update metrics: ${metricsError.message}`);
    } else {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "write_metrics",
        db_result: "success",
      });
    }

    // Update creators table with niche (non-blocking - log but continue on failure)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "write_niche",
    });

    const { error: nicheError } = await supabaseAdmin
      .from("creators")
      .upsert(
        {
          user_id: userId,
          niche: scanData.niche.primary,
          niche_json: scanData.niche,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (nicheError) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "write_niche",
        db_result: "failure",
        db_error: nicheError.message,
        error_code: nicheError.code || "NICHE_UPDATE_FAILED",
      });
      console.warn(`Failed to update niche: ${nicheError.message}`);
    } else {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider,
        step: "write_niche",
        db_result: "success",
      });
    }

    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "scan_complete",
      db_result: "success",
    });

    const statusLabel = scanStatus === "scanned_partial" ? "✅ (partial)" : "✅";
    console.log(
      `[scanProviderAccount] ${statusLabel} Scan complete for userId=${userId}, provider=${provider}, version=${newVersion}, niche=${scanData.niche.primary}`
    );

    return scanData;
  } catch (error: any) {
    // Set status to 'failed' on error (non-blocking - log if it fails)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider,
      step: "scan_failed",
      error_code: error.code || "SCAN_ERROR",
      http_error: error.message,
    });

    try {
      await supabaseAdmin
        .from("social_accounts")
        .update({ scan_status: "failed" })
        .eq("user_id", userId)
        .eq("platform", provider);
    } catch (statusUpdateError) {
      console.warn(`Failed to update scan status to 'failed': ${statusUpdateError}`);
    }

    throw error;
  }
}

/**
 * Scan YouTube account
 */
async function scanYouTube(
  accessToken: string,
  scanRunId: string,
  userId: string,
  provider: string
): Promise<ScanResult> {
  // Step 1: Fetch channel info
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "fetch_youtube_channel",
    endpoint: "channels?part=snippet,statistics&mine=true",
  });

  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!channelResponse.ok) {
    const errorText = await channelResponse.text().catch(() => "");
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_youtube_channel",
      endpoint: "channels?part=snippet,statistics&mine=true",
      http_status: channelResponse.status,
      http_error: `YouTube API error: ${channelResponse.status}`,
      error_code: "YT_CHANNEL_FETCH_FAILED",
      response_body: errorText.length < 1000 ? errorText : undefined,
    });
    throw new Error(`YouTube API error: ${channelResponse.status}`);
  }

  const channelData = await channelResponse.json();
  const channel = channelData.items?.[0];
  if (!channel) {
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_youtube_channel",
      endpoint: "channels?part=snippet,statistics&mine=true",
      http_status: channelResponse.status,
      http_error: "No channel found in response",
      error_code: "YT_NO_CHANNEL",
    });
    throw new Error("No YouTube channel found");
  }

  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "fetch_youtube_channel",
    endpoint: "channels?part=snippet,statistics&mine=true",
    http_status: channelResponse.status,
    db_result: "success",
  });

  // Step 2: Fetch videos
  const uploadsPlaylistId =
    channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  let videos: any[] = [];
  if (uploadsPlaylistId) {
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_youtube_videos",
      endpoint: `playlistItems?playlistId=${uploadsPlaylistId}&maxResults=10`,
    });

    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&order=date`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (videosResponse.ok) {
      const videosData = await videosResponse.json();
      const videoIds = videosData.items
        ?.map((item: any) => item.contentDetails.videoId)
        .join(",");

      if (videoIds) {
        logScanStep({
          scan_run_id: scanRunId,
          user_id: userId,
          provider: provider as Provider,
          step: "fetch_youtube_video_stats",
          endpoint: `videos?part=statistics,snippet&id=${videoIds.substring(0, 50)}...`,
        });

        const statsResponse = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          videos = statsData.items || [];
          
          logScanStep({
            scan_run_id: scanRunId,
            user_id: userId,
            provider: provider as Provider,
            step: "fetch_youtube_video_stats",
            endpoint: "videos?part=statistics,snippet",
            http_status: statsResponse.status,
            db_result: "success",
          });
        } else {
          const errorText = await statsResponse.text().catch(() => "");
          logScanStep({
            scan_run_id: scanRunId,
            user_id: userId,
            provider: provider as Provider,
            step: "fetch_youtube_video_stats",
            endpoint: "videos?part=statistics,snippet",
            http_status: statsResponse.status,
            http_error: `Failed to fetch video statistics: ${statsResponse.status}`,
            error_code: "YT_VIDEO_STATS_FETCH_FAILED",
            response_body: errorText.length < 1000 ? errorText : undefined,
          });
          // Continue without videos - non-fatal
        }
      } else {
        logScanStep({
          scan_run_id: scanRunId,
          user_id: userId,
          provider: provider as Provider,
          step: "fetch_youtube_videos",
          endpoint: "playlistItems",
          http_error: "No video IDs found in playlist response",
          error_code: "YT_NO_VIDEO_IDS",
        });
      }
    } else {
      const errorText = await videosResponse.text().catch(() => "");
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider: provider as Provider,
        step: "fetch_youtube_videos",
        endpoint: "playlistItems",
        http_status: videosResponse.status,
        http_error: `Failed to fetch videos: ${videosResponse.status}`,
        error_code: "YT_VIDEOS_FETCH_FAILED",
        response_body: errorText.length < 1000 ? errorText : undefined,
      });
      // Continue without videos - non-fatal
    }
  } else {
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_youtube_videos",
      endpoint: "playlistItems",
      http_error: "No uploads playlist ID found",
      error_code: "YT_NO_UPLOADS_PLAYLIST",
    });
  }

  // Step 3: Calculate metrics
  const subscribers = parseInt(channel.statistics?.subscriberCount || "0", 10);
  const totalViews = parseInt(channel.statistics?.viewCount || "0", 10);
  const videoCount = parseInt(channel.statistics?.videoCount || "0", 10);

  let avgViews = 0;
  let engagementRate = 0;
  const topContent: ScanResult["top_content"] = [];

  if (videos.length > 0) {
    let totalViewsSum = 0;
    let totalEngagement = 0;

    for (const video of videos.slice(0, 10)) {
      const views = parseInt(video.statistics?.viewCount || "0", 10);
      const likes = parseInt(video.statistics?.likeCount || "0", 10);
      const comments = parseInt(video.statistics?.commentCount || "0", 10);

      totalViewsSum += views;
      const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
      totalEngagement += engagement;

      topContent.push({
        title: video.snippet?.title || "Untitled",
        views: views,
        url: `https://www.youtube.com/watch?v=${video.id}`,
      });
    }

    avgViews = videos.length > 0 ? totalViewsSum / videos.length : 0;
    engagementRate = videos.length > 0 ? totalEngagement / videos.length : 0;
  }

  // Sort by views
  topContent.sort((a, b) => b.views - a.views);

  // Log computed metrics
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "compute_youtube_metrics",
    db_result: "success",
  });

  const result = {
    profile: {
      handle: channel.snippet?.customUrl || channel.snippet?.title || null,
      display_name: channel.snippet?.title || null,
      avatar_url: channel.snippet?.thumbnails?.default?.url || null,
      bio: channel.snippet?.description || null,
    },
    stats: {
      followers: subscribers || null,
      avg_views: avgViews > 0 ? Math.round(avgViews) : null,
      engagement_rate: engagementRate > 0 ? engagementRate : null,
      total_videos: videoCount || null,
      likes: null, // YouTube doesn't have total likes
    },
    top_content: topContent.slice(0, 5),
    niche: {
      primary: "", // Will be inferred
      secondary: [],
      confidence: 0,
      keywords: [],
    },
  };

  // Log final computed values
  console.log(`[scanYouTube] ${scanRunId}: Computed metrics for userId=${userId}:`, {
    followers: result.stats.followers,
    avg_views: result.stats.avg_views,
    engagement_rate: result.stats.engagement_rate,
    total_videos: result.stats.total_videos,
    top_content_count: result.top_content.length,
  });

  return result;
}

/**
 * Scan TikTok account
 */
async function scanTikTok(
  accessToken: string,
  scanRunId: string,
  userId: string,
  provider: string
): Promise<ScanResult> {
  const endpoint = "https://open.tiktokapis.com/v2/user/info/";
  
  // Fetch user info (try with stats fields first)
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "fetch_profile",
    endpoint: "/v2/user/info/",
  });

  const userResponse = await fetch(
    `${endpoint}?fields=open_id,avatar_url,display_name,username,bio_description,follower_count,video_count,likes_count`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!userResponse.ok) {
    // Log response body for debugging (TikTok error JSON is safe to log)
    let errorBody = "";
    try {
      const errorText = await userResponse.text();
      if (errorText && errorText.length < 1000) {
        errorBody = errorText;
        try {
          JSON.parse(errorText); // Validate it's JSON
        } catch {
          errorBody = ""; // Not JSON, don't log
        }
      }
    } catch {
      // Ignore error body parsing failures
    }

    // Try with just basic fields (stats scope may not be available)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_profile",
      endpoint: "/v2/user/info/",
      http_status: userResponse.status,
      http_error: userResponse.status === 401 || userResponse.status === 403 
        ? "Missing scope or invalid token" 
        : `HTTP ${userResponse.status}`,
      error_code: userResponse.status === 401 || userResponse.status === 403 
        ? "TT_MISSING_SCOPE" 
        : "API_ERROR",
      response_body: errorBody || undefined,
    });

    const basicResponse = await fetch(
      `${endpoint}?fields=open_id,avatar_url,display_name,username`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!basicResponse.ok) {
      // Log response body for debugging
      let basicErrorBody = "";
      try {
        const errorText = await basicResponse.text();
        if (errorText && errorText.length < 1000) {
          basicErrorBody = errorText;
          try {
            JSON.parse(errorText);
          } catch {
            basicErrorBody = "";
          }
        }
      } catch {
        // Ignore
      }

      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider: provider as Provider,
        step: "fetch_profile",
        endpoint: "/v2/user/info/ (basic fallback)",
        http_status: basicResponse.status,
        http_error: `Failed to fetch basic profile: HTTP ${basicResponse.status}`,
        error_code: basicResponse.status === 401 || basicResponse.status === 403 ? "TT_MISSING_SCOPE" : "API_ERROR",
        response_body: basicErrorBody || undefined,
      });

      // This is fatal - cannot proceed without basic profile
      const error: any = new Error(`TikTok API error: ${basicResponse.status}${basicResponse.status === 401 || basicResponse.status === 403 ? " (missing scope or invalid token)" : ""}`);
      error.status = basicResponse.status;
      error.code = basicResponse.status === 401 || basicResponse.status === 403 ? "TT_MISSING_SCOPE" : "API_ERROR";
      throw error;
    }

    const userData = await basicResponse.json();
    const user = userData.data?.user;

    if (!user) {
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider: provider as Provider,
        step: "fetch_profile",
        endpoint: "/v2/user/info/ (basic fallback)",
        http_status: basicResponse.status,
        http_error: "No user data in response",
        error_code: "API_ERROR",
      });
      throw new Error("No user data in TikTok response");
    }

    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_profile",
      endpoint: "/v2/user/info/ (basic fallback)",
      http_status: basicResponse.status,
      db_result: "success",
    });

    // Return partial data (profile only, no stats) - mark as partial
    return {
      profile: {
        handle: user?.username || null,
        display_name: user?.display_name || null,
        avatar_url: user?.avatar_url || null,
        bio: null, // Bio requires stats scope
      },
      stats: {
        followers: null,
        avg_views: null,
        engagement_rate: null,
        total_videos: null,
        likes: null,
      },
      top_content: [],
      niche: {
        primary: "",
        secondary: [],
        confidence: 0,
        keywords: [],
      },
    };
  }

  const userData = await userResponse.json();
  const user = userData.data?.user;

  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "fetch_profile",
    endpoint: "/v2/user/info/",
    http_status: userResponse.status,
    db_result: "success",
  });

  // Fetch videos (if scope available - non-blocking)
  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "fetch_videos",
    endpoint: "/v2/video/list/",
  });

  let videos: any[] = [];
  try {
    const videosResponse = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?max_count=10",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: ["id", "title", "cover_image_url", "create_time", "video_description"],
        }),
      }
    );

    if (videosResponse.ok) {
      const videosData = await videosResponse.json();
      videos = videosData.data?.videos || [];
      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider: provider as Provider,
        step: "fetch_videos",
        endpoint: "/v2/video/list/",
        http_status: videosResponse.status,
        db_result: "success",
      });
    } else {
      // Log response body for debugging (safe to log TikTok error JSON)
      let videoErrorBody = "";
      try {
        const errorText = await videosResponse.text();
        if (errorText && errorText.length < 1000) {
          videoErrorBody = errorText;
          try {
            JSON.parse(errorText);
          } catch {
            videoErrorBody = "";
          }
        }
      } catch {
        // Ignore
      }

      logScanStep({
        scan_run_id: scanRunId,
        user_id: userId,
        provider: provider as Provider,
        step: "fetch_videos",
        endpoint: "/v2/video/list/",
        http_status: videosResponse.status,
        http_error: videosResponse.status === 401 || videosResponse.status === 403 
          ? "Missing video.list scope" 
          : `HTTP ${videosResponse.status}`,
        error_code: videosResponse.status === 401 || videosResponse.status === 403 
          ? "TT_MISSING_SCOPE" 
          : "API_ERROR",
        response_body: videoErrorBody || undefined,
      });
      // Continue without videos - non-fatal
    }
  } catch (e: any) {
    // Scope not available, continue without videos (non-blocking)
    logScanStep({
      scan_run_id: scanRunId,
      user_id: userId,
      provider: provider as Provider,
      step: "fetch_videos",
      endpoint: "/v2/video/list/",
      http_error: e.message,
      error_code: "VIDEO_FETCH_FAILED",
    });
  }

  const topContent: ScanResult["top_content"] = videos.slice(0, 5).map((video: any) => ({
    title: video.title || video.video_description || "Untitled",
    views: 0, // TikTok API doesn't provide view counts in list endpoint
    url: `https://www.tiktok.com/@${user?.username}/video/${video.id}`,
  }));

  // TikTok stats require user.info.stats scope (may not be available)
  const followerCount = userData.data?.user?.follower_count || null;
  const videoCount = userData.data?.user?.video_count || null;
  const likesCount = userData.data?.user?.likes_count || null;

  logScanStep({
    scan_run_id: scanRunId,
    user_id: userId,
    provider: provider as Provider,
    step: "compute_metrics",
    db_result: "success",
  });

  return {
    profile: {
      handle: user?.username || null,
      display_name: user?.display_name || null,
      avatar_url: user?.avatar_url || null,
      bio: user?.bio_description || null,
    },
    stats: {
      followers: followerCount || null,
      avg_views: null, // TikTok doesn't provide avg views in user info
      engagement_rate: null,
      total_videos: videoCount || null,
      likes: likesCount || null,
    },
    top_content: topContent,
    niche: {
      primary: "",
      secondary: [],
      confidence: 0,
      keywords: [],
    },
  };
}


