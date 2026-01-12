/**
 * Brand Contact Enrichment Worker
 * 
 * Robust multi-step contact discovery pipeline with debug instrumentation:
 * 1. Use known website if present
 * 2. Search for official website via SerpAPI (with scoring)
 * 3. Crawl high-value pages (with proper headers, redirect following)
 * 4. Extract contacts deterministically (regex + link parsing)
 * 5. Refine with OpenAI (optional)
 * 6. Return partial results (website/contact page = success)
 * 
 * Usage:
 * POST /api/enrich/brand-contacts?limit=10&debug=1
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";
import { searchGoogle } from "@/lib/serpapi";

export const runtime = "nodejs";

const MAX_JOBS_PER_RUN = 10;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_SECONDS = 60;
const FETCH_TIMEOUT = 12000; // 12 seconds

interface EnrichmentJob {
  id: string;
  brand_id: string;
  status: string;
  attempts: number;
  next_run_at: string | null;
}

interface ContactInfo {
  website_url?: string | null;
  contact_page_url?: string | null;
  email?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  linkedin_url?: string | null;
  source_url?: string | null;
  confidence: number;
  status: 'complete' | 'partial';
}

interface DebugInfo {
  brand_name?: string;
  search_provider?: string;
  search_queries?: string[];
  search_results?: Array<{ url: string; title: string; score?: number }>;
  selected_website_url?: string;
  selected_website_reason?: string;
  fetched_urls?: Array<{
    url: string;
    final_url?: string;
    status: number;
    bytes?: number;
    error?: string;
  }>;
  extraction_counts?: {
    emails_found: number;
    socials_found: number;
    contact_pages_found: number;
  };
  final_status?: 'complete' | 'partial' | 'failed';
  error_details?: string;
  last_error_step?: 'search' | 'select_domain' | 'fetch' | 'extract' | 'save' | 'openai' | null;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Score a candidate URL for brand website selection
 */
function scoreCandidateUrl(url: string, title: string, snippet: string, brandName: string): number {
  let score = 0;
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const snippetLower = snippet.toLowerCase();
  const brandNameLower = brandName.toLowerCase().replace(/\s+/g, '');
  const hostname = extractDomain(url) || '';

  // +5 if hostname contains brand token
  const brandTokens = brandNameLower.split(/\s+/).filter(t => t.length > 3);
  for (const token of brandTokens) {
    if (hostname.includes(token)) {
      score += 5;
      break;
    }
  }

  // +4 if title/snippet includes "official"
  if (titleLower.includes('official') || snippetLower.includes('official')) {
    score += 4;
  }

  // +3 if domain is not a directory/marketplace
  const excludeDomains = [
    'linkedin.com', 'facebook.com', 'crunchbase.com', 'reddit.com', 
    'wikipedia.org', 'wikipedia.com', 'play.google.com', 'apps.apple.com',
    'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'tiktok.com'
  ];
  if (!excludeDomains.some(excluded => hostname.includes(excluded))) {
    score += 3;
  }

  // +2 if https and clean URL (no tracking params)
  if (url.startsWith('https://') && !url.includes('?utm_') && !url.includes('?ref=')) {
    score += 2;
  }

  // -5 if known non-official domains
  const nonOfficial = ['wikipedia', 'reddit', 'quora', 'medium.com', 'blogspot'];
  if (nonOfficial.some(domain => hostname.includes(domain))) {
    score -= 5;
  }

  return score;
}

/**
 * Deterministic email extraction from HTML (improved)
 */
function extractEmailsFromHTML(html: string, brandDomain: string | null): string[] {
  const emails: string[] = [];
  
  // Extract from mailto: links first (most reliable)
  const mailtoPattern = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  const mailtoMatches = html.matchAll(mailtoPattern);
  for (const match of mailtoMatches) {
    emails.push(match[1].toLowerCase().trim());
  }
  
  // Extract from text (regex)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const textMatches = html.match(emailRegex) || [];
  for (const email of textMatches) {
    emails.push(email.toLowerCase().trim());
  }
  
  // Filter and validate
  const validEmails = Array.from(new Set(emails)).filter(email => {
    // Filter out common non-contact emails
    const excludePatterns = [
      'noreply', 'no-reply', 'donotreply', 'privacy', 'legal', 'abuse',
      'security', 'dmca', 'copyright', 'unsubscribe', 'bounce', 'postmaster'
    ];
    const emailLocal = email.split('@')[0];
    if (excludePatterns.some(pattern => emailLocal.includes(pattern))) {
      return false;
    }
    
    // Prefer branded emails
    const preferredPatterns = [
      'partnerships', 'partners', 'collab', 'collaborations', 'business',
      'marketing', 'hello', 'contact', 'info', 'support', 'brand', 'team', 'sales'
    ];
    if (preferredPatterns.some(pattern => emailLocal.includes(pattern))) {
      return true;
    }
    
    // If domain matches, include it
    if (brandDomain) {
      const emailDomain = email.split('@')[1];
      return emailDomain === brandDomain || emailDomain === `mail.${brandDomain}`;
    }
    
    return false;
  });
  
  // Sort by preference
  return validEmails.sort((a, b) => {
    const aLocal = a.split('@')[0];
    const bLocal = b.split('@')[0];
    const aScore = ['partnerships', 'partners', 'collab', 'business', 'sales'].some(p => aLocal.includes(p)) ? 1 : 0;
    const bScore = ['partnerships', 'partners', 'collab', 'business', 'sales'].some(p => bLocal.includes(p)) ? 1 : 0;
    return bScore - aScore;
  });
}

/**
 * Deterministic social link extraction from HTML (improved)
 */
function extractSocialLinks(html: string): {
  instagram?: string;
  tiktok?: string;
  linkedin?: string;
} {
  const socials: any = {};
  
  // Extract from href attributes (most common)
  const hrefPattern = /href=["']([^"']*(?:instagram|tiktok|linkedin)[^"']*)["']/gi;
  const hrefMatches = html.matchAll(hrefPattern);
  
  for (const match of hrefMatches) {
    const url = match[1];
    
    // Instagram
    if (url.includes('instagram.com') && !socials.instagram) {
      const instaMatch = url.match(/(?:instagram\.com\/|@)([a-zA-Z0-9._]+)/);
      if (instaMatch) {
        socials.instagram = `https://www.instagram.com/${instaMatch[1].replace('@', '')}`;
      }
    }
    
    // TikTok
    if (url.includes('tiktok.com') && !socials.tiktok) {
      const tiktokMatch = url.match(/(?:tiktok\.com\/@|@)([a-zA-Z0-9._]+)/);
      if (tiktokMatch) {
        socials.tiktok = `https://www.tiktok.com/@${tiktokMatch[1].replace('@', '')}`;
      }
    }
    
    // LinkedIn (only company pages)
    if (url.includes('linkedin.com/company') && !socials.linkedin) {
      const linkedinMatch = url.match(/linkedin\.com\/company\/([a-zA-Z0-9._-]+)/);
      if (linkedinMatch) {
        socials.linkedin = `https://www.linkedin.com/company/${linkedinMatch[1]}`;
      }
    }
  }
  
  // Fallback: regex patterns in text
  if (!socials.instagram) {
    const instaPattern = /(?:instagram\.com\/|@)([a-zA-Z0-9._]+)/gi;
    const match = html.match(instaPattern);
    if (match && match[0]) {
      const handle = match[0].replace(/instagram\.com\/|@/g, '');
      socials.instagram = `https://www.instagram.com/${handle}`;
    }
  }
  
  if (!socials.tiktok) {
    const tiktokPattern = /(?:tiktok\.com\/@|@)([a-zA-Z0-9._]+)/gi;
    const match = html.match(tiktokPattern);
    if (match && match[0]) {
      const handle = match[0].replace(/tiktok\.com\/@|@/g, '');
      socials.tiktok = `https://www.tiktok.com/@${handle}`;
    }
  }
  
  return socials;
}

/**
 * Extract contact page URLs from HTML (improved)
 */
function extractContactPages(html: string, baseUrl: string): string[] {
  const contactUrls: string[] = [];
  const baseDomain = extractDomain(baseUrl) || '';
  const baseOrigin = new URL(baseUrl).origin;
  
  // Keywords for contact pages
  const contactKeywords = ['contact', 'about', 'partnership', 'sponsor', 'support', 'press', 'media', 'collab'];
  
  // Extract from href attributes
  const linkPattern = /href=["']([^"']*)["']/gi;
  const matches = html.matchAll(linkPattern);
  
  for (const match of matches) {
    let url = match[1];
    
    // Skip if doesn't contain contact keywords
    if (!contactKeywords.some(keyword => url.toLowerCase().includes(keyword))) {
      continue;
    }
    
    // Convert relative URLs to absolute
    if (url.startsWith('/')) {
      url = `${baseOrigin}${url}`;
    } else if (!url.startsWith('http')) {
      continue;
    }
    
    // Only include URLs from same domain
    try {
      const urlDomain = extractDomain(url);
      if (urlDomain === baseDomain && !contactUrls.includes(url)) {
        contactUrls.push(url.split('?')[0]); // Remove query params
      }
    } catch {
      continue;
    }
  }
  
  // Deduplicate and prioritize
  const unique = Array.from(new Set(contactUrls));
  return unique
    .sort((a, b) => {
      // Prioritize /contact over others
      if (a.includes('/contact')) return -1;
      if (b.includes('/contact')) return 1;
      return 0;
    })
    .slice(0, 3);
}

/**
 * Fetch a URL with proper headers, follow redirects, and return detailed info
 */
async function fetchPageContent(
  url: string,
  timeout: number = FETCH_TIMEOUT
): Promise<{ content: string | null; status: number; finalUrl: string; bytes: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow', // Follow redirects
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const finalUrl = response.url; // Final URL after redirects
    const status = response.status;
    
    if (!response.ok) {
      return {
        content: null,
        status,
        finalUrl,
        bytes: 0,
        error: `HTTP ${status}`,
      };
    }
    
    const html = await response.text();
    return {
      content: html,
      status,
      finalUrl,
      bytes: html.length,
    };
  } catch (error: any) {
    let errorMsg = 'Unknown error';
    if (error.name === 'AbortError') {
      errorMsg = 'Timeout';
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    return {
      content: null,
      status: 0,
      finalUrl: url,
      bytes: 0,
      error: errorMsg,
    };
  }
}

/**
 * Find official website via search API with scoring
 */
async function findOfficialWebsite(
  brandName: string,
  serpApiKey: string,
  debug?: DebugInfo
): Promise<{ url: string | null; candidates: Array<{ url: string; title: string; score: number }> }> {
  const queries = [
    `${brandName} official site`,
    `${brandName} official website`,
    `${brandName} contact`,
  ];
  
  if (debug) {
    debug.search_provider = 'SerpAPI';
    debug.search_queries = queries;
    debug.search_results = [];
  }
  
  const allCandidates: Array<{ url: string; title: string; snippet: string; score: number }> = [];
  
  for (const query of queries) {
    try {
      console.log(`[Enrichment ${debug?.brand_name || 'Unknown'}] Searching: ${query}`);
      const results = await searchGoogle(query, serpApiKey);
      
      if (!results || results.length === 0) {
        continue;
      }
      
      // Score each result
      for (const result of results.slice(0, 10)) {
        const score = scoreCandidateUrl(result.link, result.title || '', result.snippet || '', brandName);
        allCandidates.push({
          url: result.link,
          title: result.title || '',
          snippet: result.snippet || '',
          score,
        });
      }
    } catch (error: any) {
      console.error(`[Enrichment] Error searching for "${query}":`, error.message);
      if (debug) {
        debug.error_details = `Search failed: ${error.message}`;
      }
      continue;
    }
  }
  
  // Deduplicate by URL and sort by score
  const uniqueCandidates = Array.from(
    new Map(allCandidates.map(c => [c.url, c])).values()
  ).sort((a, b) => b.score - a.score);
  
  if (debug) {
    debug.search_results = uniqueCandidates.slice(0, 5).map(c => ({
      url: c.url,
      title: c.title,
      score: c.score,
    }));
  }
  
  // Return best candidate (even if score is low, we'll try it)
  if (uniqueCandidates.length > 0) {
    const best = uniqueCandidates[0];
    console.log(`[Enrichment ${debug?.brand_name || 'Unknown'}] Selected: ${best.url} (score: ${best.score})`);
    
    if (debug) {
      debug.selected_website_url = best.url;
      debug.selected_website_reason = `Highest score: ${best.score} (${best.title})`;
    }
    
    return {
      url: best.url,
      candidates: uniqueCandidates.slice(0, 5).map(c => ({
        url: c.url,
        title: c.title,
        score: c.score,
      })),
    };
  }
  
  return { url: null, candidates: [] };
}

/**
 * Extract contact info deterministically from HTML pages
 */
function extractContactsDeterministic(
  brandName: string,
  websiteUrl: string,
  pages: Array<{ url: string; html: string }>
): ContactInfo & { extractionCounts: { emails: number; socials: number; contactPages: number } } {
  const brandDomain = extractDomain(websiteUrl);
  let bestEmail: string | null = null;
  let contactPageUrl: string | null = null;
  const socials: any = {};
  let sourceUrl = websiteUrl;
  let confidence = 50;
  
  let emailsFound = 0;
  let socialsFound = 0;
  let contactPagesFound = 0;
  
  // Process each page
  for (const page of pages) {
    if (!page.html) continue;
    
    // Extract emails
    const emails = extractEmailsFromHTML(page.html, brandDomain);
    emailsFound += emails.length;
    if (emails.length > 0 && !bestEmail) {
      bestEmail = emails[0];
      sourceUrl = page.url;
      confidence = page.url.includes('/contact') ? 85 : 75;
    }
    
    // Extract social links
    const pageSocials = extractSocialLinks(page.html);
    if (pageSocials.instagram && !socials.instagram) {
      socials.instagram = pageSocials.instagram;
      socialsFound++;
    }
    if (pageSocials.tiktok && !socials.tiktok) {
      socials.tiktok = pageSocials.tiktok;
      socialsFound++;
    }
    if (pageSocials.linkedin && !socials.linkedin) {
      socials.linkedin = pageSocials.linkedin;
      socialsFound++;
    }
    
    // Extract contact pages
    const contactPages = extractContactPages(page.html, websiteUrl);
    contactPagesFound += contactPages.length;
    if (contactPages.length > 0 && !contactPageUrl) {
      contactPageUrl = contactPages[0];
    }
  }
  
  // Determine status: complete if email found, partial if website/contact page/socials found
  let status: 'complete' | 'partial' = 'partial';
  if (bestEmail) {
    status = 'complete';
    confidence = Math.max(confidence, 80);
  } else if (contactPageUrl) {
    status = 'partial';
    confidence = 60;
  } else if (socials.instagram || socials.tiktok || socials.linkedin) {
    status = 'partial';
    confidence = 55;
  } else if (websiteUrl) {
    status = 'partial';
    confidence = 40; // Website only
  }
  
  return {
    website_url: websiteUrl,
    contact_page_url: contactPageUrl,
    email: bestEmail,
    instagram_url: socials.instagram || null,
    tiktok_url: socials.tiktok || null,
    linkedin_url: socials.linkedin || null,
    source_url: sourceUrl,
    confidence,
    status,
    extractionCounts: {
      emails: emailsFound,
      socials: socialsFound,
      contactPages: contactPagesFound,
    },
  };
}

/**
 * Refine contacts with OpenAI (optional enhancement)
 */
async function refineWithOpenAI(
  brandName: string,
  websiteUrl: string,
  deterministicResults: ContactInfo,
  pages: Array<{ url: string; html: string }>,
  openaiClient: OpenAI
): Promise<ContactInfo> {
  // If we already have email, skip OpenAI (save costs)
  if (deterministicResults.email) {
    return deterministicResults;
  }
  
  try {
    const pagesContext = pages
      .filter(p => p.html)
      .map(p => `URL: ${p.url}\nContent: ${p.html.substring(0, 2000)}`)
      .join('\n\n---\n\n');
    
    const prompt = `Extract brand contact email for "${brandName}" from these pages:

${pagesContext}

Brand website: ${websiteUrl}
Brand domain: ${extractDomain(websiteUrl) || 'Unknown'}

Return JSON with:
{
  "email": "partnerships@domain.com" (ONLY if found, must match domain or be hello@/contact@/partnerships@),
  "contact_page_url": "https://example.com/contact" (if specific contact page found),
  "confidence": 85 (0-100)
}

If no valid email found, return {"email": null, "confidence": 0}.`;

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Extract only brand contact emails. Return valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 200,
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return deterministicResults;
    }
    
    const parsed = JSON.parse(content);
    
    // Validate OpenAI results
    if (parsed.email && typeof parsed.email === 'string') {
      const email = parsed.email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const brandDomain = extractDomain(websiteUrl);
      
      if (emailRegex.test(email)) {
        const emailDomain = email.split('@')[1];
        const isValid = brandDomain 
          ? (emailDomain === brandDomain || emailDomain === `mail.${brandDomain}`)
          : ['hello', 'contact', 'info', 'partnerships', 'partners', 'business'].some(p => email.includes(p));
        
        if (isValid) {
          return {
            ...deterministicResults,
            email,
            contact_page_url: parsed.contact_page_url || deterministicResults.contact_page_url,
            confidence: Math.max(deterministicResults.confidence, parsed.confidence || 70),
            status: 'complete',
          };
        }
      }
    }
    
    return deterministicResults;
  } catch (error: any) {
    console.error('[Enrichment] OpenAI refinement failed (using deterministic):', error.message);
    return deterministicResults;
  }
}

/**
 * Process a single enrichment job
 */
async function processEnrichmentJob(job: EnrichmentJob, debugMode: boolean = false): Promise<DebugInfo | null> {
  const jobId = job.id;
  const debug: DebugInfo = {};
  
  console.log(`[Enrichment Job ${jobId}] Processing brand_id ${job.brand_id}`);
  
  // Mark job as processing
  await supabaseAdmin
    .from('contact_enrichment_jobs')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  try {
    // Step 1: Get brand info
    const { data: brand, error: brandError } = await supabaseAdmin
      .from('brands')
      .select('brand_name, website_url, domain')
      .eq('id', job.brand_id)
      .single();

    if (brandError || !brand) {
      throw new Error(`Brand not found: ${job.brand_id}`);
    }

    const brandName = brand.brand_name;
    let websiteUrl = brand.website_url;
    
    debug.brand_name = brandName;
    console.log(`[Enrichment Job ${jobId}] Brand: ${brandName}, Website: ${websiteUrl || 'None'}`);

    // Step 2: Check SerpAPI key
    const serpApiKey = process.env.SERPAPI_KEY;
    if (!serpApiKey) {
      debug.error_details = 'SERPAPI_KEY missing';
      debug.last_error_step = 'search';
      throw new Error('SERPAPI_KEY not configured');
    }

    // Step 3: Find website if not present
    if (!websiteUrl) {
      console.log(`[Enrichment Job ${jobId}] Website not found, searching...`);
      debug.last_error_step = 'search';
      
      const searchResult = await findOfficialWebsite(brandName, serpApiKey, debug);
      websiteUrl = searchResult.url;
      
      if (!websiteUrl) {
        // Try at least 2 candidate domains before giving up
        if (searchResult.candidates.length >= 2) {
          // Try second candidate
          websiteUrl = searchResult.candidates[1].url;
          console.log(`[Enrichment Job ${jobId}] Trying second candidate: ${websiteUrl}`);
          debug.selected_website_url = websiteUrl;
          debug.selected_website_reason = `Second candidate (score: ${searchResult.candidates[1].score})`;
        } else {
          throw new Error('Could not find brand website');
        }
      }
      
      // Update brand record
      const domain = extractDomain(websiteUrl);
      await supabaseAdmin
        .from('brands')
        .update({
          website_url: websiteUrl,
          domain: domain,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.brand_id);
      
      console.log(`[Enrichment Job ${jobId}] Found website: ${websiteUrl}`);
    } else {
      debug.selected_website_url = websiteUrl;
      debug.selected_website_reason = 'Already known';
    }

    // Step 4: Fetch high-value pages
    const baseUrl = websiteUrl.replace(/\/$/, '');
    const pathsToCheck = [
      '', // Homepage
      '/contact',
      '/contact-us',
      '/about',
      '/partnerships',
      '/support',
    ];
    
    debug.last_error_step = 'fetch';
    console.log(`[Enrichment Job ${jobId}] Fetching ${pathsToCheck.length} pages...`);
    
    const fetchPromises = pathsToCheck.slice(0, 4).map(async (path) => {
      const url = path ? `${baseUrl}${path}` : baseUrl;
      const result = await fetchPageContent(url, FETCH_TIMEOUT);
      return {
        url: result.finalUrl,
        html: result.content,
        status: result.status,
        bytes: result.bytes,
        error: result.error,
      };
    });
    
    const fetchResults = await Promise.all(fetchPromises);
    debug.fetched_urls = fetchResults.map(r => ({
      url: r.url,
      final_url: r.url,
      status: r.status,
      bytes: r.bytes,
      error: r.error,
    }));
    
    const successfulPages = fetchResults.filter(p => p.html && p.status === 200);
    
    console.log(`[Enrichment Job ${jobId}] Successfully fetched ${successfulPages.length}/${fetchResults.length} pages`);
    
    // Step 5: Extract contacts deterministically
    debug.last_error_step = 'extract';
    console.log(`[Enrichment Job ${jobId}] Extracting contacts...`);
    
    const deterministicResults = extractContactsDeterministic(
      brandName,
      websiteUrl,
      successfulPages.map(p => ({ url: p.url, html: p.html! }))
    );
    
    debug.extraction_counts = {
      emails_found: deterministicResults.extractionCounts.emails,
      socials_found: deterministicResults.extractionCounts.socials,
      contact_pages_found: deterministicResults.extractionCounts.contactPages,
    };
    
    console.log(`[Enrichment Job ${jobId}] Extraction results:`, debug.extraction_counts);

    // Step 6: Determine final status based on what we found
    // Success if we have at least website OR contact page
    const hasWebsite = !!websiteUrl;
    const hasContactPage = !!deterministicResults.contact_page_url;
    const hasEmail = !!deterministicResults.email;
    const hasSocials = !!(deterministicResults.instagram_url || deterministicResults.tiktok_url || deterministicResults.linkedin_url);
    
    // Extract counts before creating final results (they're not part of ContactInfo)
    const extractionCounts = deterministicResults.extractionCounts;
    
    let finalResults: ContactInfo = {
      website_url: deterministicResults.website_url || websiteUrl,
      contact_page_url: deterministicResults.contact_page_url,
      email: deterministicResults.email,
      instagram_url: deterministicResults.instagram_url,
      tiktok_url: deterministicResults.tiktok_url,
      linkedin_url: deterministicResults.linkedin_url,
      source_url: deterministicResults.source_url,
      confidence: deterministicResults.confidence,
      status: deterministicResults.status,
    };
    
    // Only mark as failed if we have nothing
    if (!hasWebsite && !hasContactPage && !hasEmail && !hasSocials) {
      // Try OpenAI as last resort
      if (successfulPages.length > 0) {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (openaiApiKey) {
          console.log(`[Enrichment Job ${jobId}] No contacts found, trying OpenAI...`);
          const openaiClient = new OpenAI({ apiKey: openaiApiKey });
          const refined = await refineWithOpenAI(
            brandName,
            websiteUrl,
            finalResults,
            successfulPages.map(p => ({ url: p.url, html: p.html! })),
            openaiClient
          );
          finalResults = refined;
          
          if (finalResults.email) {
            console.log(`[Enrichment Job ${jobId}] OpenAI found email: ${finalResults.email}`);
            debug.extraction_counts!.emails_found = 1;
          }
        }
      }
      
      // Final check after OpenAI: still nothing?
      const finalHasWebsite = !!finalResults.website_url;
      const finalHasContactPage = !!finalResults.contact_page_url;
      const finalHasEmail = !!finalResults.email;
      const finalHasSocials = !!(finalResults.instagram_url || finalResults.tiktok_url || finalResults.linkedin_url);
      
      if (!finalHasWebsite && !finalHasContactPage && !finalHasEmail && !finalHasSocials) {
        throw new Error('No contact information found after all strategies');
      }
      
      // If we have at least website or contact page, it's partial success
      if ((finalHasWebsite || finalHasContactPage) && !finalHasEmail) {
        finalResults.status = 'partial';
      }
    } else {
      // We have something from deterministic extraction - ensure status is correct
      if (hasEmail) {
        finalResults.status = 'complete';
      } else if (hasWebsite || hasContactPage || hasSocials) {
        finalResults.status = 'partial';
      }
    }
    
    // Always ensure website_url is set
    if (!finalResults.website_url) {
      finalResults.website_url = websiteUrl;
      finalResults.status = 'partial'; // Website only = partial
    }

    // Step 7: Save results (always save, even if partial)
    debug.last_error_step = undefined; // Clear error step on success
    console.log(`[Enrichment Job ${jobId}] Saving results with status: ${finalResults.status}`);
    
    await saveContactInfo(job.brand_id, finalResults, debug);
    
    debug.final_status = finalResults.status;
    console.log(`[Enrichment Job ${jobId}] Complete with status: ${finalResults.status}`);
    
    // Step 8: Mark job as complete (or partial - both are successes)
    await supabaseAdmin
      .from('contact_enrichment_jobs')
      .update({
        status: 'complete', // Mark as complete even if partial (website found = success)
        debug_json: debugMode ? debug : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    
    return debugMode ? debug : null;
      
  } catch (error: any) {
    console.error(`[Enrichment Job ${jobId}] Error:`, error.message);
    console.error(`[Enrichment Job ${jobId}] Stack:`, error.stack);

    debug.final_status = 'failed';
    debug.error_details = error.message;
    
    const newAttempts = (job.attempts || 0) + 1;
    const shouldRetry = newAttempts < MAX_RETRY_ATTEMPTS;
    const nextRunAt = shouldRetry
      ? new Date(Date.now() + RETRY_DELAY_SECONDS * Math.pow(2, newAttempts - 1) * 1000).toISOString()
      : null;

    // Update job status with debug info
    await supabaseAdmin
      .from('contact_enrichment_jobs')
      .update({
        status: shouldRetry ? 'pending' : 'failed',
        attempts: newAttempts,
        error: error.message || 'Unknown error',
        next_run_at: nextRunAt,
        debug_json: debugMode ? debug : null,
        last_error_step: debug.last_error_step || null,
        last_http_status: debug.fetched_urls?.[debug.fetched_urls.length - 1]?.status || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Update brand_contacts status
    await supabaseAdmin
      .from('brand_contacts')
      .upsert(
        {
          brand_id: job.brand_id,
          enrichment_status: shouldRetry ? 'pending' : 'failed',
          error: error.message || 'Unknown error',
          debug_json: debugMode ? debug : null,
          last_error_step: debug.last_error_step || null,
        },
        {
          onConflict: 'brand_id',
        }
      );
    
    if (!shouldRetry) {
      throw error; // Re-throw if max attempts reached
    }
    
    return debugMode ? debug : null;
  }
}

/**
 * Save contact info to database
 */
async function saveContactInfo(brandId: string, contactInfo: ContactInfo, debug?: DebugInfo): Promise<void> {
  const { error } = await supabaseAdmin
    .from('brand_contacts')
    .upsert(
      {
        brand_id: brandId,
        website_url: contactInfo.website_url || null,
        contact_page_url: contactInfo.contact_page_url || null,
        email: contactInfo.email || null,
        instagram_url: contactInfo.instagram_url || null,
        tiktok_url: contactInfo.tiktok_url || null,
        linkedin_url: contactInfo.linkedin_url || null,
        source_url: contactInfo.source_url || null,
        confidence: contactInfo.confidence,
        last_enriched_at: new Date().toISOString(),
        enrichment_status: contactInfo.status, // 'complete' or 'partial'
        debug_json: debug || null,
      },
      {
        onConflict: 'brand_id',
      }
    );

  if (error) {
    throw new Error(`Failed to save contact info: ${error.message}`);
  }
}

/**
 * Main handler
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || String(MAX_JOBS_PER_RUN), 10);
    const debugMode = searchParams.get('debug') === '1';

    // Fetch pending jobs ready to process
    const now = new Date().toISOString();
    const { data: allPendingJobs, error: jobsError } = await supabaseAdmin
      .from('contact_enrichment_jobs')
      .select('id, brand_id, status, attempts, next_run_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(Math.min(limit * 2, MAX_JOBS_PER_RUN * 2));
    
    if (jobsError) {
      return NextResponse.json(
        { error: `Failed to fetch jobs: ${jobsError.message}` },
        { status: 500 }
      );
    }

    // Filter jobs that are ready to process
    const jobs = (allPendingJobs || []).filter((job: any) => {
      if (!job.next_run_at) return true;
      return job.next_run_at <= now;
    }).slice(0, Math.min(limit, MAX_JOBS_PER_RUN));

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending jobs to process',
        processed: 0,
      });
    }

    console.log(`[Enrichment Worker] Processing ${jobs.length} jobs (debug: ${debugMode})`);

    // Process jobs sequentially
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      debug: [] as DebugInfo[],
    };

    for (const job of jobs) {
      try {
        const debug = await processEnrichmentJob(job as EnrichmentJob, debugMode);
        if (debug) {
          results.debug.push(debug);
        }
        results.succeeded++;
      } catch (error: any) {
        console.error(`[Enrichment] Failed to process job ${job.id}:`, error);
        results.failed++;
      }
      results.processed++;
    }

    const response: any = {
      success: true,
      message: `Processed ${results.processed} jobs`,
      ...results,
    };

    if (debugMode && results.debug.length > 0) {
      response.debug_details = results.debug;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Enrichment] Error in handler:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and stats
 */
export async function GET() {
  try {
      const { data: allJobs } = await supabaseAdmin
        .from('contact_enrichment_jobs')
        .select('status');
      
      const stats = {
        pending: allJobs?.filter(j => j.status === 'pending').length || 0,
        processing: allJobs?.filter(j => j.status === 'processing').length || 0,
        complete: allJobs?.filter(j => j.status === 'complete').length || 0,
        failed: allJobs?.filter(j => j.status === 'failed').length || 0,
      };

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
