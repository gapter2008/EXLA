import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scanProviderAccount } from "@/lib/scanProviderAccount";
import { generateAndStoreMediaKit } from "@/lib/mediaKitHelpers";
import { buildCreatorProfile } from "@/lib/profileBuilder";

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

    // Check for existing active scan job
    const { data: activeJob } = await supabaseAdmin
      .from("scan_jobs")
      .select("id, status, progress, platform")
      .eq("user_id", userId)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      // Return existing job
      return NextResponse.json({
        ok: true,
        scan_job_id: activeJob.id,
        status: activeJob.status,
        platform: activeJob.platform,
      });
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

    // Start scan pipeline asynchronously (don't await)
    // CRITICAL: Status MUST move: queued -> running -> complete OR failed
    (async () => {
      try {
        // Step 1: Update status to running (progress 10%)
        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "running", progress: 10 })
          .eq("id", scanJob.id);

        // Step 2: Run scan pipeline (this fetches profile and stats)
        await scanProviderAccount(userId, platform as "youtube" | "tiktok");

        // Step 3: Update progress to 70% after scan pipeline
        await supabaseAdmin
          .from("scan_jobs")
          .update({ progress: 70 })
          .eq("id", scanJob.id);

        // Step 4: Generate media kit
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("id", userId)
          .maybeSingle();

        const profileName = profile?.name || undefined;
        await generateAndStoreMediaKit(userId, profileName);

        // Step 5: Build creator profile (non-blocking - don't fail scan if this fails)
        try {
          await buildCreatorProfile(userId);
        } catch (profileErr: any) {
          console.warn("[Scan Start] Creator profile build failed (non-blocking):", profileErr.message);
          // Continue - scan can complete without creator profile
        }

        // Step 6: Mark job as complete (status MUST be complete)
        await supabaseAdmin
          .from("scan_jobs")
          .update({ status: "complete", progress: 100 })
          .eq("id", scanJob.id);

        console.log(`[Scan Start] Scan completed for user ${userId}, platform ${platform}`);
      } catch (scanError: any) {
        // CRITICAL: On ANY error, status MUST be set to failed
        console.error("[Scan Start] Scan pipeline failed:", scanError);
        
        // Truncate error message to reasonable length (for database storage)
        const errorMessage = (scanError.message || "Scan failed").substring(0, 500);
        
        // Log full error stack in development
        if (process.env.NODE_ENV === 'development') {
          console.error("[Scan Start] Full error stack:", scanError.stack);
        }
        
        // Update status to failed - MUST happen even if this update fails
        try {
          await supabaseAdmin
            .from("scan_jobs")
            .update({
              status: "failed",
              error: errorMessage,
              progress: 0,
            })
            .eq("id", scanJob.id);
        } catch (updateErr: any) {
          // If update fails, log but don't throw (we're already in catch block)
          console.error(`[Scan Start] CRITICAL: Failed to update scan_jobs status to failed:`, updateErr);
        }
        
        // Log error for debugging (don't swallow errors - re-throw would cause unhandled rejection)
        console.error(`[Scan Start] Error stored in scan_job ${scanJob.id}:`, errorMessage);
        
        // Note: We don't re-throw here because this is an async IIFE and we don't want
        // to cause unhandled promise rejection. The error has been stored in scan_jobs.
      }
    })();

    // Return immediately with job ID
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

