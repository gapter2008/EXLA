import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (!platform || !["youtube", "tiktok", "instagram"].includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform. Must be 'youtube', 'tiktok', or 'instagram'" },
        { status: 400 }
      );
    }

    // Delete from social_accounts
    const { error: accountError } = await supabaseAdmin
      .from("social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("platform", platform);

    if (accountError) {
      console.error("Error deleting social account:", accountError);
      return NextResponse.json(
        { error: "Failed to disconnect account" },
        { status: 500 }
      );
    }

    // Delete from creator_metrics
    const { error: metricsError } = await supabaseAdmin
      .from("creator_metrics")
      .delete()
      .eq("user_id", userId)
      .eq("platform", platform);

    if (metricsError) {
      console.error("Error deleting metrics:", metricsError);
      // Non-fatal, continue
    }

    // Optionally delete related scan_jobs
    const { error: jobsError } = await supabaseAdmin
      .from("scan_jobs")
      .delete()
      .eq("user_id", userId)
      .eq("platform", platform);

    if (jobsError) {
      console.error("Error deleting scan jobs:", jobsError);
      // Non-fatal, continue
    }

    // Rebuild media kit with remaining platforms
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, username")
        .eq("id", userId)
        .single();
      
      const profileName = profile?.full_name || profile?.username || undefined;
      await generateAndStoreMediaKit(userId, profileName);
    } catch (kitErr) {
      console.warn("Failed to regenerate media kit:", kitErr);
      // Non-fatal
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Disconnect error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to disconnect account" },
      { status: 500 }
    );
  }
}

