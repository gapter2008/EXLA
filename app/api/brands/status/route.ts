import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent static generation - uses searchParams

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");
    const userId = searchParams.get("userId");

    if (!jobId || !userId) {
      return NextResponse.json(
        { error: "jobId and userId are required" },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 }
      );
    }

    // Fetch job status (RLS ensures user can only see their own jobs)
    const { data: job, error } = await supabaseAdmin
      .from("brand_generation_jobs")
      .select("status, progress, step, error, detail_log")
      .eq("id", jobId)
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching job status:", error);
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 }
      );
    }

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Return last 10 log messages
    const log = (job.detail_log as string[]) || [];
    const recentLog = log.slice(-10);

    return NextResponse.json({
      status: job.status,
      progress: job.progress,
      step: job.step || null,
      error: job.error || null,
      log: recentLog,
    });
  } catch (error: any) {
    console.error("Error in /api/brands/status:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch job status" },
      { status: 500 }
    );
  }
}

