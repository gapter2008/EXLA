import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";

export const runtime = "nodejs";

async function fetchYouTubeChannel(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`YouTube API error: ${response.status} ${error}`);
  }

  return await response.json();
}

async function fetchYouTubeVideos(accessToken: string, maxResults: number = 10) {
  const channelResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!channelResponse.ok) {
    throw new Error("Failed to fetch channel uploads playlist");
  }

  const channelData = await channelResponse.json();
  const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error("No uploads playlist found");
  }

  const videosResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&order=date`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!videosResponse.ok) {
    throw new Error("Failed to fetch videos");
  }

  const videosData = await videosResponse.json();
  const videoIds = videosData.items?.map((item: any) => item.contentDetails.videoId).join(",");

  if (!videoIds) {
    return { items: [] };
  }

  const statsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!statsResponse.ok) {
    throw new Error("Failed to fetch video statistics");
  }

  return await statsResponse.json();
}

function calculateMetrics(videos: any[]) {
  if (videos.length === 0) {
    return {
      avg_views_10: 0,
      engagement_rate_10: 0,
      top_videos: [],
    };
  }

  let totalViews = 0;
  let totalEngagement = 0;
  const topVideos: any[] = [];

  for (const video of videos.slice(0, 10)) {
    const views = parseInt(video.statistics?.viewCount || "0", 10);
    const likes = parseInt(video.statistics?.likeCount || "0", 10);
    const comments = parseInt(video.statistics?.commentCount || "0", 10);

    totalViews += views;
    const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
    totalEngagement += engagement;

    topVideos.push({
      title: video.snippet?.title || "Untitled",
      url: `https://www.youtube.com/watch?v=${video.id}`,
      views: views,
      likes: likes,
      comments: comments,
      publishedAt: video.snippet?.publishedAt || null,
    });
  }

  const avgViews = videos.length > 0 ? totalViews / videos.length : 0;
  const avgEngagement = videos.length > 0 ? totalEngagement / videos.length : 0;

  topVideos.sort((a, b) => b.views - a.views);

  return {
    avg_views_10: Math.round(avgViews),
    engagement_rate_10: Math.round(avgEngagement * 100) / 100,
    top_videos: topVideos.slice(0, 5),
  };
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh access token");
  }

  const tokens = await response.json();
  return tokens.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!platform || platform !== "youtube") {
      return NextResponse.json(
        { error: "Invalid platform. Only 'youtube' is supported" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Get social account with tokens
    const { data: socialAccount, error: accountError } = await supabaseAdmin
      .from("social_accounts")
      .select("id, user_id, platform, platform_user_id, handle, access_token, refresh_token, expires_at, created_at, scan_status")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    if (accountError || !socialAccount) {
      return NextResponse.json(
        { error: "Social account not found. Please connect a social account first." },
        { status: 404 }
      );
    }

    // Create scan job
    const { data: scanJob, error: jobError } = await supabaseAdmin
      .from("scan_jobs")
      .insert({
        user_id: userId,
        platform: platform,
        status: "queued",
        progress: 0,
      })
      .select()
      .single();

    if (jobError || !scanJob) {
      return NextResponse.json(
        { error: "Failed to create scan job" },
        { status: 500 }
      );
    }

    const jobId = scanJob.id;

    // Run scan asynchronously (in production, this should be a background job)
    (async () => {
      try {
        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "running", progress: 10 })
          .eq("id", jobId);

        // Check if access token needs refresh
        let accessToken = socialAccount.access_token;
        const expiresAt = socialAccount.expires_at ? new Date(socialAccount.expires_at) : null;
        const now = new Date();

        if (expiresAt && now >= expiresAt && socialAccount.refresh_token) {
          const clientId = process.env.YOUTUBE_CLIENT_ID;
          const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

          if (clientId && clientSecret) {
            accessToken = await refreshAccessToken(socialAccount.refresh_token, clientId, clientSecret);
            
            // Update stored token
            const newExpiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
            await supabaseAdmin
              .from("social_accounts")
              .update({
                access_token: accessToken,
                expires_at: newExpiresAt,
              })
              .eq("id", socialAccount.id);
          }
        }

        await supabaseAdmin
          .from("scan_jobs")
          .update({ progress: 35 })
          .eq("id", jobId);

        // Fetch channel data
        const channelData = await fetchYouTubeChannel(accessToken);
        const channel = channelData.items?.[0];
        if (!channel) {
          await supabaseAdmin
            .from("scan_jobs")
            .update({ status: "failed", error: "No channel found" })
            .eq("id", jobId);
          return;
        }

        const subscribers = parseInt(channel.statistics?.subscriberCount || "0", 10);
        const totalViews = parseInt(channel.statistics?.viewCount || "0", 10);
        const videoCount = parseInt(channel.statistics?.videoCount || "0", 10);

        await supabaseAdmin
          .from("scan_jobs")
          .update({ progress: 70 })
          .eq("id", jobId);

        // Fetch videos
        const videosData = await fetchYouTubeVideos(accessToken, 10);
        const videos = videosData.items || [];

        // Calculate metrics
        const metrics = calculateMetrics(videos);

        // Update metrics
        await supabaseAdmin
          .from("creator_metrics")
          .upsert(
            {
              user_id: userId,
              platform: platform,
              followers: subscribers,
              total_views: totalViews,
              video_count: videoCount,
              avg_views_10: metrics.avg_views_10,
              engagement_rate_10: metrics.engagement_rate_10,
              top_videos: metrics.top_videos,
            },
            { onConflict: "user_id,platform" }
          );

        // Generate media kit
        await supabaseAdmin
          .from("scan_jobs")
          .update({ progress: 90 })
          .eq("id", jobId);

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("id", userId)
          .maybeSingle();

        const profileName = profile?.name || undefined;
        await generateAndStoreMediaKit(userId, profileName);

        // Complete
        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "complete", progress: 100 })
          .eq("id", jobId);
      } catch (error: any) {
        console.error("Scan error:", error);
        await supabaseAdmin
          .from("scan_jobs")
          .update({
            status: "failed",
            error: error.message || "Scan failed",
          })
          .eq("id", jobId);
      }
    })();

    return NextResponse.json({ success: true, jobId });
  } catch (error: any) {
    console.error("Scan run error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start scan" },
      { status: 500 }
    );
  }
}

