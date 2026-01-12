Exla – MVP
=================

Purpose: Connect social media creators with brands. This MVP ships:

- Authentication with Supabase (email + password)
- Creator dashboard with searchable brands table
- AI pitch generator using OpenAI
- Public landing page with waitlist form

Tech Stack
----------
- Frontend: Next.js (App Router) + Tailwind CSS
- Backend: Next.js API routes
- Database: Supabase (Postgres)
- AI: OpenAI API

Getting Started
---------------
1) Prereqs
   - Node 18+ and npm
   - Create a Supabase project at `https://supabase.com`

2) Clone & install
```bash
npm install
```

Create `.env.local` with:
```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
# optional live creds
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=
IG_APP_ID=
IG_APP_SECRET=
```

3) Configure env
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase Project Settings → API.
   - Set `OPENAI_API_KEY` from `https://platform.openai.com/api-keys`.

4) Create tables and seed brands (Supabase SQL editor)
   - Open Supabase → SQL Editor → paste `supabase/schema.sql` → Run.
   - Or apply `/prisma/schema.sql` if you prefer to manage manually.

5) Run dev server
```bash
npm run dev
```
Visit `http://localhost:3000`.

Demo Flow
----
- Sign up or login at `/auth/*`.
- On `/dashboard`, click "Connect TikTok" to create a mock token.
- Click "Fetch Posts" to upsert demo posts into `social_posts`.
- Click "Analyze with AI" to create rows in `post_analyses` and view summary + hooks.

Dashboard
---------
- `/dashboard` lists brands from `brands` table.
- Click "Generate Pitch" to create a personalized email using your `name` and `niche`.

Waitlist
--------
- Landing page `/` has a simple waitlist form which stores into `waitlist_users`.

Deploy (Vercel)
---------------
1) Push this repo to GitHub.
2) Import into Vercel and select the Next.js framework preset.
3) In Vercel Project Settings → Environment Variables, set:

**Required for Production:**
- `NEXT_PUBLIC_APP_URL` - Your production domain (e.g., `https://app.exla.com`)
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_URL` - Same as NEXT_PUBLIC_SUPABASE_URL (server-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)
- `OPENAI_API_KEY` - OpenAI API key
- `SERPAPI_KEY` - SerpAPI key (for brand discovery)

**OAuth Providers (optional but recommended):**
- `YOUTUBE_CLIENT_ID` - YouTube OAuth client ID
- `YOUTUBE_CLIENT_SECRET` - YouTube OAuth client secret
- `YOUTUBE_REDIRECT_URI` - Optional, auto-detected from NEXT_PUBLIC_APP_URL
- `TIKTOK_CLIENT_KEY` (or `TIKTOK_CLIENT_ID`) - TikTok OAuth client key
- `TIKTOK_CLIENT_SECRET` - TikTok OAuth client secret
- `TIKTOK_REDIRECT_URI` - Optional, auto-detected from NEXT_PUBLIC_APP_URL

4) **Configure OAuth Redirect URLs:**
   - YouTube: Add `${NEXT_PUBLIC_APP_URL}/api/oauth/youtube/callback` to Google Cloud Console
   - TikTok: Add `${NEXT_PUBLIC_APP_URL}/api/oauth/tiktok/callback` to TikTok Developer Portal
   - Supabase: Set Site URL to `${NEXT_PUBLIC_APP_URL}` and add redirect URLs

5) Deploy. The default build command is `npm run build` and output is `.next`.

**Development Diagnostics:**
- Visit `/debug/diagnostics` in development mode to see configuration status

Notes for Founders
------------------
- `app/` contains all routes. `page.tsx` files are entry points.
- `app/api/*/route.ts` are backend endpoints.
- `lib/supabaseClient.ts` initializes the Supabase client.
- `lib/supabaseAdmin.ts` is a server-only admin client using the service role.
- `supabase/schema.sql` defines tables and seeds demo brands.
- `/prisma/schema.sql` contains the normalized social schema.


