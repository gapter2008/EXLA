# OAuth Configuration URLs - Paste Ready

Replace `YOUR_DOMAIN` with your actual production domain (e.g., `app.exla.com` or `exla.vercel.app`)

---

## Supabase Dashboard

**Settings → Authentication → URL Configuration**

### Site URL
```
https://YOUR_DOMAIN
```

### Redirect URLs
Add these to the "Redirect URLs" list:
```
https://YOUR_DOMAIN/
https://YOUR_DOMAIN/auth/callback
```

---

## Google Cloud Console (YouTube OAuth)

**APIs & Services → Credentials → Your OAuth 2.0 Client ID → Edit**

### Exla YouTube OAuth client (current)

- **Client ID:** `6687033709-rs0ne7r1auo6ms161kchci4s3aqq1ehr.apps.googleusercontent.com`
- **Authorized JavaScript origins:** `http://localhost:3000`, `https://exla-ten.vercel.app`
- **Authorized redirect URIs:** `http://localhost:3000/api/oauth/youtube/callback`, `https://exla-ten.vercel.app/api/oauth/youtube/callback`
- **Client secret:** Set in `.env.local` as `YOUTUBE_CLIENT_SECRET` (never commit). If lost, create a new secret in Google Console.

### Authorized JavaScript origins (template)
```
https://YOUR_DOMAIN
```
(For local dev also add `http://localhost:3000`.)

### Authorized redirect URIs (template)
```
https://YOUR_DOMAIN/api/oauth/youtube/callback
```
(For local dev also add `http://localhost:3000/api/oauth/youtube/callback`.)

---

## TikTok Developer Portal

**Your App → Basic Information → Platform Information → Redirect URL**

### Redirect URI
```
https://YOUR_DOMAIN/api/oauth/tiktok/callback
```

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

### Google Cloud Console (YouTube)
- Authorized JavaScript origins: `https://app.exla.com`
- Authorized redirect URIs: `https://app.exla.com/api/oauth/youtube/callback`

### TikTok Developer Portal
- Redirect URI: `https://app.exla.com/api/oauth/tiktok/callback`

---

## Notes

1. **Domain must be HTTPS** - In production, all URLs must use `https://` (not `http://`).
2. **No trailing slashes** - Except for root path (`/`), don't include trailing slashes in callback URLs. The app normalizes `YOUTUBE_REDIRECT_URI` by stripping a trailing slash.
3. **Exact match required** - Google requires the redirect_uri in the token exchange to match exactly what's in the Authorized redirect URIs list.
4. **Production (exla-ten.vercel.app)** - In Vercel, set `NEXT_PUBLIC_APP_URL=https://exla-ten.vercel.app` so the app derives `https://exla-ten.vercel.app/api/oauth/youtube/callback`; or set `YOUTUBE_REDIRECT_URI=https://exla-ten.vercel.app/api/oauth/youtube/callback` explicitly.

