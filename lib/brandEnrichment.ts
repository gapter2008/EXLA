/**
 * Brand Contact Enrichment Utilities
 * 
 * This module provides functions to enqueue and retrieve brand contact enrichment jobs.
 * It handles the job queue and provides a clean interface for the UI to check enrichment status.
 */

import { supabaseAdmin } from './supabaseAdmin';

export interface BrandContactInfo {
  id?: string;
  brand_id: string;
  website_url?: string | null;
  contact_page_url?: string | null;
  email?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  linkedin_url?: string | null;
  source_url?: string | null;
  confidence?: number | null;
  last_enriched_at?: string | null;
  enrichment_status: 'pending' | 'complete' | 'failed';
  error?: string | null;
}

/**
 * Upsert a brand record and return the brand ID
 */
export async function upsertBrand(brandName: string, websiteUrl?: string | null): Promise<string> {
  if (!brandName) {
    throw new Error('Brand name is required');
  }

  // Extract domain from website URL if provided
  let domain: string | null = null;
  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      domain = url.hostname.replace('www.', '').toLowerCase();
    } catch {
      // Invalid URL, ignore
    }
  }

  // Upsert brand
  const { data, error } = await supabaseAdmin
    .from('brands')
    .upsert(
      {
        brand_name: brandName,
        website_url: websiteUrl || null,
        domain: domain || null,
      },
      {
        onConflict: 'brand_name,domain',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[Brand Enrichment] Error upserting brand:', error);
    
    // Provide helpful error message for missing table
    if (error.code === 'PGRST205' || error.message.includes("not find the table 'public.brands'")) {
      throw new Error(
        `Database migration required: The 'brands' table does not exist. ` +
        `Please run the migration file: supabase/migrations/run_enrichment_migrations.sql in your Supabase SQL Editor. ` +
        `Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query → Paste the migration SQL → Run`
      );
    }
    
    throw new Error(`Failed to upsert brand: ${error.message}`);
  }

  if (!data || !data.id) {
    throw new Error('Failed to get brand ID after upsert');
  }

  return data.id;
}

/**
 * Enqueue a contact enrichment job for a brand
 * Returns the job ID if successful
 */
export async function enqueueContactEnrichment(
  brandId: string,
  delaySeconds: number = 0
): Promise<string> {
  if (!brandId) {
    throw new Error('Brand ID is required');
  }

  const nextRunAt = delaySeconds > 0 
    ? new Date(Date.now() + delaySeconds * 1000).toISOString()
    : new Date().toISOString();

  // Check if there's already a pending or processing job for this brand
  const { data: existing } = await supabaseAdmin
    .from('contact_enrichment_jobs')
    .select('id, status')
    .eq('brand_id', brandId)
    .in('status', ['pending', 'processing'])
    .single();

  if (existing) {
    // Job already exists, return existing ID
    return existing.id;
  }

  // Create new job
  const { data, error } = await supabaseAdmin
    .from('contact_enrichment_jobs')
    .insert({
      brand_id: brandId,
      status: 'pending',
      attempts: 0,
      next_run_at: nextRunAt,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Brand Enrichment] Error enqueueing job:', error);
    throw new Error(`Failed to enqueue enrichment job: ${error.message}`);
  }

  if (!data || !data.id) {
    throw new Error('Failed to get job ID after insert');
  }

  return data.id;
}

/**
 * Get contact info for a brand
 * Returns null if no contact info exists or enrichment is pending
 */
export async function getBrandContacts(brandId: string): Promise<BrandContactInfo | null> {
  if (!brandId) {
    return null;
  }

  // First, get the brand to find contacts
  const { data: brand } = await supabaseAdmin
    .from('brands')
    .select('id, brand_name')
    .eq('id', brandId)
    .single();

  if (!brand) {
    return null;
  }

  // Get contact info
  const { data: contact, error } = await supabaseAdmin
    .from('brand_contacts')
    .select('id, brand_id, contact_name, contact_email, contact_phone, contact_role, created_at, updated_at')
    .eq('brand_id', brandId)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "not found", which is fine
    console.error('[Brand Enrichment] Error fetching contacts:', error);
    return null;
  }

  if (!contact) {
    // Check if there's a pending or processing job
    const { data: job } = await supabaseAdmin
      .from('contact_enrichment_jobs')
      .select('status, error')
      .eq('brand_id', brandId)
      .in('status', ['pending', 'processing'])
      .single();

    if (job) {
      return {
        brand_id: brandId,
        enrichment_status: 'pending',
        error: job.error || null,
      };
    }

    return null;
  }

  // Map 'partial' status to 'complete' for UI (partial is still a success)
  const status = contact.enrichment_status === 'partial' 
    ? 'complete' 
    : (contact.enrichment_status as 'pending' | 'complete' | 'failed');

  return {
    ...contact,
    enrichment_status: status,
  };
}

/**
 * Get contact info by brand name (for UI convenience)
 */
export async function getBrandContactsByName(brandName: string): Promise<BrandContactInfo | null> {
  if (!brandName) {
    return null;
  }

  // Find brand by name
  const { data: brand } = await supabaseAdmin
    .from('brands')
    .select('id')
    .eq('brand_name', brandName)
    .limit(1)
    .single();

  if (!brand) {
    return null;
  }

  return getBrandContacts(brand.id);
}

/**
 * Retry a failed enrichment job
 */
export async function retryEnrichmentJob(brandId: string): Promise<string> {
  // Delete any existing failed jobs
  await supabaseAdmin
    .from('contact_enrichment_jobs')
    .delete()
    .eq('brand_id', brandId)
    .eq('status', 'failed');

  // Create a new pending job
  return enqueueContactEnrichment(brandId, 0);
}

