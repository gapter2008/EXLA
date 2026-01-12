import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, pitchId } = body;

    if (!userId || !pitchId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, pitchId" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Update pitch status to 'sent'
    const { error: updateError } = await supabaseAdmin
      .from("pitches")
      .update({
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      .eq("id", pitchId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating pitch:", updateError);
      return NextResponse.json(
        { error: updateError.message || "Failed to mark pitch as sent" },
        { status: 500 }
      );
    }

    // Create follow-up task (3 days from now)
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 3);

    const { error: followupError } = await supabaseAdmin
      .from("followups")
      .insert({
        user_id: userId,
        pitch_id: pitchId,
        due_at: dueAt.toISOString(),
        status: 'open',
      });

    if (followupError) {
      console.error("Error creating followup:", followupError);
      // Don't fail the request if followup creation fails
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Mark sent error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark pitch as sent" },
      { status: 500 }
    );
  }
}

