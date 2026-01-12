import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logOAuthEvent } from "@/lib/oauthDebug";
import { getOAuthRedirectUri } from "@/lib/appConfig";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching

// Generate PKCE code_verifier and code_challenge
function generatePKCE() {
  // Generate a random code_verifier (43-128 characters, URL-safe)
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  
  // Create code_challenge using SHA256
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  
  return { codeVerifier, codeChallenge };
}

// Generate unique request ID for tracking
function generateRequestId(): string {
  return crypto.randomUUID();
}

async function getUserFromRequest(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (userId) {
    try {
      const { data } = await supabaseAdmin?.from("profiles").select("id").eq("id", userId).single();
      if (data) {
        return { id: userId } as any;
      }
    } catch (err: any) {
      // Skip verification if service key missing
      if (err.message?.includes("SUPABASE_SERVICE_ROLE_KEY") || err.message?.includes("MissingEnvVars")) {
        console.warn("Service key missing, skipping user verification");
        return { id: userId } as any;
      }
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const requestId = generateRequestId();
  
  try {
    // Try to get user from request
    let user = await getUserFromRequest(req);
    let userId: string | null = user?.id || req.nextUrl.searchParams.get("userId");

    // If no userId, redirect to login
    if (!userId) {
      await logOAuthEvent('tiktok', requestId, 'start', 'fail', 'No userId provided', null, {
        error_code: 'TT_START_NO_USER',
      });
      return NextResponse.redirect(new URL("/auth/login?redirect=/api/oauth/tiktok/start", req.url));
    }

    // Validate environment variables
    const clientKey = (process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID)?.trim();
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    
    // Get OAuth redirect URI (centralized configuration)
    let redirectUri = process.env.TIKTOK_REDIRECT_URI?.trim();
    
    // Normalize redirect_uri - remove trailing slashes for consistency
    if (redirectUri && redirectUri.endsWith('/')) {
      redirectUri = redirectUri.slice(0, -1);
    }
    
    // If not explicitly set, derive from app URL
    if (!redirectUri) {
      try {
        redirectUri = getOAuthRedirectUri('/api/oauth/tiktok/callback', req);
      } catch (error: any) {
        await logOAuthEvent('tiktok', requestId, 'start', 'fail', 'Could not determine redirect URI', userId, {
          error_code: 'TT_START_NO_REDIRECT_URI',
        });
        return NextResponse.json(
          {
            error: "Could not determine OAuth redirect URI",
            hint: "Please set NEXT_PUBLIC_APP_URL or TIKTOK_REDIRECT_URI in your environment variables."
          },
          { status: 500 }
        );
      }
      
      // Warn if using localhost in production (TikTok doesn't allow it)
      if (redirectUri.includes('localhost') && process.env.NODE_ENV === 'production') {
        await logOAuthEvent('tiktok', requestId, 'start', 'fail', 'TIKTOK_REDIRECT_URI cannot be localhost in production', userId, {
          error_code: 'TT_START_NO_REDIRECT_URI',
        });
        return NextResponse.json(
          {
            error: "TikTok OAuth requires a public URL",
            hint: "TikTok does not allow localhost in production. Please set TIKTOK_REDIRECT_URI to your production domain."
          },
          { status: 500 }
        );
      }
    }

    if (!clientKey) {
      await logOAuthEvent('tiktok', requestId, 'start', 'fail', 'TIKTOK_CLIENT_KEY not configured', userId, {
        error_code: 'TT_START_NO_CLIENT_KEY',
      });
      return NextResponse.json(
        { 
          error: "TIKTOK_CLIENT_KEY is not configured",
          debug: process.env.NODE_ENV === 'development' ? {
            hint: "Make sure TIKTOK_CLIENT_KEY (or TIKTOK_CLIENT_ID) is in .env.local and restart the dev server",
            availableVars: Object.keys(process.env).filter(k => k.includes('TIKTOK')),
            checked: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_ID"]
          } : undefined
        },
        { status: 500 }
      );
    }

    // Generate PKCE parameters (required by TikTok)
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Generate state parameter (includes user_id and timestamp only - verifier stored in cookie)
    const state = Buffer.from(
      JSON.stringify({
        userId: userId,
        requestId: requestId, // Include requestId for tracking
        timestamp: Date.now(),
      })
    ).toString("base64url");

    // Store code_verifier and state in httpOnly cookies (more secure than state param)
    const response = NextResponse.redirect(new URL(
      `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
        client_key: clientKey,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "user.info.basic,user.info.stats,video.list", // Request stats and video scopes for personalization
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString()}`,
      req.url
    ));

    // Set httpOnly cookies for PKCE verifier and state (30 min expiry)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 30 * 60, // 30 minutes
      path: '/',
    };

    response.cookies.set('tiktok_code_verifier', codeVerifier, cookieOptions);
    response.cookies.set('tiktok_state', state, cookieOptions);
    response.cookies.set('tiktok_request_id', requestId, cookieOptions);

    // Log success
    await logOAuthEvent('tiktok', requestId, 'start', 'ok', 'OAuth flow started', userId, {
      redirect_uri: redirectUri,
      state_prefix: state.substring(0, 6),
      has_code: false,
      has_state: true,
    });

    console.log(`[TikTok OAuth Start] Request ${requestId}: Redirecting to TikTok for user ${userId}`);

    return response;
  } catch (error: any) {
    console.error(`[TikTok OAuth Start] Request ${requestId}: Error:`, error);
    await logOAuthEvent('tiktok', requestId, 'start', 'fail', `Error: ${error.message}`, null, {
      error_code: 'TT_START_EXCEPTION',
      error: error.message,
    });
    return NextResponse.json(
      { error: error.message || "Failed to start OAuth flow" },
      { status: 500 }
    );
  }
}
