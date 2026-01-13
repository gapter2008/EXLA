/**
 * Get Brand Contacts API
 * 
 * Returns contact information for a brand by name or ID.
 * Used by Discover UI to display contact info on brand cards.
 * 
 * GET /api/enrich/get-contacts?brandName=ExampleBrand
 * GET /api/enrich/get-contacts?brandId=uuid
 */

import { NextRequest, NextResponse } from "next/server";
import { getBrandContacts, getBrandContactsByName } from "@/lib/brandEnrichment";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent static generation - uses request.url

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brandName = searchParams.get('brandName');
    const brandId = searchParams.get('brandId');

    if (!brandName && !brandId) {
      return NextResponse.json(
        { error: "Either brandName or brandId is required" },
        { status: 400 }
      );
    }

    // Fetch contact info
    let contactInfo;
    if (brandId) {
      contactInfo = await getBrandContacts(brandId);
    } else {
      contactInfo = await getBrandContactsByName(brandName!);
    }

    if (!contactInfo) {
      return NextResponse.json({
        status: 'none',
        contacts: [],
      });
    }

    // Build contacts array for UI - ALWAYS include website and contact_page_url if available
    const contacts: Array<{ type: string; label: string; value: string }> = [];

    // Always include website if available (even for partial results)
    if (contactInfo.website_url) {
      contacts.push({ type: 'website', label: 'Website', value: contactInfo.website_url });
    }
    
    // Always include contact page if available
    if (contactInfo.contact_page_url) {
      contacts.push({ type: 'form', label: 'Contact page', value: contactInfo.contact_page_url });
    }
    
    // Then add other contacts
    if (contactInfo.email) {
      contacts.push({ type: 'email', label: 'Email', value: contactInfo.email });
    }
    if (contactInfo.instagram_url) {
      contacts.push({ type: 'instagram', label: 'Instagram', value: contactInfo.instagram_url });
    }
    if (contactInfo.tiktok_url) {
      contacts.push({ type: 'tiktok', label: 'TikTok', value: contactInfo.tiktok_url });
    }
    if (contactInfo.linkedin_url) {
      contacts.push({ type: 'linkedin', label: 'LinkedIn', value: contactInfo.linkedin_url });
    }

// Normalize status for UI
type EnrichmentStatus = "none" | "partial" | "complete" | "failed";

const rawStatus: EnrichmentStatus =
  (contactInfo.enrichment_status as EnrichmentStatus) ?? "none";

// Treat 'partial' as success in UI
const uiStatus: "none" | "complete" | "failed" =
  rawStatus === "partial" || rawStatus === "complete" ? "complete" : rawStatus;


    return NextResponse.json({
      status: uiStatus,
      contacts,
      error: contactInfo.error || null,
      confidence: contactInfo.confidence || null,
      // Always include website_url and contact_page_url even if no email/socials (partial success)
      website_url: contactInfo.website_url || null,
      contact_page_url: contactInfo.contact_page_url || null,
    });
  } catch (error: any) {
    console.error("[Get Contacts] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

