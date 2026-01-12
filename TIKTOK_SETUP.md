# TikTok OAuth Setup (Development)

## Problem
TikTok does NOT allow `localhost` as a redirect URI. You need a public URL for development.

## Solution: Use ngrok (Easiest for Development)

### Step 1: Install ngrok
```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### Step 2: Start your Next.js dev server
```bash
npm run dev
```

### Step 3: Start ngrok tunnel
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

### Step 4: Update .env.local
```bash
TIKTOK_REDIRECT_URI=https://abc123.ngrok.io/api/oauth/tiktok/callback
```

**Important:** Replace `abc123.ngrok.io` with your actual ngrok URL.

### Step 5: Update TikTok Developer Portal
1. Go to https://developers.tiktok.com/
2. Open your app
3. Go to "Basic Information" or "Products" → "Login Kit"
4. Set Redirect URI to: `https://abc123.ngrok.io/api/oauth/tiktok/callback`
   (Replace with your actual ngrok URL)

### Step 6: Restart your dev server
```bash
# Stop and restart to load new env vars
npm run dev
```

### Step 7: Try connecting TikTok again

---

## Alternative: Use a Staging Domain

If you have a staging/test domain, use that instead:
```bash
TIKTOK_REDIRECT_URI=https://staging.yourdomain.com/api/oauth/tiktok/callback
```

Make sure to add this exact URL in TikTok Developer Portal as well.

---

## Important Notes

- **ngrok URLs change** each time you restart ngrok (unless you have a paid plan with fixed domains)
- You'll need to update both `.env.local` and TikTok Developer Portal when the URL changes
- For production, use your actual domain

