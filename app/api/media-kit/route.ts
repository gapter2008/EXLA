import { NextRequest, NextResponse } from "next/server";
import { getMediaKitData } from "@/lib/getMediaKitData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media-kit
 * Returns media kit data for the authenticated user.
 * Must be called server-side (or with Bearer token) so getMediaKitData runs with service role.
 */
export async function GET(req: NextRequest) {
  try {
    let userId: string | null = req.nextUrl.searchParams.get("userId") ?? null;

    if (!userId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7);
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) userId = user.id;
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - sign in required" },
        { status: 401 }
      );
    }

    const data = await getMediaKitData(userId);
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[media-kit] Error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to load media kit" },
      { status: 500 }
    );
  }
}
