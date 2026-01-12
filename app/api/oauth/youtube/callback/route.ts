import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";
import { buildCreatorProfile } from "@/lib/profileBuilder";
import { scanProviderAccount } from "@/lib/scanProviderAccount";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

async function updateScanJob(jobId: string, updates: { status?: string; progress?: number; error?: string }) {
  try {
    if (jobId === "temp-job-id") {
      // Skip update if using temp job ID (Supabase not configured)
      return;
    }
    await supabaseAdmin
      .from("scan_jobs")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch (err) {
    // Silently fail if Supabase admin isn't configured
    console.warn("⚠️ Could not update scan job (Supabase admin may not be configured)");
  }
}

async function fetchYouTubeChannel(accessToken: string) {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`YouTube API error: ${response.status} ${error}`);
    }

    return await response.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("YouTube API request timed out after 30 seconds");
    }
    throw err;
  }
}

async function fetchYouTubeVideos(accessToken: string, maxResults: number = 10) {
  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for video fetching (longer since it makes multiple calls)

  try {
    // First, get the channel's uploads playlist
    const channelResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      }
    );

    if (!channelResponse.ok) {
      throw new Error("Failed to fetch channel uploads playlist");
    }

    const channelData = await channelResponse.json();
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      throw new Error("No uploads playlist found");
    }

    // Get videos from the uploads playlist
    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&order=date`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      }
    );

    if (!videosResponse.ok) {
      throw new Error("Failed to fetch videos");
    }

    const videosData = await videosResponse.json();
    const videoIds = videosData.items?.map((item: any) => item.contentDetails.videoId).join(",");

    if (!videoIds) {
      clearTimeout(timeoutId);
      return { items: [] };
    }

    // Get detailed stats for each video
    const statsResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!statsResponse.ok) {
      throw new Error("Failed to fetch video statistics");
    }

    return await statsResponse.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("YouTube API request timed out after 60 seconds");
    }
    throw err;
  }
}

function calculateMetrics(videos: any[]) {
  if (videos.length === 0) {
    return {
      avg_views_10: 0,
      engagement_rate_10: 0,
      top_videos: [],
    };
  }

  let totalViews = 0;
  let totalEngagement = 0;
  const topVideos: any[] = [];

  for (const video of videos.slice(0, 10)) {
    const views = parseInt(video.statistics?.viewCount || "0", 10);
    const likes = parseInt(video.statistics?.likeCount || "0", 10);
    const comments = parseInt(video.statistics?.commentCount || "0", 10);

    totalViews += views;
    const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
    totalEngagement += engagement;

    topVideos.push({
      title: video.snippet?.title || "Untitled",
      url: `https://www.youtube.com/watch?v=${video.id}`,
      views: views,
      likes: likes,
      comments: comments,
      publishedAt: video.snippet?.publishedAt || null,
      description: video.snippet?.description || null, // Include description for topic extraction
    });
  }

  const avgViews = videos.length > 0 ? totalViews / videos.length : 0;
  const avgEngagement = videos.length > 0 ? totalEngagement / videos.length : 0;

  // Sort top videos by views
  topVideos.sort((a, b) => b.views - a.views);

  return {
    avg_views_10: Math.round(avgViews),
    engagement_rate_10: Math.round(avgEngagement * 100) / 100,
    top_videos: topVideos.slice(0, 5), // Keep top 5
  };
}

export async function GET(req: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:149',message:'GET handler entry',data:{url:req.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    console.log("📥 YouTube OAuth callback received");
    
    // Get the origin from the request URL for absolute redirects
    const origin = new URL(req.url).origin;
    
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:157',message:'Parsed query params',data:{hasCode:!!code,hasState:!!state,hasError:!!error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("❌ OAuth error from Google:", error);
      return NextResponse.redirect(`${origin}/onboarding/scanning?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      console.error("❌ Missing code or state:", { code: !!code, state: !!state });
      return NextResponse.redirect(`${origin}/onboarding/scanning?error=Missing code or state`);
    }

    // Decode and validate state
    let stateData;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:170',message:'Before state decode',data:{stateLength:state?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      console.log("✅ State decoded:", { userId: stateData.userId });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:173',message:'State decoded successfully',data:{userId:stateData?.userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:174',message:'State decode failed',data:{error:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error("❌ Failed to decode state:", err);
      return NextResponse.redirect(`${origin}/onboarding/scanning?error=Invalid state`);
    }

    const { userId } = stateData;
    if (!userId) {
      console.error("❌ No userId in state");
      return NextResponse.redirect(`${origin}/onboarding/scanning?error=Invalid state`);
    }

    // Validate environment variables
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    let redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();
    
    // If not explicitly set, derive from app URL
    if (!redirectUri) {
      try {
        const { getOAuthRedirectUri } = await import("@/lib/appConfig");
        redirectUri = getOAuthRedirectUri('/api/oauth/youtube/callback', req);
      } catch (error: any) {
        console.error("Could not determine YouTube redirect URI:", error);
        // Fallback to localhost for development only
        redirectUri = "http://localhost:3000/api/oauth/youtube/callback";
      }
    }

    console.log("🔍 Env check:", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri,
    });

    if (!clientId || !clientSecret) {
      console.error("❌ Missing YouTube credentials");
      return NextResponse.redirect(`${origin}/onboarding/scanning?error=YouTube not configured`);
    }

    // Create scan job
    console.log("📝 Creating scan job for user:", userId);
    let scanJob;
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:203',message:'Before scan job creation',data:{userId,hasSupabaseAdmin:!!supabaseAdmin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const { data, error: jobError } = await supabaseAdmin
        .from("scan_jobs")
        .insert({
          user_id: userId,
          platform: "youtube",
          status: "queued",
          progress: 0,
        })
        .select()
        .single();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:214',message:'Scan job insert result',data:{hasData:!!data,hasError:!!jobError,errorMessage:jobError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (jobError) {
        console.error("❌ Failed to create scan job:", jobError);
        // If Supabase admin isn't configured, continue without scan job tracking
        if (jobError.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || jobError.message?.includes("MissingEnvVars")) {
          console.warn("⚠️ Supabase admin not configured, continuing without scan job tracking");
          scanJob = { id: "temp-job-id" };
        } else {
          return NextResponse.redirect(`${origin}/onboarding/scanning?error=Failed to create scan job: ${encodeURIComponent(jobError.message)}`);
        }
      } else {
        scanJob = data;
        console.log("✅ Scan job created:", scanJob.id);
      }
    } catch (err: any) {
      console.error("❌ Exception creating scan job:", err);
      if (err.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || err.message?.includes("MissingEnvVars")) {
        console.warn("⚠️ Supabase admin not configured, continuing without scan job tracking");
        scanJob = { id: "temp-job-id" };
      } else {
        return NextResponse.redirect(`${origin}/onboarding/scanning?error=Failed to create scan job`);
      }
    }

    // Exchange code for tokens
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:238',message:'Before token exchange',data:{scanJobId:scanJob.id,hasClientId:!!clientId,hasClientSecret:!!clientSecret,hasCode:!!code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    await updateScanJob(scanJob.id, { status: "running", progress: 10 });

    // Add timeout to token exchange to prevent hanging
    console.log("🔄 Exchanging code for token...");
    const tokenController = new AbortController();
    const tokenTimeoutId = setTimeout(() => tokenController.abort(), 30000); // 30 second timeout

    let tokenResponse;
    try {
      tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        signal: tokenController.signal,
      });
      clearTimeout(tokenTimeoutId);
    } catch (err: any) {
      clearTimeout(tokenTimeoutId);
      if (err.name === 'AbortError') {
        console.error("❌ Token exchange timed out");
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: "Token exchange timed out after 30 seconds",
        });
        return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=Token exchange timed out`);
      }
      throw err;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:255',message:'Token exchange response',data:{status:tokenResponse.status,ok:tokenResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:256',message:'Token exchange failed',data:{status:tokenResponse.status,errorText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      await updateScanJob(scanJob.id, {
        status: "failed",
        error: `Token exchange failed: ${errorText}`,
      });
      return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=Token exchange failed`);
    }

    const tokens = await tokenResponse.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:264',message:'Tokens received',data:{hasAccessToken:!!tokens.access_token,hasRefreshToken:!!tokens.refresh_token},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Get channel ID first (needed for platform_user_id)
    console.log("📺 Fetching YouTube channel ID...");
    await updateScanJob(scanJob.id, { progress: 20 });

    let channelData;
    try {
      channelData = await fetchYouTubeChannel(accessToken);
    } catch (err: any) {
      console.error("❌ Error fetching channel:", err.message);
      await updateScanJob(scanJob.id, {
        status: "failed",
        error: `Failed to fetch channel: ${err.message}`,
      });
      return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(err.message)}`);
    }
    const channel = channelData.items?.[0];
    if (!channel) {
      await updateScanJob(scanJob.id, {
        status: "failed",
        error: "No channel found",
      });
      return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=No channel found`);
    }

    const platformUserId = channel.id;

    // Store social account with tokens and scan_status='connected'
    try {
      console.log("💾 Storing social account with tokens...");
      const { error: accountError } = await supabaseAdmin
        .from("social_accounts")
        .upsert(
          {
            user_id: userId,
            platform: "youtube",
            platform_user_id: platformUserId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            scan_status: "connected", // OAuth complete, scan pending
          },
          { onConflict: "user_id,platform" }
        );

      if (accountError) {
        console.error("❌ Error storing social account:", accountError);
        if (!accountError.message?.includes("SUPABASE_SERVICE_ROLE_KEY") && !accountError.message?.includes("MissingEnvVars")) {
          throw accountError;
        }
      } else {
        console.log("✅ Social account stored with tokens");
      }
    } catch (err: any) {
      if (err.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || err.message?.includes("MissingEnvVars")) {
        console.warn("⚠️ Supabase admin not configured, skipping social account storage");
      } else {
        throw err;
      }
    }

    // Use unified scan pipeline
    console.log("🔍 Running unified scan pipeline...");
    await updateScanJob(scanJob.id, { progress: 40, status: "running" });
    
    try {
      await scanProviderAccount(userId, "youtube");
      console.log("✅ Scan pipeline completed");
      await updateScanJob(scanJob.id, { progress: 80 });
    } catch (scanErr: any) {
      console.error("❌ Scan pipeline failed:", scanErr.message);
      await updateScanJob(scanJob.id, {
        status: "failed",
        error: `Scan failed: ${scanErr.message}`,
      });
      return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(scanErr.message)}`);
    }

    // Generate media kit after metrics are stored
    try {
      console.log("📦 Generating media kit...");
      await updateScanJob(scanJob.id, { progress: 90 });
      
      // Fetch profile name for headline
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .single();
      
      const profileName = profile?.full_name || profile?.username || undefined;
      await generateAndStoreMediaKit(userId, profileName);
      console.log("✅ Media kit generated");
    } catch (kitErr) {
      console.warn("⚠️ Media kit generation failed (non-blocking):", kitErr);
    }

    // Update progress to 90% before final steps
    await updateScanJob(scanJob.id, { progress: 90 });

    // Build/update creator profile after scan (non-blocking - don't let this fail the whole flow)
    try {
      console.log("🔍 Building creator profile...");
      await buildCreatorProfile(userId);
      console.log("✅ Creator profile built");
    } catch (profileErr) {
      console.warn("⚠️ Creator profile build failed (non-blocking):", profileErr);
    }

    // Clear old brand recommendations and cache for this user to prevent cross-account leakage (non-blocking)
    try {
      console.log("🧹 Clearing old brand recommendations for user:", userId);
      const { error: clearError } = await supabaseAdmin
        .from("brand_recommendations")
        .delete()
        .eq("user_id", userId)
        .eq("status", "new"); // Only clear unsaved matches
      
      if (clearError) {
        console.warn("⚠️ Failed to clear old recommendations (non-blocking):", clearError);
      } else {
        console.log("✅ Old recommendations cleared");
      }
      
      // Also clear brand candidate cache for this user (to force fresh generation with new account data)
      const { error: cacheClearError } = await supabaseAdmin
        .from("cache_brand_candidates")
        .delete()
        .eq("user_id", userId);
      
      if (cacheClearError) {
        console.warn("⚠️ Failed to clear candidate cache (non-blocking):", cacheClearError);
      } else {
        console.log("✅ Candidate cache cleared for user:", userId);
      }
    } catch (clearErr) {
      console.warn("⚠️ Error clearing recommendations/cache (non-blocking):", clearErr);
    }

    // CRITICAL: Mark scan job as complete BEFORE triggering brand generation
    // This ensures the UI can redirect even if brand generation fails
    await updateScanJob(scanJob.id, { status: "complete", progress: 100 });
    console.log("✅ Scan job marked complete");

    // Trigger brand generation in background (non-blocking, fire-and-forget)
    // This happens after we mark the job complete so the UI can redirect immediately
    // Don't await - let it run in background
    fetch(`${origin}/api/brands/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, mode: "replace" }),
    }).catch((err) => {
      console.warn("⚠️ Failed to trigger brand generation (non-blocking):", err);
    });

    // ALWAYS redirect to scanning page - it will detect completion and redirect to home
    console.log("✅ Redirecting to scanning page");
    return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}`);
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/youtube/callback/route.ts:393',message:'Uncaught error in catch block',data:{errorMessage:error?.message,errorStack:error?.stack?.substring(0,200),errorName:error?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.error("❌ YouTube callback error:", error);
    console.error("Error stack:", error.stack);
    console.error("Error message:", error.message);
    
    // Get the origin from the request URL for absolute redirects
    const origin = new URL(req.url).origin;
    
    // Try to get job ID from state if available
    const searchParams = req.nextUrl.searchParams;
    const state = searchParams.get("state");
    let jobId = null;
    
    try {
      if (state) {
        const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
        // Try to find the most recent job for this user (only if Supabase is configured)
        try {
          const { data: jobs } = await supabaseAdmin
            .from("scan_jobs")
            .select("id")
            .eq("user_id", stateData.userId)
            .eq("platform", "youtube")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          jobId = jobs?.id;
        } catch (dbErr) {
          // Supabase might not be configured, that's ok
          console.warn("⚠️ Could not fetch job ID (Supabase may not be configured)");
        }
      }
    } catch (parseErr) {
      console.warn("⚠️ Could not parse state for error handling");
    }

    const errorMessage = error.message || error.toString() || "Scan failed";
    
    if (jobId && jobId !== "temp-job-id") {
      try {
        await updateScanJob(jobId, {
          status: "failed",
          error: errorMessage,
        });
      } catch (updateErr) {
        console.warn("⚠️ Could not update scan job status");
      }
      return NextResponse.redirect(`${origin}/onboarding/scanning?job=${jobId}&error=${encodeURIComponent(errorMessage)}`);
    }

    return NextResponse.redirect(`${origin}/onboarding/scanning?error=${encodeURIComponent(errorMessage)}`);
  }
}

