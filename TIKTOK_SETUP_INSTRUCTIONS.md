# TikTok OAuth Setup Instructions

## The Problem
TikTok does NOT allow `localhost` as a redirect URI. You need a public URL.

## Solution: Use ngrok

### Step 1: Install ngrok

Choose one method:

**Option A: Homebrew (easiest)**
```bash
brew install ngrok
```

**Option B: Manual download**
1. Visit https://ngrok.com/download
2. Download for macOS
3. Unzip the file
4. Move `ngrok` to `/usr/local/bin/`:
   ```bash
   sudo mv ngrok /usr/local/bin/
   ```

**Option C: npm**
```bash
npm install -g ngrok
```

Verify installation:
```bash
ngrok version
```

### Step 2: Start your Next.js server
In your terminal:
```bash
cd /Users/gapter/exla
npm run dev
```
Keep this running!

### Step 3: Start ngrok tunnel
Open a **new terminal window** and run:
```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding   https://abc123def456.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok.io`)

### Step 4: Update .env.local

Run this command (replace with your actual ngrok URL):
```bash
./update-ngrok-url.sh https://abc123def456.ngrok.io
```

Or manually edit `.env.local`:
```bash
TIKTOK_REDIRECT_URI=https://abc123def456.ngrok.io/api/oauth/tiktok/callback
```

### Step 5: Update TikTok Developer Portal

1. Go to https://developers.tiktok.com/
2. Click on your app
3. Go to **"Basic Information"** or **"Products" → "Login Kit"**
4. Find **"Redirect URI"** or **"Callback URL"**
5. Add: `https://abc123def456.ngrok.io/api/oauth/tiktok/callback`
   (Replace with your actual ngrok URL)
6. Click **"Save"**

### Step 6: Restart your dev server

Stop your Next.js server (Ctrl+C) and restart it:
```bash
npm run dev
```

### Step 7: Test the connection

**IMPORTANT:** Access your app through the **ngrok URL**, not localhost:
- ❌ Wrong: `http://localhost:3000`
- ✅ Correct: `https://abc123def456.ngrok.io`

Then try connecting TikTok!

---

## Important Notes

⚠️ **ngrok URLs change** every time you restart ngrok (unless you have a paid plan).

If you restart ngrok and get a new URL:
1. Update `.env.local` with the new URL
2. Update TikTok Developer Portal with the new URL
3. Restart your dev server

---

## Alternative: Use a staging domain

If you have a staging/test domain (e.g., `staging.exla.com`), you can use that instead:
```bash
TIKTOK_REDIRECT_URI=https://staging.exla.com/api/oauth/tiktok/callback
```

Make sure this URL is also set in TikTok Developer Portal.

