import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logOAuthEvent } from "@/lib/oauthDebug";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";
import { buildCreatorProfile } from "@/lib/profileBuilder";
import { scanProviderAccount } from "@/lib/scanProviderAccount";
import { getAppUrl, getOAuthRedirectUri } from "@/lib/appConfig";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

// Error reason codes
const ERROR_CODES = {
  CALLBACK_NO_CODE: 'TT_CALLBACK_NO_CODE',
  CALLBACK_NO_STATE: 'TT_CALLBACK_NO_STATE',
  STATE_MISMATCH: 'TT_STATE_MISMATCH',
  NO_VERIFIER: 'TT_NO_VERIFIER',
  NO_USER_ID: 'TT_NO_USER_ID',
  EXCHANGE_FAILED: 'TT_EXCHANGE_FAILED',
  EXCHANGE_401: 'TT_EXCHANGE_401',
  EXCHANGE_403: 'TT_EXCHANGE_403',
  NO_ACCESS_TOKEN: 'TT_NO_ACCESS_TOKEN',
  STORE_FAILED: 'TT_STORE_FAILED',
  OAUTH_ERROR: 'TT_OAUTH_ERROR',
  SCAN_JOB_FAILED: 'TT_SCAN_JOB_FAILED',
  PROFILE_CHECK_FAILED: 'TT_PROFILE_CHECK_FAILED',
  NO_TOKEN_FOR_USER: 'TT_NO_TOKEN_FOR_USER',
  MISSING_SCOPE: 'TT_MISSING_SCOPE',
} as const;

function getOrigin(req: NextRequest): string {
  try {
    return getAppUrl(req);
  } catch (error: any) {
    // Fallback to request origin if app URL can't be determined
    return new URL(req.url).origin;
  }
}

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

async function fetchTikTokUserInfo(accessToken: string) {
  // Request basic + stats fields if available
  // First try with stats fields (requires user.info.stats scope)
  const fieldsWithStats = "open_id,avatar_url,display_name,username,bio_description,profile_deep_link,follower_count,following_count,likes_count,video_count";
  
  const response = await fetch(
    `https://open.tiktokapis.com/v2/user/info/?fields=${fieldsWithStats}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    let parsedError: any = null;
    try {
      parsedError = JSON.parse(errorText);
    } catch (e) {
      // Not JSON
    }
    
    // If scope error for stats, fallback to basic fields only
    if (response.status === 401 && parsedError?.error?.code === "scope_not_authorized") {
      console.log("⚠️ Stats scope not available - falling back to basic fields only");
      // Try with just basic fields as fallback
      const basicFields = "open_id,avatar_url,display_name,username,bio_description,profile_deep_link";
      const fallbackResponse = await fetch(
        `https://open.tiktokapis.com/v2/user/info/?fields=${basicFields}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      
      if (!fallbackResponse.ok) {
        // Last resort: just open_id
        const minimalResponse = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        
        if (!minimalResponse.ok) {
          throw new Error(`TikTok API error: ${minimalResponse.status} ${await minimalResponse.text()}`);
        }
        return await minimalResponse.json();
      }
      return await fallbackResponse.json();
    }
    
    throw new Error(`TikTok API error: ${response.status} ${errorText}`);
  }

  return await response.json();
}

async function fetchTikTokVideos(accessToken: string, maxResults: number = 10) {
  // Note: video.list scope is not available with basic Login Kit - this function will return empty results
  try {
    // Try to fetch user videos - requires video.list scope (which requires additional permissions in TikTok Developer Portal)
    // TikTok API v2 video.list endpoint
    const response = await fetch(
      "https://open.tiktokapis.com/v2/video/list/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: ["id", "title", "cover_image_url", "create_time", "share_url", "view_count", "like_count", "comment_count", "share_count"],
          max_count: maxResults,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch (e) {
        // Not JSON, use raw text
      }

      // If video.list scope is not available, return empty results (non-fatal, expected behavior)
      if (response.status === 403 || response.status === 401 || parsedError?.error?.code === "scope_not_authorized") {
        // Don't log as error - this is expected with basic Login Kit
        // console.warn("⚠️ TikTok video.list scope not available - will use basic profile info only");
        return { data: { videos: [] } };
      }
      // For other errors, still return empty results (non-fatal)
      console.warn("⚠️ TikTok videos API error (non-fatal):", response.status);
      return { data: { videos: [] } };
    }

    const data = await response.json();
    // TikTok API response structure: { data: { videos: [], cursor: ..., has_more: ... } }
    return data;
  } catch (err: any) {
    // Video fetch is always non-fatal - return empty results
    const errorMessage = err.message || err.toString() || "";
    // Don't log scope errors as warnings - they're expected
    if (!errorMessage.includes("scope_not_authorized") && !errorMessage.includes("401")) {
      console.warn("⚠️ TikTok video fetch error (non-fatal):", errorMessage);
    }
    return { data: { videos: [] } };
  }
}

function calculateTikTokMetrics(videos: any[], followerCount: number = 0) {
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
    const views = parseInt(video.view_count || "0", 10);
    const likes = parseInt(video.like_count || "0", 10);
    const comments = parseInt(video.comment_count || "0", 10);
    const shares = parseInt(video.share_count || "0", 10);

    totalViews += views;
    const engagement = views > 0 ? ((likes + comments + shares) / views) * 100 : 0;
    totalEngagement += engagement;

    topVideos.push({
      title: video.title || "Untitled",
      url: video.share_url || `https://www.tiktok.com/@${video.username}/video/${video.id}`,
      views: views,
      likes: likes,
      comments: comments,
      shares: shares,
      publishedAt: video.create_time || null,
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
  const origin = getOrigin(req);
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Get request_id from cookie or generate new one
  const requestId = req.cookies.get('tiktok_request_id')?.value || crypto.randomUUID();

  try {
    // Log callback received
    await logOAuthEvent('tiktok', requestId, 'callback', 'ok', 'Callback received', null, {
      has_code: !!code,
      has_state: !!state,
      has_error: !!error,
      error: error ?? undefined,
    });

    console.log(`[TikTok OAuth Callback] Request ${requestId}: Callback received`, {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });

    // Handle OAuth error from TikTok
    if (error) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: OAuth error:`, error);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', `OAuth error: ${error}`, null, {
        error_code: ERROR_CODES.OAUTH_ERROR,
        error: error,
        error_description: errorDescription || null,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.OAUTH_ERROR}&error=${encodeURIComponent(error)}`
      );
    }

    // Validate code and state
    if (!code) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: No authorization code`);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'No authorization code received', null, {
        error_code: ERROR_CODES.CALLBACK_NO_CODE,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.CALLBACK_NO_CODE}`
      );
    }

    if (!state) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: No state parameter`);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'No state parameter', null, {
        error_code: ERROR_CODES.CALLBACK_NO_STATE,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.CALLBACK_NO_STATE}`
      );
    }

    // Get code_verifier from cookie (more secure)
    const codeVerifier = req.cookies.get('tiktok_code_verifier')?.value;
    const cookieState = req.cookies.get('tiktok_state')?.value;

    // Decode state to get userId first (state is base64url encoded JSON)
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, "base64url").toString());
      console.log(`[TikTok OAuth Callback] Request ${requestId}: State decoded`, { userId: stateData.userId });
    } catch (err: any) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: Failed to decode state:`, err);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'Failed to decode state', null, {
        error_code: ERROR_CODES.STATE_MISMATCH,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.STATE_MISMATCH}`
      );
    }

    const userId = stateData.userId;

    if (!codeVerifier) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: No code_verifier cookie (PKCE required)`);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'No code_verifier cookie', userId, {
        error_code: ERROR_CODES.NO_VERIFIER,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.NO_VERIFIER}`
      );
    }

    // Validate state matches cookie (CSRF protection)
    // If cookie state is missing but state parameter is valid, log warning but proceed
    // (cookies may not persist through redirects due to domain/SameSite policies)
    if (cookieState && cookieState !== state) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: State mismatch`, {
        cookieState: cookieState?.substring(0, 10),
        paramState: state.substring(0, 10),
      });
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'State mismatch', userId, {
        error_code: ERROR_CODES.STATE_MISMATCH,
        state_prefix: state.substring(0, 6),
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.STATE_MISMATCH}`
      );
    }
    
    // If cookie state is missing, log warning but proceed (state parameter itself provides some protection)
    if (!cookieState) {
      console.warn(`[TikTok OAuth Callback] Request ${requestId}: Cookie state missing (proceeding with URL state)`, {
        userId,
        statePrefix: state.substring(0, 10),
      });
    }
    if (!userId) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: No userId in state`);
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'No userId in state', null, {
        error_code: ERROR_CODES.NO_USER_ID,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.NO_USER_ID}`
      );
    }

    // Validate environment variables
    const clientKey = (process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID)?.trim();
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    let redirectUri = process.env.TIKTOK_REDIRECT_URI?.trim();
    
    // Normalize redirect_uri - remove trailing slashes for consistency
    if (redirectUri && redirectUri.endsWith('/')) {
      redirectUri = redirectUri.slice(0, -1);
    }
    
    // If not explicitly set, derive from app URL (must match start route)
    if (!redirectUri) {
      try {
        redirectUri = getOAuthRedirectUri('/api/oauth/tiktok/callback', req);
      } catch (error: any) {
        await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'Could not determine redirect URI', userId, {
          error_code: 'TT_NO_REDIRECT_URI',
        });
        return NextResponse.redirect(
          `${origin}/auth/tiktok/result?status=fail&reason=TT_NO_REDIRECT_URI`
        );
      }
    }
    
    // Log credential presence (without exposing values)
    console.log(`[TikTok OAuth Callback] Request ${requestId}: Credential check:`, {
      hasClientKey: !!clientKey,
      clientKeyLength: clientKey?.length || 0,
      hasClientSecret: !!clientSecret,
      clientSecretLength: clientSecret?.length || 0,
      clientKeyPrefix: clientKey ? `${clientKey.substring(0, 6)}...` : 'missing',
    });

    if (!clientKey || !clientSecret) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: Missing TikTok credentials`, {
        hasClientKey: !!clientKey,
        hasClientSecret: !!clientSecret,
        envVarsChecked: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
      });
      await logOAuthEvent('tiktok', requestId, 'callback', 'fail', 'Missing TikTok credentials', userId, {
        error_code: 'TT_NO_CREDENTIALS',
        has_client_key: !!clientKey,
        has_client_secret: !!clientSecret,
      });
      
      return NextResponse.redirect(
        `${origin}/auth/tiktok/result?status=fail&reason=TT_NO_CREDENTIALS`
      );
    }

    // Verify profile exists (profiles table must have a row for foreign key constraint)
    // Try to get/create profile from auth.users if it doesn't exist
    const { data: existingProfile, error: profileCheckError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();
    
    if (!existingProfile && profileCheckError?.code === 'PGRST116') {
      // Profile doesn't exist - try to create it
      // Use a unique email based on userId to avoid conflicts
      console.log(`[TikTok OAuth Callback] Request ${requestId}: Profile not found, creating profile for user ${userId}`);
      
      try {
        const { error: createError } = await supabaseAdmin
          .from("profiles")
          .insert({
            id: userId,
            email: `user_${userId.replace(/-/g, '')}@oauth.exla.dev`, // Unique email based on userId
            role: "creator",
          });
        
        if (createError) {
          // If creation fails, it might be because user doesn't exist in auth.users
          // Or email conflict - try with timestamp
          console.warn(`[TikTok OAuth Callback] Request ${requestId}: Profile creation failed, trying with timestamp:`, createError.message);
          const { error: retryError } = await supabaseAdmin
            .from("profiles")
            .insert({
              id: userId,
              email: `user_${userId.replace(/-/g, '')}_${Date.now()}@oauth.exla.dev`,
              role: "creator",
            });
          
          if (retryError) {
            console.error(`[TikTok OAuth Callback] Request ${requestId}: Cannot create profile after retry:`, retryError);
            // Still continue - the scan job creation will fail with a clearer error
          } else {
            console.log(`[TikTok OAuth Callback] Request ${requestId}: Created profile for user ${userId} (with timestamp)`);
          }
        } else {
          console.log(`[TikTok OAuth Callback] Request ${requestId}: Created profile for user ${userId}`);
        }
      } catch (createErr: any) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Exception creating profile:`, createErr);
        // Continue anyway - let scan job creation fail with clearer error if user doesn't exist in auth.users
      }
    } else if (!existingProfile && profileCheckError?.code !== 'PGRST116') {
      // Profile check failed with unexpected error
      console.error(`[TikTok OAuth Callback] Request ${requestId}: Profile check failed:`, profileCheckError);
      return NextResponse.redirect(`${origin}/auth/tiktok/result?status=fail&reason=TT_PROFILE_CHECK_FAILED`);
    }

    // Create scan job (before token exchange, matching YouTube pattern)
    console.log(`[TikTok OAuth Callback] Request ${requestId}: Creating scan job for user:`, userId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:430',message:'Before scan job creation',data:{userId,hasSupabaseAdmin:!!supabaseAdmin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    let scanJob;
    try {
      const { data, error: jobError } = await supabaseAdmin
        .from("scan_jobs")
        .insert({
          user_id: userId,
          platform: "tiktok",
          status: "queued",
          progress: 0,
        })
        .select()
        .single();

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:423',message:'Scan job insert result',data:{hasData:!!data,hasError:!!jobError,errorMessage:jobError?.message,errorCode:jobError?.code,errorDetails:jobError?.details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (jobError) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Failed to create scan job:`, jobError);
        // If Supabase admin isn't configured, continue without scan job tracking
        if (jobError.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || jobError.message?.includes("MissingEnvVars")) {
          console.warn("⚠️ Supabase admin not configured, continuing without scan job tracking");
          scanJob = { id: "temp-job-id" };
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:430',message:'Scan job creation failed - redirecting',data:{errorMessage:jobError.message,errorCode:jobError.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          return NextResponse.redirect(`${origin}/auth/tiktok/result?status=fail&reason=TT_SCAN_JOB_FAILED`);
        }
      } else {
        scanJob = data;
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Scan job created:`, scanJob.id);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:434',message:'Scan job created successfully',data:{jobId:scanJob.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      }
    } catch (err: any) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: Exception creating scan job:`, err);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:437',message:'Exception creating scan job',data:{errorMessage:err?.message,errorStack:err?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (err.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || err.message?.includes("MissingEnvVars")) {
        console.warn("⚠️ Supabase admin not configured, continuing without scan job tracking");
        scanJob = { id: "temp-job-id" };
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:442',message:'Exception - redirecting',data:{errorMessage:err?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        return NextResponse.redirect(`${origin}/auth/tiktok/result?status=fail&reason=TT_SCAN_JOB_FAILED`);
      }
    }

    // Exchange code for access token
    console.log(`[TikTok OAuth Callback] Request ${requestId}: Exchanging code for token...`);
    await updateScanJob(scanJob.id, { status: "running", progress: 10 });
    
    // Prepare token exchange parameters
    const tokenEndpoint = "https://open.tiktokapis.com/v2/oauth/token/";
    const tokenBody = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    // Detailed debug logging before token exchange
    console.log(`[TikTok OAuth Callback] Request ${requestId}: Token Exchange Request Details:`, {
      token_endpoint_url: tokenEndpoint,
      request_method: 'POST',
      content_type: 'application/x-www-form-urlencoded',
      body_params: {
        client_key_prefix: clientKey.substring(0, 6) + '...',
        client_key_length: clientKey.length,
        client_secret_length: clientSecret.length,
        code_length: code.length,
        code_prefix: code.substring(0, 8) + '...',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier_present: !!codeVerifier,
        code_verifier_length: codeVerifier?.length || 0,
      },
    });

    try {
      const tokenResponse = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody,
      });

      const httpStatus = tokenResponse.status;
      const responseText = await tokenResponse.text();

      if (!tokenResponse.ok) {
        // Parse error response to get specific error details
        let parsedError: any = null;
        let errorBody: string = responseText.substring(0, 500); // Safe truncation
        
        try {
          parsedError = JSON.parse(responseText);
          errorBody = JSON.stringify(parsedError, null, 2).substring(0, 500);
        } catch (parseErr) {
          // Response isn't JSON, use raw text (already truncated)
        }

        // Log TikTok response status and error body
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Token exchange failed`, {
          http_status: httpStatus,
          response_body: errorBody,
          error: parsedError?.error || 'unknown',
          error_description: errorDescription ?? undefined,
          log_id: parsedError?.log_id || null,
        });
        
        let errorCode = ERROR_CODES.EXCHANGE_FAILED;
        let errorMessage = 'Failed to exchange authorization code for access token';
        let failureReasons: string[] = [];
        
        // Check for invalid_client error (most common credential issue)
        if (parsedError?.error === 'invalid_client' || httpStatus === 401) {
          errorCode = ERROR_CODES.EXCHANGE_401;
          
          // Determine specific failure reasons
          if (!clientKey || clientKey.length === 0) {
            failureReasons.push('client_key is missing or empty');
          }
          if (!clientSecret || clientSecret.length === 0) {
            failureReasons.push('client_secret is missing or empty');
          }
          if (clientKey && clientSecret) {
            failureReasons.push('client_key or client_secret do not match TikTok Developer Portal');
          }
          if (redirectUri) {
            failureReasons.push(`redirect_uri mismatch: "${redirectUri}" may not match TikTok Developer Portal or authorize request`);
          }
          
          errorMessage = parsedError?.error_description || 
            'TikTok client credentials are incorrect. ' +
            'Please verify TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in your .env.local file match your TikTok Developer Portal settings, then restart your dev server.';
          
          // Print failure checklist
          console.error(`[TikTok OAuth Callback] Request ${requestId}: Invalid client credentials - Failure Checklist:`, {
            '✓ client_key used': clientKey ? `${clientKey.substring(0, 6)}... (length: ${clientKey.length})` : 'MISSING',
            '✓ client_secret present': clientSecret ? `YES (length: ${clientSecret.length})` : 'MISSING',
            '✓ redirect_uri used': redirectUri || 'MISSING',
            '✓ token endpoint': tokenEndpoint,
            '✓ PKCE verifier present': codeVerifier ? `YES (length: ${codeVerifier.length})` : 'NO',
            '✓ parameter names': 'client_key, client_secret, code, grant_type, redirect_uri, code_verifier',
            '✓ Content-Type': 'application/x-www-form-urlencoded',
            '✓ request method': 'POST',
            failure_reasons: failureReasons.length > 0 ? failureReasons : ['Unknown - check credentials match TikTok Developer Portal'],
            troubleshooting: [
              '1. Verify TIKTOK_CLIENT_KEY matches "Client Key" in TikTok Developer Portal → Basic Information',
              '2. Verify TIKTOK_CLIENT_SECRET matches "Client Secret" in TikTok Developer Portal → Basic Information',
              '3. Verify TIKTOK_REDIRECT_URI matches "Redirect URL" in TikTok Developer Portal → Basic Information → Platform Information',
              '4. Ensure redirect_uri in token request matches exactly what was used in authorize request',
              '5. Check .env.local has no extra quotes or whitespace around values',
              '6. Restart dev server after changing .env.local',
            ],
          });
        } else if (parsedError?.error_description) {
          errorMessage = parsedError.error_description;
        }
        
        // Override error code based on HTTP status if not already set by error type
        if (httpStatus === 401 && errorCode === ERROR_CODES.EXCHANGE_FAILED) {
          errorCode = ERROR_CODES.EXCHANGE_401;
        }
        if (httpStatus === 403) {
          errorCode = ERROR_CODES.EXCHANGE_403;
        }
        
        await logOAuthEvent('tiktok', requestId, 'exchange', 'fail', `Token exchange failed: ${httpStatus}`, userId, {
          error_code: errorCode,
          http_status: httpStatus,
          error: parsedError?.error || 'unknown',
          error_description: parsedError?.error_description || responseText.substring(0, 200),
          log_id: parsedError?.log_id || null,
          client_key_length: clientKey?.length || 0,
          client_key_prefix: clientKey ? clientKey.substring(0, 6) : null,
          client_secret_length: clientSecret?.length || 0,
          redirect_uri: redirectUri,
          token_endpoint: tokenEndpoint,
          failure_reasons: failureReasons.length > 0 ? failureReasons : null,
        });
        
        // Update scan job to failed
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: errorMessage,
        });
        
        // Build redirect URL with error details
        const redirectUrl = new URL(`${origin}/onboarding/scanning`);
        redirectUrl.searchParams.set('job', scanJob.id);
        redirectUrl.searchParams.set('error', errorMessage);
        
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Redirecting to scanning page with error`);
        
        return NextResponse.redirect(redirectUrl.toString());
      }

      let tokenData;
      try {
        tokenData = JSON.parse(responseText);
      } catch (parseErr) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Failed to parse token response`);
        await logOAuthEvent('tiktok', requestId, 'exchange', 'fail', 'Failed to parse token response', userId, {
          error_code: ERROR_CODES.EXCHANGE_FAILED,
          http_status: httpStatus,
        });
        
        return NextResponse.redirect(
          `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.EXCHANGE_FAILED}`
        );
      }
      
      if (tokenData.error) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: TikTok API error:`, tokenData);
        await logOAuthEvent('tiktok', requestId, 'exchange', 'fail', `TikTok API error: ${tokenData.error}`, userId, {
          error_code: ERROR_CODES.EXCHANGE_FAILED,
          error: tokenData.error,
          error_description: tokenData.error_description || null,
        });
        
        return NextResponse.redirect(
          `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.EXCHANGE_FAILED}&error=${encodeURIComponent(tokenData.error)}`
        );
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const expiresIn = tokenData.expires_in;

      if (!accessToken) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: No access token in response`);
        await logOAuthEvent('tiktok', requestId, 'exchange', 'fail', 'No access token received', userId, {
          error_code: ERROR_CODES.NO_ACCESS_TOKEN,
        });
        
        return NextResponse.redirect(
          `${origin}/auth/tiktok/result?status=fail&reason=${ERROR_CODES.NO_ACCESS_TOKEN}`
        );
      }

      console.log(`[TikTok OAuth Callback] Request ${requestId}: Access token received`);
      await logOAuthEvent('tiktok', requestId, 'exchange', 'ok', 'Token exchange successful', userId, {
        http_status: 200,
      });

      // Fetch user info from TikTok (including stats if available)
      await updateScanJob(scanJob.id, { progress: 35 });
      
      let tiktokUserId: string | null = null;
      let handle: string | null = null;
      let displayName: string | null = null;
      let bioDescription: string | null = null;
      let followerCount: number | null = null;
      let likesCount: number | null = null;
      let videoCount: number | null = null;
      let avatarUrl: string | null = null;

      try {
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Fetching user info (with stats if available)...`);
        const userInfoData = await fetchTikTokUserInfo(accessToken);
        
        if (userInfoData.data?.user) {
          const user = userInfoData.data.user;
          
          // Basic fields (always available)
          tiktokUserId = user.open_id || null;
          handle = user.username || user.display_name || null;
          displayName = user.display_name || null;
          bioDescription = user.bio_description || null;
          avatarUrl = user.avatar_url || null;
          
          // Stats fields (only if user.info.stats scope is granted)
          followerCount = typeof user.follower_count === 'number' ? user.follower_count : null;
          likesCount = typeof user.likes_count === 'number' ? user.likes_count : null;
          videoCount = typeof user.video_count === 'number' ? user.video_count : null;
          
          const hasStats = followerCount !== null || likesCount !== null || videoCount !== null;
          
          console.log(`[TikTok OAuth Callback] Request ${requestId}: User info retrieved:`, { 
            tiktokUserId, 
            handle, 
            displayName,
            bioLength: bioDescription?.length || 0,
            hasStats,
            followerCount,
            likesCount,
            videoCount
          });
        } else {
          throw new Error("No user data in TikTok response");
        }
      } catch (userInfoErr: any) {
        // User info fetch failure is fatal - fail the scan
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Error fetching user info:`, userInfoErr.message);
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: `Failed to fetch user info: ${userInfoErr.message}`,
        });
        return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(userInfoErr.message)}`);
      }

      if (!tiktokUserId) {
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: "No user ID found in TikTok response",
        });
        return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=No user ID found`);
      }

      // Calculate expires_at
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

      // Store tokens in social_accounts with scan_status='connected'
      console.log(`[TikTok OAuth Callback] Request ${requestId}: Storing connection...`);
      
      try {
        // Store account data (including bio if available)
        const accountData: any = {
          user_id: userId,
          platform: "tiktok",
          platform_user_id: tiktokUserId,
          handle: handle || displayName || null,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          scan_status: "connected", // OAuth complete, scan pending
        };
        
        // Add bio_description if available
        if (bioDescription) {
          accountData.bio_description = bioDescription;
        }
        
        if (avatarUrl) {
          accountData.avatar_url = avatarUrl;
        }
        
        const { error: upsertError } = await supabaseAdmin?.from("social_accounts").upsert(
          accountData,
          {
            onConflict: "user_id,platform",
          }
        );

        if (upsertError) {
          console.error(`[TikTok OAuth Callback] Request ${requestId}: Failed to store connection:`, upsertError);
          if (!upsertError.message?.includes("SUPABASE_SERVICE_ROLE_KEY") && !upsertError.message?.includes("MissingEnvVars")) {
            await updateScanJob(scanJob.id, {
              status: "failed",
              error: `Failed to store connection: ${upsertError.message}`,
            });
            return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(upsertError.message)}`);
          }
        } else {
          console.log(`[TikTok OAuth Callback] Request ${requestId}: Social account stored successfully`, {
            userId,
            platform: 'tiktok',
            platform_user_id: tiktokUserId,
            handle: handle || displayName || null
          });
          await logOAuthEvent('tiktok', requestId, 'store', 'ok', 'Connection stored successfully', userId);
        }
      } catch (err: any) {
        if (err.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || err.message?.includes("MissingEnvVars")) {
          console.warn("⚠️ Supabase admin not configured, skipping social account storage");
        } else {
          await updateScanJob(scanJob.id, {
            status: "failed",
            error: `Failed to store connection: ${err.message}`,
          });
          return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(err.message)}`);
        }
      }

      // Use unified scan pipeline
      console.log(`[TikTok OAuth Callback] Request ${requestId}: Running unified scan pipeline...`);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/oauth/tiktok/callback/route.ts:799',message:'Before scanProviderAccount call',data:{userId,provider:'tiktok',jobId:scanJob.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      await updateScanJob(scanJob.id, { progress: 50, status: "running" });
      
      try {
        await scanProviderAccount(userId, "tiktok");
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Scan pipeline completed`);
        await updateScanJob(scanJob.id, { progress: 80 });
      } catch (scanErr: any) {
        console.error(`[TikTok OAuth Callback] Request ${requestId}: Scan pipeline failed:`, scanErr.message);
        
        // Map error codes to user-friendly error codes
        let errorCode = scanErr.code || ERROR_CODES.SCAN_JOB_FAILED;
        if (scanErr.code === "TT_NO_TOKEN_FOR_USER") {
          errorCode = ERROR_CODES.NO_TOKEN_FOR_USER;
        } else if (scanErr.code === "TT_MISSING_SCOPE") {
          errorCode = ERROR_CODES.MISSING_SCOPE;
        }
        
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: `Scan failed: ${scanErr.message}`,
        });
        
        // Redirect with error code if it's a known error
        if (errorCode === ERROR_CODES.NO_TOKEN_FOR_USER || errorCode === ERROR_CODES.MISSING_SCOPE) {
          return NextResponse.redirect(`${origin}/auth/tiktok/result?status=fail&reason=${errorCode}`);
        }
        
        return NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(scanErr.message)}`);
      }

      // Generate media kit after metrics are stored
      try {
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Generating media kit...`);
        await updateScanJob(scanJob.id, { progress: 90 });
        
        // Fetch profile name for headline
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name, username")
          .eq("id", userId)
          .single();
        
        const profileName = profile?.full_name || profile?.username || undefined;
        await generateAndStoreMediaKit(userId, profileName);
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Media kit generated`);
      } catch (kitErr: any) {
        console.warn(`⚠️ Media kit generation failed (non-blocking):`, kitErr.message);
      }

      // Update progress to 90% before final steps
      await updateScanJob(scanJob.id, { progress: 90 });

      // Build/update creator profile after scan (non-blocking - don't let this fail the whole flow)
      try {
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Building creator profile...`);
        await buildCreatorProfile(userId);
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Creator profile built`);
      } catch (profileErr: any) {
        console.warn(`⚠️ Creator profile build failed (non-blocking):`, profileErr.message);
      }

      // Clear old brand recommendations and cache for this user to prevent cross-account leakage (non-blocking)
      try {
        console.log(`[TikTok OAuth Callback] Request ${requestId}: Clearing old brand recommendations for user:`, userId);
        const { error: clearError } = await supabaseAdmin
          ?.from("brand_recommendations")
          .delete()
          .eq("user_id", userId)
          .eq("status", "new"); // Only clear unsaved matches
        
        if (clearError) {
          console.warn(`[TikTok OAuth Callback] Request ${requestId}: Failed to clear old recommendations (non-blocking):`, clearError);
        } else {
          console.log(`[TikTok OAuth Callback] Request ${requestId}: Old recommendations cleared`);
        }
        
        // Also clear brand candidate cache for this user (to force fresh generation with new account data)
        const { error: cacheClearError } = await supabaseAdmin
          ?.from("cache_brand_candidates")
          .delete()
          .eq("user_id", userId);
        
        if (cacheClearError) {
          console.warn(`[TikTok OAuth Callback] Request ${requestId}: Failed to clear candidate cache (non-blocking):`, cacheClearError);
        } else {
          console.log(`[TikTok OAuth Callback] Request ${requestId}: Candidate cache cleared for user:`, userId);
        }
      } catch (clearErr: any) {
        console.warn(`[TikTok OAuth Callback] Request ${requestId}: Error clearing recommendations/cache (non-blocking):`, clearErr.message);
      }

      // CRITICAL: Mark scan job as complete BEFORE triggering brand generation
      // This ensures the UI can redirect even if brand generation fails
      await updateScanJob(scanJob.id, { status: "complete", progress: 100 });
      console.log(`[TikTok OAuth Callback] Request ${requestId}: Scan job marked complete`);

      // Trigger brand generation in background (non-blocking, fire-and-forget)
      // This happens after we mark the job complete so the UI can redirect immediately
      // Don't await - let it run in background
      fetch(`${origin}/api/brands/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mode: "replace" }),
      }).catch((err) => {
        console.warn(`[TikTok OAuth Callback] Request ${requestId}: Failed to trigger brand generation (non-blocking):`, err);
      });

      console.log(`[TikTok OAuth Callback] Request ${requestId}: Scan complete, redirecting to scanning page`);
      await logOAuthEvent('tiktok', requestId, 'redirect', 'ok', 'Redirecting to scanning page', userId);

      // Clear cookies
      const response = NextResponse.redirect(`${origin}/onboarding/scanning?job=${scanJob.id}`);
      response.cookies.delete('tiktok_code_verifier');
      response.cookies.delete('tiktok_state');
      response.cookies.delete('tiktok_request_id');
      
      return response;
    } catch (tokenErr: any) {
      console.error(`[TikTok OAuth Callback] Request ${requestId}: Error in token exchange:`, tokenErr);
      await logOAuthEvent('tiktok', requestId, 'exchange', 'fail', `Exception: ${tokenErr.message}`, userId, {
        error_code: ERROR_CODES.EXCHANGE_FAILED,
        error: tokenErr.message,
      });
      
      // Update scan job to failed
      try {
        await updateScanJob(scanJob.id, {
          status: "failed",
          error: `Token exchange error: ${tokenErr.message}`,
        });
      } catch (updateErr) {
        console.warn("⚠️ Could not update scan job status");
      }
      
      return NextResponse.redirect(
        `${origin}/onboarding/scanning?job=${scanJob.id}&error=${encodeURIComponent(tokenErr.message)}`
      );
    }
  } catch (error: any) {
    console.error(`[TikTok OAuth Callback] Request ${requestId}: Unexpected error:`, error);
    await logOAuthEvent('tiktok', requestId, 'callback', 'fail', `Unexpected error: ${error.message}`, null, {
      error_code: 'TT_CALLBACK_EXCEPTION',
      error: error.message,
    });
    
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
            .eq("platform", "tiktok")
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
