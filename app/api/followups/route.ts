import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { data: followups, error } = await supabaseAdmin
      .from("followups")
      .select(`
        *,
        pitches:pitch_id (
          id,
          brand_name,
          channel,
          subject
        )
      `)
      .eq("user_id", userId)
      .eq("status", "open")
      .order("due_at", { ascending: true });

    if (error) {
      console.error("Error fetching followups:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch followups" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, followups: followups || [] });
  } catch (error: any) {
    console.error("List followups error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch followups" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, followupId, status } = body;

    if (!userId || !followupId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: userId, followupId, status" },
        { status: 400 }
      );
    }

    const validStatuses = ['done', 'dismissed'];
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
      .from("followups")
      .update({ status: status })
      .eq("id", followupId)
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating followup:", error);
      return NextResponse.json(
        { error: error.message || "Failed to update followup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update followup error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update followup" },
      { status: 500 }
    );
  }
}

