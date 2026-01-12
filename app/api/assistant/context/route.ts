import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId parameter" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Fetch creator metrics (prioritize most recently connected platform, or TikTok > YouTube > Instagram)
    // First, get all metrics for this user to determine which platform to use
    const { data: allMetrics } = await supabaseAdmin
      .from("creator_metrics")
      .select("platform, followers, avg_views_10, engagement_rate_10, top_videos, updated_at, user_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    
    // Leak detection guard
    if (allMetrics) {
      const wrongUser = allMetrics.find((m: any) => m.user_id && m.user_id !== userId);
      if (wrongUser) {
        console.error(`[Context API] CRITICAL: Data leak detected! userId=${userId}, found metric.user_id=${wrongUser.user_id}`);
        throw new Error("Data security error: returned metrics do not match requested user");
      }
    }

    // Determine primary platform: use most recent, or TikTok if available, otherwise YouTube
    let primaryPlatform: string | null = null;
    let metrics: any = null;

    if (allMetrics && allMetrics.length > 0) {
      // Priority: most recent, or TikTok if available, otherwise YouTube
      const tiktokMetrics = allMetrics.find((m) => m.platform === "tiktok");
      const youtubeMetrics = allMetrics.find((m) => m.platform === "youtube");
      const mostRecent = allMetrics[0]; // Already sorted by updated_at desc

      // Prefer TikTok if available, otherwise most recent
      if (tiktokMetrics) {
        primaryPlatform = "tiktok";
        metrics = tiktokMetrics;
      } else if (youtubeMetrics) {
        primaryPlatform = "youtube";
        metrics = youtubeMetrics;
      } else {
        primaryPlatform = mostRecent.platform;
        metrics = mostRecent;
      }

      // Log which platform's data is being returned (for debugging)
      console.log(`[Context API] userId=${userId}, selected platform=${primaryPlatform}, available platforms=${allMetrics.map((m) => m.platform).join(",")}`);
    } else {
      console.log(`[Context API] userId=${userId}, no metrics found`);
    }

    // Fetch creator profile
    const { data: profile } = await supabaseAdmin
      .from("creator_profiles")
      .select("size_tier, primary_topics, keywords, summary, user_id")
      .eq("user_id", userId)
      .single();
    
    // Leak detection guard
    if (profile && profile.user_id !== userId) {
      console.error(`[Context API] CRITICAL: Data leak detected! userId=${userId}, profile.user_id=${profile.user_id}`);
      throw new Error("Data security error: returned profile does not match requested user");
    }

    // Fetch brand recommendations (top 5)
    const { data: recommendations } = await supabaseAdmin
      .from("brand_recommendations")
      .select("brand_name, category, status, user_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    
    // Leak detection guard
    if (recommendations) {
      const wrongUser = recommendations.find((r: any) => r.user_id && r.user_id !== userId);
      if (wrongUser) {
        console.error(`[Context API] CRITICAL: Data leak detected! userId=${userId}, found recommendation.user_id=${wrongUser.user_id}`);
        throw new Error("Data security error: returned recommendations do not match requested user");
      }
    }

    // Fetch pitches summary
    const { data: pitches } = await supabaseAdmin
      .from("pitches")
      .select("id, brand_name, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    // Calculate pitch counts
    const pitchCounts = {
      draft: 0,
      sent: 0,
      replied: 0,
      closed: 0,
    };

    if (pitches) {
      pitches.forEach((p: any) => {
        if (pitchCounts[p.status as keyof typeof pitchCounts] !== undefined) {
          pitchCounts[p.status as keyof typeof pitchCounts]++;
        }
      });
    }

    // Get all pitches for accurate counts
    const { data: allPitches } = await supabaseAdmin
      .from("pitches")
      .select("status")
      .eq("user_id", userId);

    if (allPitches) {
      const counts = { draft: 0, sent: 0, replied: 0, closed: 0 };
      allPitches.forEach((p: any) => {
        if (counts[p.status as keyof typeof counts] !== undefined) {
          counts[p.status as keyof typeof counts]++;
        }
      });
      Object.assign(pitchCounts, counts);
    }

    // Format top videos
    const topVideos = metrics?.top_videos 
      ? (Array.isArray(metrics.top_videos) ? metrics.top_videos : []).slice(0, 3)
      : [];

    // Note: RLS policies ensure only this user's data is returned

    return NextResponse.json({
      success: true,
      context: {
        creator_metrics: metrics ? {
          platform: metrics.platform || primaryPlatform,
          followers: metrics.followers || 0,
          avg_views_10: metrics.avg_views_10 || 0,
          engagement_rate_10: metrics.engagement_rate_10 || 0,
        } : null,
        creator_profile: profile ? {
          size_tier: profile.size_tier,
          primary_topics: profile.primary_topics || [],
          keywords: profile.keywords || [],
          summary: profile.summary,
        } : null,
        top_videos: topVideos.map((v: any) => ({
          title: v.title || "Untitled",
          views: v.views || 0,
          url: v.url || "",
        })),
        brand_recommendations: recommendations?.map((r: any) => ({
          brand_name: r.brand_name,
          category: r.category,
        })) || [],
        pitches_summary: {
          counts: pitchCounts,
          latest: pitches?.map((p: any) => ({
            brand_name: p.brand_name,
            status: p.status,
            created_at: p.created_at,
          })) || [],
        },
      },
    });
  } catch (error: any) {
    console.error("Context API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch context" },
      { status: 500 }
    );
  }
}

