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

### Authorized JavaScript origins
```
https://YOUR_DOMAIN
```

### Authorized redirect URIs
```
https://YOUR_DOMAIN/api/oauth/youtube/callback
```

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

1. **Domain must be HTTPS** - All URLs must use `https://` (not `http://`)
2. **No trailing slashes** - Except for root path (`/`), don't include trailing slashes in callback URLs
3. **Exact match required** - OAuth providers require exact URL matches, so ensure the URLs match exactly
4. **Environment variable** - Set `NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN` in your production environment

