/**
 * Manual Enrichment Trigger
 * 
 * This endpoint allows manual triggering of contact enrichment for a specific brand.
 * Used by the UI when user clicks "Find contact" button.
 * 
 * POST /api/enrich/trigger
 * Body: { brandId: string } or { brandName: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertBrand, enqueueContactEnrichment, retryEnrichmentJob } from "@/lib/brandEnrichment";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const debugMode = searchParams.get('debug') === '1';
    
    const body = await req.json();
    const { brandId, brandName, debug } = body; // Also support debug in body
    const isDebug = debugMode || debug === true;

    if (!brandId && !brandName) {
      return NextResponse.json(
        { error: "Either brandId or brandName is required" },
        { status: 400 }
      );
    }

    let finalBrandId = brandId;

    // If brandName provided, upsert brand first
    if (brandName && !brandId) {
      try {
        finalBrandId = await upsertBrand(brandName, null);
      } catch (upsertError: any) {
        console.error("[Enrichment Trigger] Error upserting brand:", upsertError);
        return NextResponse.json(
          { error: `Failed to create brand record: ${upsertError.message}` },
          { status: 500 }
        );
      }
    }

    if (!finalBrandId) {
      return NextResponse.json(
        { error: "Failed to get brand ID" },
        { status: 500 }
      );
    }

    // Check if contact info already exists (complete or partial are both successes)
    const { data: existingContacts } = await (await import('@/lib/supabaseAdmin')).supabaseAdmin
      .from('brand_contacts')
      .select('enrichment_status, website_url')
      .eq('brand_id', finalBrandId)
      .single();

    // If contact info already exists (complete or partial), return so UI can show it without polling
    if (existingContacts && (existingContacts.enrichment_status === 'complete' || existingContacts.enrichment_status === 'partial')) {
      return NextResponse.json({
        success: true,
        brandId: finalBrandId,
        message: "Contact info already exists",
        alreadyComplete: true,
      });
    }

    // Enqueue enrichment job (or retry if failed)
    let jobId;
    try {
      jobId = await retryEnrichmentJob(finalBrandId);
    } catch (jobError: any) {
      console.error("[Enrichment Trigger] Error enqueueing job:", jobError);
      return NextResponse.json(
        { error: `Failed to enqueue enrichment job: ${jobError.message}` },
        { status: 500 }
      );
    }

    // Trigger worker immediately (debug mode passed as query param)
    const { getAppUrl } = await import("@/lib/appConfig");
    let baseUrl: string;
    try {
      baseUrl = getAppUrl(req);
    } catch (error: any) {
      // Fallback for development
      const origin = req.headers.get('origin') || req.headers.get('host') || 'http://localhost:3000';
      baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;
    }
    
    // Trigger worker asynchronously (don't wait)
    fetch(`${baseUrl}/api/enrich/brand-contacts?limit=1${debugMode ? '&debug=1' : ''}`, {
      method: 'POST',
    }).catch((workerError) => {
      console.error('[Enrichment Trigger] Error triggering worker (non-fatal):', workerError);
    });
    
    return NextResponse.json({
      success: true,
      brandId: finalBrandId,
      jobId,
      message: "Enrichment job enqueued",
    });
  } catch (error: any) {
    console.error("[Enrichment Trigger] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

