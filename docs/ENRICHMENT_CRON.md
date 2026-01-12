# Brand Contact Enrichment Cron Setup

The brand contact enrichment system requires a periodic job to process pending enrichment requests.

## Setup Instructions

### Option 1: Next.js API Route (Recommended for Vercel)

Use Vercel Cron Jobs to call the enrichment worker:

1. Create `vercel.json` in the project root:
```json
{
  "crons": [
    {
      "path": "/api/enrich/brand-contacts?limit=10",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs every 5 minutes and processes up to 10 jobs per run.

### Option 2: External Cron Service

Use a service like EasyCron, cron-job.org, or your server's cron to call:

```
POST https://your-domain.com/api/enrich/brand-contacts?limit=10
```

Schedule: Every 5-10 minutes

### Option 3: Supabase Edge Functions (Future)

You can convert the enrichment worker to a Supabase Edge Function and use pg_cron:

```sql
SELECT cron.schedule(
  'enrich-brand-contacts',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://your-project.supabase.co/functions/v1/enrich-brand-contacts',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
  ) AS request_id;
  $$
);
```

## Manual Trigger

You can also manually trigger enrichment:

```bash
curl -X POST https://your-domain.com/api/enrich/brand-contacts?limit=10
```

## Monitoring

Check enrichment job status:

```bash
curl https://your-domain.com/api/enrich/brand-contacts
```

Returns stats:
```json
{
  "success": true,
  "stats": {
    "pending": 5,
    "processing": 0,
    "complete": 100,
    "failed": 2
  }
}
```

## Environment Variables Required

- `SERPAPI_KEY` - SerpAPI key for web search
- `OPENAI_API_KEY` - OpenAI key for contact extraction
- Supabase credentials (via `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)

