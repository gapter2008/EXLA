import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scanProviderAccount } from "@/lib/scanProviderAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sync YouTube data for the authenticated user.
 * Runs the same scan pipeline as /api/scan/start for YouTube only.
 * Returns computed metrics for demo/debug verification.
 */
export async function POST(req: NextRequest) {
  try {
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { supabase } = await import("@/lib/supabaseClient");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - sign in required" },
        { status: 401 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Database not configured" },
        { status: 500 }
      );
    }

    const { data: connectedAccount } = await supabaseAdmin
      .from("social_accounts")
      .select("platform")
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .in("scan_status", ["connected", "scanned", "scanned_partial"])
      .maybeSingle();

    if (!connectedAccount) {
      return NextResponse.json(
        {
          success: false,
          error: "No connected YouTube account. Connect YouTube first.",
        },
        { status: 404 }
      );
    }

    const scanData = await scanProviderAccount(userId, "youtube");

    const metrics = {
      followers: scanData.stats.followers ?? null,
      avg_views_10: scanData.stats.avg_views ?? null,
      engagement_rate_10: scanData.stats.engagement_rate ?? null,
      total_videos: scanData.stats.total_videos ?? null,
    };

    console.log(`[Sync YouTube] userId=${userId} metrics:`, metrics);

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error: any) {
    console.error("[Sync YouTube] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? "Sync failed",
      },
      { status: 500 }
    );
  }
}
