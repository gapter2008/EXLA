import { NextRequest, NextResponse } from "next/server";
import { runCreatorProfileAnalysis } from "@/lib/runCreatorProfileAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analyze/creator-profile
 * Server-side only. Runs AI creator profile analysis and upserts creator_ai_profiles.
 * Idempotent: rerun updates the same row.
 */
export async function POST(req: NextRequest) {
  let userId: string | null = null;

  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) userId = user.id;
    }
    if (!userId) {
      const body = await req.json().catch(() => ({}));
      userId = (body as { userId?: string })?.userId ?? null;
    }

    if (!userId) {
      console.log("[analyze/creator-profile] POST unauthorized (no userId)");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[analyze/creator-profile] POST start", { userId });
    const result = await runCreatorProfileAnalysis(userId);

    if (!result.success) {
      const status = result.error?.includes("Unauthorized") ? 401
        : result.error?.includes("No content") || result.error?.includes("No connected") ? 400
        : 500;
      console.log("[analyze/creator-profile] POST result error", { status, error: result.error });
      return NextResponse.json(
        { error: result.error ?? "Analysis failed" },
        { status }
      );
    }

    console.log("[analyze/creator-profile] POST result success", { userId, profileId: (result.profile as any)?.id });
    return NextResponse.json({ success: true, profile: result.profile });
  } catch (err: any) {
    console.error("[analyze/creator-profile] POST exception", err);
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
