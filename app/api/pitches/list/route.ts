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

    const { data: pitches, error } = await supabaseAdmin
      .from("pitches")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

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

