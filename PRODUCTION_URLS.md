# Production OAuth Configuration URLs

## Overview
This document contains the exact URLs you need to configure in each OAuth provider dashboard for production deployment.

**Base URL:** Replace `https://your-domain.com` with your actual production domain (the value of `NEXT_PUBLIC_APP_URL`)

---

## Supabase Auth Configuration

### Site URL
```
https://your-domain.com
```

### Redirect URLs (add to "Redirect URLs" list)
```
https://your-domain.com/
https://your-domain.com/auth/callback
```

**Note:** Supabase Auth typically redirects to the root path (`/`) after authentication, but some flows may use `/auth/callback` if configured.

---

## Google Cloud Console (YouTube OAuth)

### Authorized JavaScript origins
```
https://your-domain.com
```

### Authorized redirect URIs
```
https://your-domain.com/api/oauth/youtube/callback
```

**Configuration Location:**
- Google Cloud Console → APIs & Services → Credentials → Your OAuth 2.0 Client ID → Authorized redirect URIs

---

## TikTok Developer Portal

### Redirect URI
```
https://your-domain.com/api/oauth/tiktok/callback
```

**Configuration Location:**
- TikTok Developer Portal → Your App → Basic Information → Platform Information → Redirect URL

**Required Scopes:**
- `user.info.basic` (required)
- `user.info.stats` (recommended for analytics)
- `video.list` (optional, for content personalization)

---

## Example (if your domain is `app.exla.com`)

### Supabase
- Site URL: `https://app.exla.com`
- Redirect URLs: 
  - `https://app.exla.com/`
  - `https://app.exla.com/auth/callback`

### YouTube (Google Cloud)
- Authorized JavaScript origins: `https://app.exla.com`
- Authorized redirect URIs: `https://app.exla.com/api/oauth/youtube/callback`

### TikTok
- Redirect URI: `https://app.exla.com/api/oauth/tiktok/callback`

---

## Quick Copy (replace `your-domain.com`)

**Supabase Site URL:**
```
https://your-domain.com
```

**Supabase Redirect URLs:**
```
https://your-domain.com/
https://your-domain.com/auth/callback
```

**YouTube Authorized JavaScript origins:**
```
https://your-domain.com
```

**YouTube Authorized redirect URIs:**
```
https://your-domain.com/api/oauth/youtube/callback
```

**TikTok Redirect URI:**
```
https://your-domain.com/api/oauth/tiktok/callback
```

