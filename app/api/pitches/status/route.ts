import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, pitchId, status } = body;

    if (!userId || !pitchId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: userId, pitchId, status" },
        { status: 400 }
      );
    }

    const validStatuses = ['replied', 'closed', 'ignored', 'draft', 'sent'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { error } = await supabaseAdmin
      .from("pitches")
      .update({
        status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pitchId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating pitch status:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update pitch status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update pitch status" },
      { status: 500 }
    );
  }
}

