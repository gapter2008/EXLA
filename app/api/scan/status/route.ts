import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job");
    const userId = searchParams.get("userId"); // Client should pass userId for security

    if (!jobId) {
      return NextResponse.json({ error: "Missing job parameter" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId parameter" }, { status: 400 });
    }

    // Use admin client to bypass RLS, but verify ownership manually
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Fetch scan job and verify ownership
    const { data: job, error } = await supabaseAdmin
      .from("scan_jobs")
      .select("status, progress, error, user_id")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      console.error("Scan status error:", error);
      return NextResponse.json(
        { error: "Scan job not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (job.user_id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Return the job status
    return NextResponse.json({
      status: job.status,
      progress: job.progress,
      error: job.error || null,
    });
  } catch (error: any) {
    console.error("Scan status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get scan status" },
      { status: 500 }
    );
  }
}

