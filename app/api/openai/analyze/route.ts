import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function POST(req: NextRequest) {
  try {
    const { postIds, userId } = await req.json();
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ error: "postIds required" }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // CRITICAL: Filter by user_id to prevent cross-user data access
    const { data: posts, error: postsErr } = await supabaseAdmin
      .from("social_posts")
      .select("id, caption, metrics, user_id")
      .in("id", postIds)
      .eq("user_id", userId); // Enforce user isolation
    if (postsErr) return NextResponse.json({ error: postsErr.message }, { status: 500 });
    
    // Leak detection guard
    if (posts) {
      const wrongUser = posts.find((p: any) => p.user_id && p.user_id !== userId);
      if (wrongUser) {
        console.error(`[Analyze API] CRITICAL: Data leak detected! userId=${userId}, found post.user_id=${wrongUser.user_id}`);
        return NextResponse.json({ error: "Data security error: returned posts do not match requested user" }, { status: 403 });
      }
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const analyses: any[] = [];

    for (const p of posts || []) {
      const prompt = `Analyze the following social post and its metrics. Output a 3-sentence what-worked summary and 3 short hooks tailored to repeat success.\n\nCaption: ${p.caption || ""}\nMetrics: ${JSON.stringify(p.metrics || {})}`;
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You analyze social posts concisely." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      });
      const text = res.choices[0]?.message?.content?.trim() || "";
      const hooks = text.split(/\n|-\s/).filter(Boolean).slice(-3); // naive extraction

      const { data, error } = await supabaseAdmin
        .from("post_analyses")
        .insert({ post_id: p.id, summary: text, hooks })
        .select("id, post_id, summary, hooks, created_at")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      analyses.push(data);
    }

    // Join with posts for response (filtered by user_id via RLS on social_posts)
    const { data: joined } = await supabaseAdmin
      .from("post_analyses")
      .select("id, post_id, summary, hooks, created_at, social_posts:post_id(id, caption, metrics, user_id)")
      .in("post_id", postIds);
    
    // Additional leak detection guard on joined results
    if (joined) {
      for (const analysis of joined) {
        const post = (analysis as any).social_posts;
        if (post && post.user_id && post.user_id !== userId) {
          console.error(`[Analyze API] CRITICAL: Data leak detected in joined results! userId=${userId}, found post.user_id=${post.user_id}`);
          return NextResponse.json({ error: "Data security error: returned analysis posts do not match requested user" }, { status: 403 });
        }
      }
    }

    return NextResponse.json({ ok: true, analyses: joined || analyses });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to analyze posts" }, { status: 500 });
  }
}


