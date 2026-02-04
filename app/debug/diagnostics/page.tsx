"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SyncStatus = "idle" | "loading" | "success" | "error";

/**
 * Development diagnostics page
 * Shows app configuration, env vars status, and user state
 * Only accessible in development mode
 */
export default function DiagnosticsPage() {
  const [appUrl, setAppUrl] = useState<string>("");
  const [envVars, setEnvVars] = useState<Record<string, boolean>>({});
  const [oauthUrls, setOauthUrls] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [syncMetrics, setSyncMetrics] = useState<{
    followers: number | null;
    avg_views_10: number | null;
    engagement_rate_10: number | null;
    total_videos: number | null;
  } | null>(null);

  useEffect(() => {
    // Only show in development
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    // Get app URL
    const url = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    setAppUrl(url);

    // Check env vars (just existence, not values)
    setEnvVars({
      NEXT_PUBLIC_APP_URL: !!process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SITE_URL: !!process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      YOUTUBE_CLIENT_ID: !!process.env.YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET: !!process.env.YOUTUBE_CLIENT_SECRET,
      YOUTUBE_REDIRECT_URI: !!process.env.YOUTUBE_REDIRECT_URI,
      TIKTOK_CLIENT_KEY: !!process.env.TIKTOK_CLIENT_KEY || !!process.env.TIKTOK_CLIENT_ID,
      TIKTOK_CLIENT_SECRET: !!process.env.TIKTOK_CLIENT_SECRET,
      TIKTOK_REDIRECT_URI: !!process.env.TIKTOK_REDIRECT_URI,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      SERPAPI_KEY: !!process.env.SERPAPI_KEY,
    });

    // Compute OAuth callback URLs
    setOauthUrls({
      YouTube: `${url}/api/oauth/youtube/callback`,
      TikTok: `${url}/api/oauth/tiktok/callback`,
      Supabase: `${url}/`, // Supabase Auth redirects to root
    });

    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        
        // Fetch social accounts (using client-side Supabase, which respects RLS)
        supabase
          .from("social_accounts")
          .select("platform, handle, scan_status")
          .eq("user_id", user.id)
          .then(({ data, error }) => {
            if (!error && data) {
              setSocialAccounts(data);
            }
          });
      }
    });
  }, []);

  // Hide in production
  if (process.env.NODE_ENV === 'production') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Not Available</h1>
        <p>Diagnostics page is only available in development mode.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Exla Diagnostics (Dev Only)</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">App Configuration</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div>
            <strong>Current App URL:</strong> <code className="bg-gray-200 px-2 py-1 rounded">{appUrl}</code>
          </div>
          <div>
            <strong>Node Env:</strong> <code className="bg-gray-200 px-2 py-1 rounded">{process.env.NODE_ENV}</code>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
        <div className="bg-gray-50 p-4 rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Variable</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(envVars).map(([key, exists]) => (
                <tr key={key} className="border-b">
                  <td className="py-2 font-mono text-sm">{key}</td>
                  <td className="py-2">
                    {exists ? (
                      <span className="text-green-600 font-semibold">✓ Set</span>
                    ) : (
                      <span className="text-red-600 font-semibold">✗ Missing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">OAuth Callback URLs</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          {Object.entries(oauthUrls).map(([provider, url]) => (
            <div key={provider}>
              <strong>{provider}:</strong> <code className="bg-gray-200 px-2 py-1 rounded text-sm break-all">{url}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">User State</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div>
            <strong>User ID:</strong>{" "}
            {userId ? (
              <code className="bg-gray-200 px-2 py-1 rounded text-sm">{userId}</code>
            ) : (
              <span className="text-gray-500">Not logged in</span>
            )}
          </div>
          {socialAccounts.length > 0 && (
            <div>
              <strong>Connected Accounts:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {socialAccounts.map((account, idx) => (
                  <li key={idx} className="text-sm">
                    {account.platform}: {account.handle || "N/A"} (
                    <span className={account.scan_status === "scanned" ? "text-green-600" : "text-yellow-600"}>
                      {account.scan_status || "connected"}
                    </span>
                    )
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Sync YouTube (dev)</h2>
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <p className="text-sm text-gray-600">
            Run the YouTube scan pipeline now and see computed metrics. Use after connecting YouTube to refresh creator_metrics.
          </p>
          <button
            type="button"
            onClick={async () => {
              if (!userId) {
                setSyncStatus("error");
                setSyncMessage("Sign in first");
                return;
              }
              setSyncStatus("loading");
              setSyncMessage("");
              setSyncMetrics(null);
              try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.access_token) {
                  setSyncStatus("error");
                  setSyncMessage("No session – sign in again");
                  return;
                }
                const res = await fetch("/api/sync/youtube", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                  },
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                  setSyncStatus("success");
                  setSyncMessage("Synced");
                  setSyncMetrics(data.metrics ?? null);
                } else {
                  setSyncStatus("error");
                  setSyncMessage(data.error ?? `HTTP ${res.status}`);
                }
              } catch (err: any) {
                setSyncStatus("error");
                setSyncMessage(err?.message ?? "Request failed");
              }
            }}
            disabled={syncStatus === "loading" || !userId}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-700"
          >
            {syncStatus === "loading" ? "Syncing…" : "Sync YouTube Now"}
          </button>
          {syncStatus === "success" && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <p className="font-semibold text-green-800 mb-2">{syncMessage}</p>
              {syncMetrics && (
                <ul className="text-green-700 space-y-1">
                  <li>Subscribers: {syncMetrics.followers?.toLocaleString() ?? "—"}</li>
                  <li>Avg views (10): {syncMetrics.avg_views_10?.toLocaleString() ?? "—"}</li>
                  <li>Engagement rate: {syncMetrics.engagement_rate_10 != null ? `${syncMetrics.engagement_rate_10.toFixed(2)}%` : "—"}</li>
                  <li>Total videos: {syncMetrics.total_videos?.toLocaleString() ?? "—"}</li>
                </ul>
              )}
            </div>
          )}
          {syncStatus === "error" && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {syncMessage}
            </div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Notes</h2>
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-sm space-y-2">
          <p>• This page is only visible in development mode.</p>
          <p>• Use these callback URLs when configuring OAuth providers.</p>
          <p>• Make sure all required environment variables are set in production.</p>
        </div>
      </section>
    </div>
  );
}

