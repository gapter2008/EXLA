# TikTok OAuth Debug Checklist

You're getting a `client_key` error from TikTok. Here's what to check:

## Step 1: Check Server Logs

When you click "Connect TikTok", check your **server terminal** (where `npm run dev` is running). You should see logs like:

```
🔍 TikTok OAuth Config Check:
  TIKTOK_CLIENT_KEY: ✅ SET (awhgan0aeudqo4ol)
  TIKTOK_REDIRECT_URI: https://nonmulched-oversteadily-jayda.ngrok-free.dev/api/oauth/tiktok/callback
```

**Copy the exact redirect URI from the logs** - we need to verify this matches TikTok Developer Portal.

## Step 2: Verify TikTok Developer Portal Settings

Go to https://developers.tiktok.com/ → Your App → Settings:

### A) Check Client Key
1. Go to **"Basic Information"** or **"Settings"**
2. Find **"Client Key"** or **"App ID"**
3. It should be exactly: `awhgan0aeudqo4ol`
4. **Copy it exactly** - no spaces, no extra characters

### B) Check Redirect URI (CRITICAL)
1. Go to **"Basic Information"** → **"Redirect URI"** section
   OR
2. Go to **"Products"** → **"Login Kit"** → **"Redirect URI"**

3. The redirect URI must be **EXACTLY**:
   ```
   https://nonmulched-oversteadily-jayda.ngrok-free.dev/api/oauth/tiktok/callback
   ```

4. **IMPORTANT:**
   - Must start with `https://` (not `http://`)
   - Must match EXACTLY (no trailing slash)
   - No extra spaces
   - Case-sensitive

### C) Verify Test User (if in Sandbox mode)
1. Go to **"Basic Information"** → **"Test Users"** or **"App Review"**
2. Make sure your TikTok account email is added as a test user
3. If not, add it and save

## Step 3: Restart Your Dev Server

After making changes in TikTok Developer Portal:

```bash
# Stop your server (Ctrl+C)
# Then restart:
npm run dev
```

## Step 4: Try Again

1. Access your app via ngrok: `https://nonmulched-oversteadily-jayda.ngrok-free.dev`
2. Click "Connect TikTok"
3. Check if it works

## Common Issues:

**Issue:** Redirect URI mismatch
- **Fix:** Make sure the redirect URI in TikTok portal matches EXACTLY what's in `.env.local`

**Issue:** Client Key mismatch  
- **Fix:** Copy the client key directly from TikTok Developer Portal into `.env.local`

**Issue:** App in Sandbox mode
- **Fix:** Add your TikTok account as a test user in Developer Portal

**Issue:** ngrok URL changed
- **Fix:** If you restarted ngrok and got a new URL, update both `.env.local` AND TikTok Developer Portal

## Still Not Working?

Share the server terminal output when you click "Connect TikTok" so we can see exactly what's being sent to TikTok.

