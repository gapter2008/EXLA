import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scanProviderAccount } from "@/lib/scanProviderAccount";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";
import { buildCreatorProfile } from "@/lib/profileBuilder";
import { runCreatorProfileAnalysis } from "@/lib/runCreatorProfileAnalysis";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';

/**
 * Unified scan start endpoint
 * Creates or reuses scan job and triggers scan pipeline
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body first
    const body = await req.json().catch(() => ({}));
    let userId: string | null = body.userId || null;
    const fromOAuth = body.fromOAuth === true; // When true, create new job and run pipeline even if there is an active job (OAuth callback placeholder)

    // Try to get from auth header if not in body
    if (!userId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && user) {
          userId = user.id;
        }
      }
    }

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized - user ID required" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Ensure profile exists (required for FK constraint)
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      // Create profile if it doesn't exist
      const { error: createError } = await supabaseAdmin
        .from("profiles")
        .insert({ id: userId })
        .select("id")
        .single();

      if (createError) {
        console.error("[Scan Start] Failed to create profile:", createError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }
    }

    // Check for existing active scan job (skip when called from OAuth so we always start the real pipeline)
    if (!fromOAuth) {
      const { data: activeJob } = await supabaseAdmin
        .from("scan_jobs")
        .select("id, status, progress, platform")
        .eq("user_id", userId)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeJob) {
        return NextResponse.json({
          ok: true,
          scan_job_id: activeJob.id,
          status: activeJob.status,
          platform: activeJob.platform,
        });
      }
    }

    // Find connected platform to scan
    // Include all statuses - we want to scan even if already scanned (for re-scan)
    const { data: connectedAccount } = await supabaseAdmin
      .from("social_accounts")
      .select("platform")
      .eq("user_id", userId)
      .in("scan_status", ["connected", "scanned", "scanned_partial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!connectedAccount) {
      return NextResponse.json(
        { error: "No connected social account found. Please connect a platform first." },
        { status: 404 }
      );
    }

    const platform = connectedAccount.platform;

    // Create new scan job
    const { data: scanJob, error: jobError } = await supabaseAdmin
      .from("scan_jobs")
      .insert({
        user_id: userId,
        platform: platform,
        status: "queued",
        progress: 0,
      })
      .select("id")
      .single();

    if (jobError || !scanJob) {
      console.error("[Scan Start] Failed to create scan job:", jobError);
      return NextResponse.json(
        { error: "Failed to create scan job" },
        { status: 500 }
      );
    }

    // Run pipeline: either await (fromOAuth) so scan completes before redirect, or fire-and-forget
    const runPipeline = async (): Promise<{ status: "complete" | "failed"; error?: string }> => {
      try {
        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "running", progress: 10 })
          .eq("id", scanJob.id);

        await scanProviderAccount(userId, platform as "youtube" | "tiktok");

        await supabaseAdmin
          .from("scan_jobs")
          .update({ progress: 70 })
          .eq("id", scanJob.id);

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("id", userId)
          .maybeSingle();
        const profileName = profile?.name || undefined;
        await generateAndStoreMediaKit(userId, profileName);

        try {
          await buildCreatorProfile(userId);
        } catch (profileErr: any) {
          console.warn("[Scan Start] Creator profile build failed (non-blocking):", profileErr.message);
        }

        try {
          const analysisResult = await runCreatorProfileAnalysis(userId);
          if (!analysisResult.success) {
            console.warn("[Scan Start] AI creator profile analysis failed (non-blocking):", analysisResult.error);
          }
        } catch (analysisErr: any) {
          console.warn("[Scan Start] AI creator profile analysis error (non-blocking):", analysisErr?.message);
        }

        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "complete", progress: 100 })
          .eq("id", scanJob.id);

        console.log(`[Scan Start] Scan completed for user ${userId}, platform ${platform}`);
        return { status: "complete" };
      } catch (scanError: any) {
        const errorMessage = (scanError.message || "Scan failed").substring(0, 500);
        console.error("[Scan Start] Scan pipeline failed:", scanError);
        if (process.env.NODE_ENV === "development") {
          console.error("[Scan Start] Full error stack:", scanError.stack);
        }
        try {
          await supabaseAdmin
            .from("scan_jobs")
            .update({ status: "failed", error: errorMessage, progress: 0 })
            .eq("id", scanJob.id);
        } catch (updateErr: any) {
          console.error("[Scan Start] CRITICAL: Failed to update scan_jobs status to failed:", updateErr);
        }
        return { status: "failed", error: errorMessage };
      }
    };

    if (fromOAuth) {
      // OAuth callback: await pipeline so scan completes before we return. Prevents serverless from killing the process before completion.
      const result = await runPipeline();
      return NextResponse.json({
        ok: result.status === "complete",
        scan_job_id: scanJob.id,
        status: result.status,
        platform: platform,
        error: result.error ?? undefined,
      });
    }

    // Non-OAuth (e.g. Try Again from UI): start pipeline in background, return immediately
    runPipeline().catch((err) => console.error("[Scan Start] Background pipeline error:", err));
    return NextResponse.json({
      ok: true,
      scan_job_id: scanJob.id,
      status: "queued",
      platform: platform,
    });
  } catch (error: any) {
    console.error("[Scan Start] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start scan" },
      { status: 500 }
    );
  }
}

