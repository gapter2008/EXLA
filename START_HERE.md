# 🚀 Quick Start Guide

## Step 1: Open Terminal in the Project Directory

Make sure you're in the correct directory:

```bash
cd /Users/gapter/exla
```

## Step 2: Start Your Next.js Server

In one terminal window, run:

```bash
npm run dev
```

Keep this running! You should see:
```
✓ Ready in X seconds
○ Local: http://localhost:3000
```

## Step 3: Start ngrok (in a NEW terminal)

Open a **NEW terminal window** and run:

```bash
cd /Users/gapter/exla
ngrok http 3000
```

You'll see output like:
```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (the `https://...ngrok.io` part)

## Step 4: Update .env.local

Edit `.env.local` and change:
```bash
TIKTOK_REDIRECT_URI=http://localhost:3000/api/oauth/tiktok/callback
```

To (replace with YOUR ngrok URL):
```bash
TIKTOK_REDIRECT_URI=https://abc123.ngrok.io/api/oauth/tiktok/callback
```

## Step 5: Update TikTok Developer Portal

1. Go to https://developers.tiktok.com/
2. Open your app
3. Set Redirect URI to: `https://abc123.ngrok.io/api/oauth/tiktok/callback`
4. Save

## Step 6: Restart Next.js Server

Stop the server (Ctrl+C) and restart:
```bash
npm run dev
```

## Step 7: Test

Visit your app via the ngrok URL (NOT localhost):
- Go to: `https://abc123.ngrok.io`
- Try connecting TikTok!

---

**Remember:** Always run commands from `/Users/gapter/exla`, not from Downloads!

