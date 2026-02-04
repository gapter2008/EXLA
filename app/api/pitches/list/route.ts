import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

// Pitches table schema (0005): id, user_id, brand_name, brand_website, channel, subject, body, suggested_rate, deliverable, status, created_at, updated_at.
// GUARDRAIL: Do NOT add brand_id, deal_type, or generated_pitch - those columns do not exist on pitches.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const userId = searchParams.get("userId");
    const statusFilter = searchParams.get("status"); // optional: draft, sent, replied, closed, ignored

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    let query = supabaseAdmin
      .from("pitches")
      .select("id, user_id, brand_name, brand_website, channel, subject, body, suggested_rate, deliverable, status, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (statusFilter && ["draft", "sent", "replied", "closed", "ignored"].includes(statusFilter)) {
      query = query.eq("status", statusFilter);
    }

    const { data: pitches, error } = await query;

    if (error) {
      console.error("Error fetching pitches:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch pitches" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, pitches: pitches || [] });
  } catch (error: any) {
    console.error("List pitches error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch pitches" },
      { status: 500 }
    );
  }
}

