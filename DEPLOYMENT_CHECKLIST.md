# Exla Production Deployment Checklist

## Overview
This checklist documents all changes made to prepare Exla for public demo deployment, ensuring data isolation, proper URL configuration, and production readiness.

## Files Changed

### Core Configuration
1. **`lib/appConfig.ts`** (NEW)
   - Centralized URL configuration utility
   - Functions: `getAppUrl()`, `getOAuthRedirectUri()`, `isDevelopment()`, `isProduction()`
   - Priority: NEXT_PUBLIC_APP_URL > VERCEL_URL > request origin > NEXT_PUBLIC_SITE_URL > localhost (dev only)

### OAuth & Authentication
2. **`app/api/oauth/tiktok/start/route.ts`**
   - Replaced hardcoded localhost with `getOAuthRedirectUri()`
   - Added `export const dynamic = 'force-dynamic'`
   - Improved error handling for missing redirect URI

3. **`app/api/oauth/tiktok/callback/route.ts`**
   - Replaced `getOrigin()` with `getAppUrl()` from appConfig
   - Already had `export const dynamic = 'force-dynamic'`
   - Profile creation logic already in place

4. **`app/api/oauth/youtube/start/route.ts`**
   - Replaced hardcoded localhost with `getOAuthRedirectUri()`
   - Added `export const dynamic = 'force-dynamic'`

5. **`app/api/oauth/youtube/callback/route.ts`**
   - Replaced hardcoded localhost with `getOAuthRedirectUri()`
   - Already had `export const dynamic = 'force-dynamic'`

### Data Isolation & Security
6. **`app/api/openai/analyze/route.ts`**
   - Added `userId` parameter requirement
   - Added `.eq("user_id", userId)` filter to post queries
   - Added leak detection guards
   - Added `export const dynamic = 'force-dynamic'`
   - Added `export const runtime = "nodejs"`

7. **`app/api/brands/generate/route.ts`**
   - Already had user_id filtering and leak detection guards
   - Already had `export const dynamic = 'force-dynamic'`

8. **`app/api/assistant/context/route.ts`**
   - Already had user_id filtering and leak detection guards
   - Already had `export const dynamic = 'force-dynamic'`

### Other API Routes
9. **`app/api/brands/route.ts`**
   - Added `export const dynamic = 'force-dynamic'`
   - Added `export const runtime = "nodejs"`
   - Note: This route returns global brands (not user-specific), which is intentional

10. **`app/api/waitlist/route.ts`**
    - Added `export const dynamic = 'force-dynamic'`
    - Added `export const runtime = "nodejs"`

11. **`app/api/pitch/route.ts`**
    - Added `export const dynamic = 'force-dynamic'`
    - Already had `export const runtime = "nodejs"`

12. **`app/api/social/fetch/route.ts`**
    - Added `export const dynamic = 'force-dynamic'`
    - Added `export const runtime = "nodejs"`
    - Already filters by user_id

13. **`app/api/social/posts/route.ts`**
    - Added `export const dynamic = 'force-dynamic'`
    - Added `export const runtime = "nodejs"`
    - Already filters by user_id

### Logging & Debugging
14. **`lib/scanLogging.ts`**
    - Updated debug endpoint to only run in development
    - Uses `DEBUG_LOG_ENDPOINT` env var or defaults to localhost (dev only)
    - Production: logs to console only

15. **`app/api/enrich/trigger/route.ts`**
    - Replaced hardcoded localhost with `getAppUrl()`
    - Already had proper error handling

### Already Secure (Verified)
- `app/api/profile/build/route.ts` - Already dynamic, filters by user_id
- `app/api/followups/route.ts` - Already dynamic, filters by user_id
- `app/api/pitches/list/route.ts` - Already dynamic, filters by user_id
- `app/api/scan/status/route.ts` - Already dynamic
- `app/api/brands/status/route.ts` - Already dynamic
- `app/api/pitches/create/route.ts` - Already filters by user_id
- `app/api/pitches/status/route.ts` - Already filters by user_id
- `app/api/pitches/mark-sent/route.ts` - Already filters by user_id
- `app/api/social/disconnect/route.ts` - Already filters by user_id

## Environment Variables Required for Production

### Required
1. **`NEXT_PUBLIC_APP_URL`** (or `NEXT_PUBLIC_SITE_URL`)
   - Production domain (e.g., `https://app.exla.com`)
   - Used for OAuth redirects and absolute URLs
   - If not set, falls back to VERCEL_URL or request origin

2. **`NEXT_PUBLIC_SUPABASE_URL`**
   - Supabase project URL
   - Required for client-side auth

3. **`NEXT_PUBLIC_SUPABASE_ANON_KEY`**
   - Supabase anonymous key
   - Required for client-side auth

4. **`SUPABASE_URL`**
   - Same as NEXT_PUBLIC_SUPABASE_URL (for server-side)
   - Required for server-side operations

5. **`SUPABASE_SERVICE_ROLE_KEY`**
   - Supabase service role key
   - Required for admin operations (scan, profile building, etc.)

6. **`OPENAI_API_KEY`**
   - OpenAI API key
   - Required for AI features (brand generation, pitch generation, analysis)

7. **`SERPAPI_KEY`**
   - SerpAPI key
   - Required for brand discovery

### OAuth Provider Credentials
8. **`TIKTOK_CLIENT_KEY`** (or `TIKTOK_CLIENT_ID`)
   - TikTok OAuth client key

9. **`TIKTOK_CLIENT_SECRET`**
   - TikTok OAuth client secret

10. **`TIKTOK_REDIRECT_URI`** (optional, auto-detected if not set)
    - Full TikTok OAuth callback URL (e.g., `https://app.exla.com/api/oauth/tiktok/callback`)
    - If not set, derived from NEXT_PUBLIC_APP_URL

11. **`YOUTUBE_CLIENT_ID`**
    - YouTube OAuth client ID

12. **`YOUTUBE_CLIENT_SECRET`**
    - YouTube OAuth client secret

13. **`YOUTUBE_REDIRECT_URI`** (optional, auto-detected if not set)
    - Full YouTube OAuth callback URL (e.g., `https://app.exla.com/api/oauth/youtube/callback`)
    - If not set, derived from NEXT_PUBLIC_APP_URL

### Optional (Development Only)
14. **`DEBUG_LOG_ENDPOINT`**
    - Debug logging endpoint (defaults to `http://127.0.0.1:7242/...`)
    - Only used in development mode
    - Can be omitted in production

### Auto-Detected (Vercel)
15. **`VERCEL_URL`**
    - Automatically set by Vercel
    - Used as fallback if NEXT_PUBLIC_APP_URL is not set

## Data Isolation Verification

All user-specific queries now enforce:
- ✅ Filter by `user_id` from authenticated session
- ✅ Leak detection guards that throw errors if `returned.user_id !== session.user.id`
- ✅ No `.single()` calls without user_id filter (except for public/global data)
- ✅ All routes marked as `force-dynamic` to prevent Next.js caching

### Critical Queries Verified
- ✅ `creator_profiles` - filtered by `user_id`
- ✅ `creator_metrics` - filtered by `user_id` + `platform`
- ✅ `brand_recommendations` - filtered by `user_id`
- ✅ `cache_brand_candidates` - filtered by `user_id` + `topics_hash`
- ✅ `social_accounts` - filtered by `user_id` + `platform`
- ✅ `social_posts` - filtered by `user_id`
- ✅ `post_analyses` - filtered by `post_id` (which belongs to `social_posts` with `user_id`)
- ✅ `pitches` - filtered by `user_id`
- ✅ `followups` - filtered by `user_id`
- ✅ `scan_jobs` - filtered by `user_id`

## Caching Verification

All user-specific routes now have:
- ✅ `export const dynamic = 'force-dynamic'` to prevent Next.js caching
- ✅ No `fetch(..., { cache: ... })` calls with caching enabled for user data

## TODOs Before Deployment

### Critical
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Verify all OAuth redirect URIs are configured in provider dashboards:
  - [ ] TikTok: `https://your-domain.com/api/oauth/tiktok/callback`
  - [ ] YouTube: `https://your-domain.com/api/oauth/youtube/callback`
- [ ] Test OAuth flows in production environment
- [ ] Verify Supabase RLS policies are enabled and correct
- [ ] Run database migrations (if any new ones were added)

### Recommended
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)
- [ ] Set up analytics (if not already configured)
- [ ] Review and test sign-out flow to ensure client-side cache is cleared
- [ ] Load test critical endpoints (brand generation, OAuth callbacks)
- [ ] Verify environment variables are set correctly in deployment platform

### Security
- [ ] Review Supabase RLS policies to ensure they enforce user isolation
- [ ] Verify service role key is not exposed to client-side code
- [ ] Review OAuth scopes to ensure minimum required permissions
- [ ] Test with multiple users simultaneously to verify no data leakage

### Performance
- [ ] Enable Next.js caching for static/public routes (if applicable)
- [ ] Configure CDN for static assets
- [ ] Monitor API response times in production
- [ ] Set up database connection pooling if needed

## Known Limitations

1. **Debug Logging**: Debug endpoint (`http://127.0.0.1:7242/...`) only works in development. In production, logs go to console only.

2. **OAuth Localhost**: TikTok OAuth does not work with localhost. Production deployments require a public URL.

3. **Brands Route**: `/api/brands` returns global brands (not user-specific). This is intentional for the brand database.

## Testing Checklist

Before deploying to production, test:
- [ ] User signup/login
- [ ] TikTok OAuth connect flow
- [ ] YouTube OAuth connect flow
- [ ] Profile scan completion
- [ ] Brand recommendation generation
- [ ] Discover matches display
- [ ] Pitch generation
- [ ] Analytics page data
- [ ] Profile page data
- [ ] Sign out (clears client-side state)
- [ ] Multiple users using the app simultaneously (verify no cross-user data)

## Rollback Plan

If issues occur:
1. Revert to previous deployment
2. Check environment variables are correct
3. Verify database migrations are applied
4. Review error logs for specific failures
5. Check OAuth callback URLs match provider configuration

