# TikTok OAuth Debug Implementation

## Overview
Comprehensive debug instrumentation for TikTok OAuth flow to identify and fix silent failures.

## Files Changed

### 1. Database Migration
- **File:** `supabase/migrations/0018_oauth_debug_events.sql`
- **Purpose:** Creates `oauth_debug_events` table for persistent debug logging
- **Run this migration** in Supabase SQL Editor before testing

### 2. Debug Logger Utility
- **File:** `lib/oauthDebug.ts`
- **Purpose:** Helper functions to log OAuth events to Supabase
- **Exports:** `logOAuthEvent()` function

### 3. Start Route (OAuth Initiation)
- **File:** `app/api/oauth/tiktok/start/route.ts`
- **Changes:**
  - Generates unique `request_id` for each OAuth flow
  - Stores `code_verifier` and `state` in httpOnly cookies (30 min expiry)
  - Logs debug events to `oauth_debug_events` table
  - Includes state prefix, redirect_uri in debug logs

### 4. Callback Route (OAuth Completion)
- **File:** `app/api/oauth/tiktok/callback/route.ts`
- **Changes:**
  - Validates code, state, and code_verifier from cookies
  - Logs every step: callback received, token exchange, Supabase store, redirect
  - Always redirects to `/auth/tiktok/result` with status (success/fail) and reason
  - Comprehensive error handling with specific error codes

### 5. Result Page (UI Feedback)
- **File:** `app/auth/tiktok/result/page.tsx`
- **Purpose:** Always-visible result screen showing success or failure
- **Features:**
  - Clear success/failure states with icons
  - Error code display with human-readable messages
  - "Try again" button
  - "Back to Profile" button
  - Auto-refresh on success

### 6. Profile UI Updates
- **File:** `app/ExlaApp.tsx` (ConnectSocialsPanel component)
- **Changes:**
  - Now checks TikTok connection status from Supabase
  - Shows connected/disconnected state for TikTok
  - Refreshes connection status on component mount and visibility change

## Error Codes

The following error codes are used throughout the flow:

| Code | Meaning |
|------|---------|
| `TT_CALLBACK_NO_CODE` | Authorization code not received from TikTok |
| `TT_CALLBACK_NO_STATE` | State parameter missing |
| `TT_STATE_MISMATCH` | State from cookie doesn't match callback state (CSRF protection) |
| `TT_NO_VERIFIER` | PKCE code_verifier cookie missing |
| `TT_NO_USER_ID` | User ID missing from state |
| `TT_EXCHANGE_FAILED` | Token exchange failed (generic) |
| `TT_EXCHANGE_401` | TikTok API returned 401 (authentication failed) |
| `TT_EXCHANGE_403` | TikTok API returned 403 (access denied, may need app review) |
| `TT_NO_ACCESS_TOKEN` | No access token in TikTok response |
| `TT_STORE_FAILED` | Failed to save connection to Supabase |
| `TT_OAUTH_ERROR` | TikTok returned an error during authorization |
| `TT_NO_REDIRECT_URI` | TIKTOK_REDIRECT_URI not configured |
| `TT_NO_CREDENTIALS` | TikTok API credentials missing |
| `TT_CALLBACK_EXCEPTION` | Unexpected exception in callback handler |

## Supabase Upsert Location

**File:** `app/api/oauth/tiktok/callback/route.ts`  
**Line:** ~197-210  
**Table:** `social_accounts`  
**Upsert Logic:**
```typescript
await supabaseAdmin.from("social_accounts").upsert(
  {
    user_id: userId,
    platform: "tiktok",
    platform_user_id: tiktokUserId || "unknown",
    handle: handle || displayName || null,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  },
  {
    onConflict: "user_id,platform",
  }
);
```

**After successful upsert:** Logs `store:ok` event and redirects to result page.

## Viewing Debug Events

### In Supabase Dashboard:

1. Go to **Supabase Dashboard** → Your Project → **Table Editor**
2. Open the `oauth_debug_events` table
3. Filter by:
   - `provider = 'tiktok'`
   - `request_id` (to track a single flow)
   - `step` (start, callback, exchange, store, redirect)
   - `status` (ok, fail)

### Query Examples:

**View all TikTok OAuth events (most recent first):**
```sql
SELECT * FROM oauth_debug_events
WHERE provider = 'tiktok'
ORDER BY created_at DESC
LIMIT 50;
```

**Track a specific request flow:**
```sql
SELECT * FROM oauth_debug_events
WHERE request_id = 'YOUR_REQUEST_ID'
ORDER BY created_at ASC;
```

**Find all failures:**
```sql
SELECT * FROM oauth_debug_events
WHERE provider = 'tiktok'
  AND status = 'fail'
ORDER BY created_at DESC;
```

**View debug metadata:**
```sql
SELECT 
  request_id,
  step,
  status,
  message,
  meta->>'error_code' as error_code,
  meta->>'http_status' as http_status,
  meta->>'redirect_uri' as redirect_uri,
  created_at
FROM oauth_debug_events
WHERE provider = 'tiktok'
ORDER BY created_at DESC
LIMIT 20;
```

## Testing Checklist

1. ✅ Click "Connect TikTok" → TikTok login page opens
2. ✅ After login → Callback route is hit (check server logs)
3. ✅ Result page shows success OR explicit failure with error code
4. ✅ Supabase `social_accounts` table has row for TikTok connection
5. ✅ Profile tab shows "TikTok Connected" (green checkmark)
6. ✅ Refresh app → TikTok connection persists

## Common Failure Points & Fixes

### Callback Not Hit
- **Check:** Server logs show no callback route hit
- **Fix:** Verify `TIKTOK_REDIRECT_URI` matches exactly what's configured in TikTok Developer Portal

### State Mismatch
- **Check:** `TT_STATE_MISMATCH` error code
- **Fix:** Ensure cookies are enabled and not blocked. Check `tiktok_state` cookie exists.

### PKCE Mismatch
- **Check:** `TT_NO_VERIFIER` error code
- **Fix:** Verify `tiktok_code_verifier` cookie is set and accessible in callback route

### Token Exchange Fails
- **Check:** `TT_EXCHANGE_401` or `TT_EXCHANGE_403`
- **Fix:** 
  - Verify `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are correct
  - Check if app needs review in TikTok Developer Portal
  - Ensure redirect_uri matches exactly

### Store Fails
- **Check:** `TT_STORE_FAILED` error code
- **Fix:** Verify `SUPABASE_SERVICE_ROLE_KEY` is set and RLS policies allow service role writes

## Server Logs

All routes log to console with `[TikTok OAuth Start]` or `[TikTok OAuth Callback]` prefixes, including:
- Request ID for tracking
- Step being executed
- Success/failure status
- Error messages (without secrets)

## Next Steps

1. **Run the migration:** `supabase/migrations/0018_oauth_debug_events.sql`
2. **Test the flow:** Click "Connect TikTok" and observe:
   - Console logs (server terminal)
   - Result page feedback
   - Debug events in Supabase
3. **If failures occur:** Check `oauth_debug_events` table for detailed error information

