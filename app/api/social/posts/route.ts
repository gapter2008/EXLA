import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("social_posts")
      .select("id, platform, platform_post_id, caption, metrics, posted_at, fetched_at, analyses:post_analyses(id, summary, hooks, created_at)")
      .eq("user_id", userId)
      .order("posted_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, posts: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to list posts" }, { status: 500 });
  }
}


