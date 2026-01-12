import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function POST(req: NextRequest) {
  try {
    const { platform, userId } = await req.json();
    if (!platform || !userId) return NextResponse.json({ error: "Missing platform or userId" }, { status: 400 });

    // Verify token exists
    const { data: tokenRow, error: tokenErr } = await supabaseAdmin
      .from("tokens")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", platform)
      .single();
    if (tokenErr) return NextResponse.json({ error: "No token for user/platform" }, { status: 400 });

    const now = new Date();
    const demoPosts = Array.from({ length: 4 }).map((_, i) => ({
      user_id: userId,
      platform,
      platform_post_id: `demo_${platform}_${i + 1}`,
      caption: `Demo ${platform} post #${i + 1}`,
      metrics: { views: 1000 * (i + 1), likes: 100 * (i + 1), comments: 5 * (i + 1), shares: 2 * (i + 1) },
      posted_at: new Date(now.getTime() - (i + 1) * 86400000).toISOString(),
    }));

    const { data, error } = await supabaseAdmin
      .from("social_posts")
      .upsert(demoPosts, { onConflict: "user_id,platform,platform_post_id" })
      .select("*")
      .order("posted_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: data?.length || 0, posts: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to fetch posts" }, { status: 500 });
  }
}


