import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";
import { searchGoogle, extractBrandName } from "@/lib/serpapi";
import crypto from "crypto";
import { upsertBrand, enqueueContactEnrichment } from "@/lib/brandEnrichment";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

/**
 * PERFORMANCE OPTIMIZATIONS:
 * - Deterministic query generation (skip OpenAI if creator_profile exists)
 * - Reduced query counts: 4-6 for nano, 6-8 for micro
 * - Parallel SerpAPI calls with concurrency cap (batches of 3-4)
 * - 24-hour cache for brand candidates (avoid redundant SerpAPI calls)
 * - Bulk DB writes (single insert)
 * - Timing diagnostics for bottleneck identification
 * 
 * Expected speed improvements:
 * - Cached regeneration: ~2-3 seconds (OpenAI scoring only)
 * - First-time generation: ~4-6 seconds (with parallel SerpAPI)
 * - Previous: ~15-20+ seconds (sequential SerpAPI + multiple OpenAI calls)
 */

// Comprehensive list of disallowed large brands/platforms for nano creators
const DISALLOWED_BRANDS = [
  // Platforms & Services
  'Twitch', 'Discord', 'YouTube', 'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Facebook', 'Instagram', 'TikTok', 'Twitter', 'X',
  // Gaming Platforms & Studios
  'Epic Games', 'Riot', 'Valve', 'Steam', 'Nintendo', 'PlayStation', 'Xbox', 'Activision', 'Electronic Arts', 'EA', 'Ubisoft',
  // Hardware Brands (Enterprise/Global)
  'Razer', 'Logitech', 'HyperX', 'SteelSeries', 'Corsair', 'Elgato', 'Blue', 'Shure', 'Rode',
  // Tech Giants
  'Samsung', 'LG', 'Sony', 'Canon', 'Nikon', 'Dell', 'HP', 'Lenovo', 'Intel', 'AMD', 'NVIDIA',
  // Retail/Commerce
  'Walmart', 'Target', 'Best Buy', 'Costco',
  // Entertainment
  'Disney', 'Netflix', 'Warner Bros', 'Sony Pictures', 'Paramount',
  // Food & Beverage
  'Coca-Cola', 'Pepsi', 'McDonald\'s', 'Starbucks', 'KFC', 'Pizza Hut', 'Domino\'s', 'Taco Bell', 'Subway',
  // Energy Drinks
  'Red Bull', 'Monster Energy', 'Rockstar Energy', 'G Fuel',
  // Fashion/Sportswear
  'Nike', 'Adidas', 'Puma', 'Under Armour', 'Reebok',
  // VPN/Tech services
  'NordVPN', 'ExpressVPN', 'Surfshark', 'McAfee', 'Norton',
  // Specific gaming titles that are too big
  'Raid: Shadow Legends', 'Call of Duty', 'Fortnite', 'PUBG', 'Minecraft', 'Roblox',
];

// Patterns that indicate platforms or mega brands (single-word common brands)
const PLATFORM_PATTERNS = [
  /^(twitch|discord|youtube|instagram|tiktok|facebook|twitter|linkedin|snapchat|pinterest|reddit|spotify|netflix|hulu|disney|amazon|google|microsoft|apple|meta|nvidia|intel|amd)$/i,
  /^(epic|riot|valve|steam|nintendo|playstation|xbox|ea|ubisoft|activision)$/i,
  /^(razor|logitech|hyperx|steelseries|corsair|elgato|shure|rode|blue)$/i,
  /^(nike|adidas|puma|apple|samsung|sony|lg|dell|hp|lenovo)$/i,
];

interface BrandRecommendation {
  brand_name: string;
  category?: string;
  why_match: string;
  suggested_pitch_angle: string;
  attainability_reason?: string;
  deal_type?: 'gifted' | 'affiliate' | 'paid';
  confidence: number;
  website?: string | null;
}

// Helper to check if a brand is disallowed (case-insensitive)
const isDisallowedBrand = (brandName: string): boolean => {
  const normalized = brandName.toLowerCase();
  return DISALLOWED_BRANDS.some(disallowed => {
    const disallowedLower = disallowed.toLowerCase();
    return normalized.includes(disallowedLower) || disallowedLower.includes(normalized);
  });
};

// Helper to check if brand looks like a platform or mega brand
const looksLikePlatform = (brandName: string): boolean => {
  const normalized = brandName.toLowerCase().trim();
  
  // Check against platform patterns
  if (PLATFORM_PATTERNS.some(pattern => pattern.test(normalized))) {
    return true;
  }
  
  // Single-word brands that are too generic/common
  if (normalized.split(/\s+/).length === 1 && normalized.length <= 8) {
    // Common single-word mega brands
    const singleWordBrands = ['twitch', 'discord', 'youtube', 'google', 'amazon', 'apple', 'microsoft', 'nvidia', 'intel', 'amd'];
    if (singleWordBrands.includes(normalized)) {
      return true;
    }
  }
  
  return false;
};

// Helper to check if topics include Minecraft/gaming
const hasMinecraftOrGaming = (topics: string[]): boolean => {
  const topicLower = topics.join(' ').toLowerCase();
  return topicLower.includes('minecraft') || topicLower.includes('gaming');
};

// Calculate attainability score
const calculateAttainabilityScore = (
  sizeTier: string,
  dealType: string,
  isNanoFriendly: boolean
): number => {
  let score = 0;
  
  if (sizeTier === 'nano') {
    score = 70; // Base for nano
    if (dealType === 'affiliate' || dealType === 'gifted') {
      score += 10;
    }
    if (isNanoFriendly && dealType !== 'paid') {
      score += 5;
    }
  } else if (sizeTier === 'micro') {
    score = 60;
    if (dealType === 'affiliate' || dealType === 'gifted') {
      score += 10;
    }
  } else {
    score = 50;
  }
  
  return Math.min(85, score);
};

// Generate deterministic search queries from profile (skip OpenAI for speed)
const generateQueriesDeterministic = (
  sizeTier: string,
  primaryTopics: string[],
  keywords: string[]
): string[] => {
  const queries: string[] = [];
  const topicsLower = primaryTopics.map(t => t.toLowerCase());
  const keywordsLower = keywords.map(k => k.toLowerCase());
  
  const isNano = sizeTier === 'nano';
  const isMicro = sizeTier === 'micro';
  const maxQueries = isNano ? 4 : isMicro ? 6 : 8;
  
  // Topic-specific query templates
  if (topicsLower.some(t => t.includes('minecraft'))) {
    queries.push(`${topicsLower.includes('server hosting') ? '' : 'minecraft '}server hosting affiliate program`);
    queries.push('minecraft mod marketplace partner program');
    queries.push('minecraft plugin hosting sponsor small creator');
    queries.push('minecraft texture pack store affiliate');
  }
  
  if (topicsLower.some(t => t.includes('gaming'))) {
    queries.push('small gaming brands micro influencer program');
    queries.push('indie gaming accessory affiliate');
    queries.push('gaming chair brand affiliate program');
  }
  
  if (topicsLower.some(t => t.includes('pc') || t.includes('building'))) {
    queries.push('PC parts affiliate program small creator');
    queries.push('gaming peripheral affiliate program');
  }
  
  if (topicsLower.some(t => t.includes('streaming') || t.includes('content'))) {
    queries.push('creator tools affiliate program');
    queries.push('streaming overlay affiliate');
  }
  
  // Generic queries for any creator
  if (queries.length < maxQueries) {
    queries.push(`${isNano || isMicro ? 'small ' : ''}brand affiliate program ${topicsLower[0] || 'creator'}`);
    queries.push(`${isNano || isMicro ? 'indie ' : ''}${topicsLower[0] || 'creator'} brand partnership program`);
  }
  
  // Add keyword-based queries if we have space
  if (queries.length < maxQueries && keywordsLower.length > 0) {
    const topKeywords = keywordsLower.slice(0, 2);
    topKeywords.forEach(keyword => {
      if (queries.length < maxQueries) {
        queries.push(`${keyword} brand affiliate program`);
      }
    });
  }
  
  return queries.slice(0, maxQueries);
};

// Helper to compute topics hash for caching
const computeTopicsHash = (
  primaryTopics: string[],
  sizeTier: string,
  keywords: string[]
): string => {
  const hashInput = JSON.stringify({
    topics: primaryTopics.sort(),
    tier: sizeTier,
    keywords: keywords.slice(0, 10).sort(),
  });
  return crypto.createHash('sha256').update(hashInput).digest('hex');
};

// Parallel SerpAPI calls with concurrency limit
const searchQueriesParallel = async (
  queries: string[],
  apiKey: string,
  concurrency: number = 3
): Promise<Array<{ query: string; results: any[]; error?: string }>> => {
  const results: Array<{ query: string; results: any[]; error?: string }> = [];
  
  // Process queries in batches
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchPromises = batch.map(async (query) => {
      try {
        const searchResults = await searchGoogle(query, apiKey);
        return { query, results: searchResults, error: undefined };
      } catch (err: any) {
        console.error(`SerpAPI error for query "${query}":`, err);
        return { query, results: [], error: err.message };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limits (only if not last batch)
    if (i + concurrency < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
};

// Helper to update job progress and add log messages
const updateJobProgress = async (
  jobId: string,
  progress: number,
  step: string,
  status: 'running' | 'complete' | 'failed' = 'running',
  error?: string,
  logMessage?: string
) => {
  if (!supabaseAdmin || !jobId) {
    console.warn('[updateJobProgress] Missing supabaseAdmin or jobId:', { supabaseAdmin: !!supabaseAdmin, jobId });
    return;
  }
  
  try {
    const updateData: any = {
      step,
      status,
      updated_at: new Date().toISOString(),
    };
    
    // Only update progress if it's >= 0 (negative means keep current)
    if (progress >= 0) {
      updateData.progress = progress;
    }
    
    if (error !== undefined) {
      updateData.error = error || null;
    }
    
    // Append log message if provided
    if (logMessage) {
      // Fetch current log, append new message, update
      const { data: currentJob } = await supabaseAdmin
        .from('brand_generation_jobs')
        .select('detail_log')
        .eq('id', jobId)
        .single();
      
      const currentLog = (currentJob?.detail_log as string[]) || [];
      const newLog = [...currentLog, logMessage];
      updateData.detail_log = newLog;
    }
    
    const { error: updateError } = await supabaseAdmin
      .from('brand_generation_jobs')
      .update(updateData)
      .eq('id', jobId);
    
    if (updateError) {
      console.error('[updateJobProgress] Failed to update:', updateError);
    } else {
      console.log(`[updateJobProgress] Updated job ${jobId}: ${progress}% - ${step}`);
    }
  } catch (err) {
    console.error('[updateJobProgress] Exception:', err);
  }
};

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  let jobId: string | null = null;
  
  try {
    const body = await req.json();
    const { userId, mode = 'replace' } = body; // mode: 'replace' | 'append'

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Create job record immediately with progress=1
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from('brand_generation_jobs')
      .insert({
        user_id: userId,
        status: 'running',
        progress: 1,
        step: 'Starting…',
        detail_log: ['Initializing brand generation…'],
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error('Failed to create job:', jobError);
      // Continue without job tracking if it fails
    } else {
      jobId = jobData.id;
      console.log('[Brand Generation] Created job:', jobId);
    }
    
    const timingStart = (label: string) => {
      timings[label] = Date.now();
    };
    
    const timingEnd = (label: string) => {
      if (timings[label]) {
        timings[label] = Date.now() - timings[label];
      }
    };

    // Fetch creator profile (personalized topics/keywords)
    timingStart('profile_load');
    if (jobId) await updateJobProgress(jobId, 5, 'Reading your creator profile…', 'running', undefined, 'Loading your creator profile…');
    const { data: creatorProfile } = await supabaseAdmin
      .from("creator_profiles")
      .select("size_tier, primary_topics, keywords, summary")
      .eq("user_id", userId)
      .single();
    timingEnd('profile_load');
    
    if (jobId && creatorProfile) {
      const topicCount = creatorProfile.primary_topics?.length || 0;
      const keywordCount = creatorProfile.keywords?.length || 0;
      await updateJobProgress(jobId, 5, 'Reading your creator profile…', 'running', undefined, 
        `Found ${topicCount} topics and ${keywordCount} keywords`);
    }

    // If profile doesn't exist, build it on the fly
    let profileData = creatorProfile;
    if (!profileData) {
      try {
        const { buildCreatorProfile } = await import("@/lib/profileBuilder");
        const built = await buildCreatorProfile(userId);
        profileData = {
          size_tier: built.size_tier,
          primary_topics: built.primary_topics,
          keywords: built.keywords,
          summary: built.summary,
        };
      } catch (err) {
        console.warn("Failed to build creator profile on the fly:", err);
        // Fallback to old method
        const { data: metrics } = await supabaseAdmin
          .from("creator_metrics")
          .select("platform, followers, avg_views_10, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        
        if (!metrics || metrics.length === 0) {
          return NextResponse.json(
            { error: "No creator metrics found. Please connect and scan a social account first." },
            { status: 400 }
          );
        }

        // Select primary platform: TikTok > YouTube > most recent
        const tiktokMetrics = metrics.find((m) => m.platform === "tiktok");
        const youtubeMetrics = metrics.find((m) => m.platform === "youtube");
        const primaryMetrics = tiktokMetrics || youtubeMetrics || metrics[0];
        
        const followers = primaryMetrics?.followers || 0;
        const sizeMetric = followers > 0 ? followers : Math.floor((primaryMetrics?.avg_views_10 || 0) / 10);
        
        console.log(`[Brands Generate] userId=${userId}, selected platform=${primaryMetrics?.platform}, available platforms=${metrics.map((m: any) => m.platform).join(",")}`);
        
        let sizeTier: 'nano' | 'micro' | 'mid' | 'large' = 'nano';
        if (sizeMetric >= 100000) sizeTier = 'large';
        else if (sizeMetric >= 10000) sizeTier = 'mid';
        else if (sizeMetric >= 1000) sizeTier = 'micro';

        profileData = {
          size_tier: sizeTier,
          primary_topics: [],
          keywords: [],
          summary: "Content creator",
        };
      }
    }

    // Fetch additional data for prompt (prioritize TikTok > YouTube > most recent)
    const { data: metrics } = await supabaseAdmin
      .from("creator_metrics")
      .select("platform, followers, avg_views_10, engagement_rate_10, top_videos, updated_at, user_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    
    // Leak detection guard
    if (metrics) {
      const wrongUser = metrics.find((m: any) => m.user_id && m.user_id !== userId);
      if (wrongUser) {
        console.error(`[Brands Generate] CRITICAL: Data leak detected! userId=${userId}, found metric.user_id=${wrongUser.user_id}`);
        throw new Error("Data security error: returned metrics do not match requested user");
      }
    }

    // Select primary platform: TikTok > YouTube > most recent
    const tiktokMetrics = metrics?.find((m) => m.platform === "tiktok");
    const youtubeMetrics = metrics?.find((m) => m.platform === "youtube");
    const primaryMetrics = tiktokMetrics || youtubeMetrics || (metrics && metrics[0]);
    
    const followers = primaryMetrics?.followers || 0;
    console.log(`[Brands Generate] userId=${userId}, using metrics from platform=${primaryMetrics?.platform || "none"}, available platforms=${metrics?.map((m: any) => m.platform).join(",") || "none"}`);
    const avgViews = youtubeMetrics?.avg_views_10 || 0;
    const engagement = youtubeMetrics?.engagement_rate_10 || 0;
    const topVideos = youtubeMetrics?.top_videos || [];

    const sizeTier = profileData.size_tier as 'nano' | 'micro' | 'mid' | 'large';
    const primaryTopics = profileData.primary_topics || [];
    const keywords = profileData.keywords || [];
    const summary = profileData.summary || "Content creator";
    
    // Compute topics hash for caching
    const topicsHash = computeTopicsHash(primaryTopics, sizeTier, keywords);
    
    // Check cache for candidates (24 hour TTL) - scoped by user_id + topics_hash
    timingStart('cache_check');
    const cacheCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedData } = await supabaseAdmin
      .from("cache_brand_candidates")
      .select("candidates, created_at, user_id")
      .eq("user_id", userId) // Critical: must filter by user_id to prevent cross-user leakage
      .eq("topics_hash", topicsHash)
      .gte("created_at", cacheCutoff)
      .single();
    
    // Leak detection guard for cache
    if (cachedData && cachedData.user_id && cachedData.user_id !== userId) {
      console.error(`[Brands Generate] CRITICAL: Cache leak detected! userId=${userId}, cachedData.user_id=${cachedData.user_id}`);
      // Don't use the cached data if it's for a different user - continue without cache
    }
    timingEnd('cache_check');

    const topVideoTitles = topVideos
      .slice(0, 5)
      .map((v: any) => v.title)
      .join("\n  - ");

    // Build personalized creator summary with topics
    const creatorSummary = `Creator Profile:
- Summary: ${summary}
- Primary Topics: ${primaryTopics.length > 0 ? primaryTopics.join(', ') : 'General content'}
- Key Keywords: ${keywords.slice(0, 10).join(', ')}
- YouTube Subscribers: ${followers.toLocaleString()}
- Average Views (last 10 videos): ${avgViews.toLocaleString()}
- Engagement Rate: ${engagement.toFixed(2)}%
- Top Performing Videos:
  - ${topVideoTitles || "None"}
- Creator Size Tier: ${sizeTier.toUpperCase()} (${(followers > 0 ? followers : Math.floor(avgViews / 10)).toLocaleString()} ${followers > 0 ? 'subscribers' : 'estimated from views'})`;

    // Build size-appropriate and topic-specific system prompt (needed for both cached and non-cached paths)
    const isNanoOrMicro = sizeTier === 'nano' || sizeTier === 'micro';
    const hasTopics = primaryTopics.length > 0;

    // Map primary topics to allowed categories (including health/fitness for TikTok)
    const topicCategoryMap: Record<string, string[]> = {
      // Gaming topics
      'minecraft': ['Gaming', 'Minecraft', 'PC Gear', 'Server Hosting', 'Modding Tools', 'Creator Tools', 'Gaming Peripherals', 'Gaming Chairs', 'Headsets', 'Gaming Accessories'],
      'gaming': ['Gaming', 'PC Gear', 'Gaming Peripherals', 'Gaming Chairs', 'Headsets', 'Gaming Accessories', 'Streaming Equipment'],
      'pc building': ['PC Gear', 'Tech', 'Hardware', 'Components', 'PC Accessories'],
      'server hosting': ['Server Hosting', 'Tech', 'Web Services', 'Infrastructure'],
      'modding': ['Modding Tools', 'Gaming', 'Creator Tools', 'Software'],
      'streaming': ['Creator Tools', 'Streaming Equipment', 'Gaming', 'Tech'],
      // Health & Fitness topics
      'health': ['Health & Fitness', 'Wellness', 'Nutrition', 'Supplements', 'Workout', 'Fitness', 'Gym', 'Activewear'],
      'fitness': ['Health & Fitness', 'Wellness', 'Nutrition', 'Supplements', 'Workout', 'Fitness', 'Gym', 'Activewear'],
      'nutrition': ['Health & Fitness', 'Nutrition', 'Supplements', 'Wellness', 'Food & Beverage'],
      'workout': ['Health & Fitness', 'Workout', 'Fitness', 'Gym', 'Activewear', 'Equipment'],
      'yoga': ['Health & Fitness', 'Yoga', 'Wellness', 'Activewear', 'Mindfulness'],
      'running': ['Health & Fitness', 'Running', 'Athletic', 'Activewear', 'Footwear'],
      'weight loss': ['Health & Fitness', 'Weight Loss', 'Nutrition', 'Supplements', 'Wellness'],
      'wellness': ['Health & Fitness', 'Wellness', 'Nutrition', 'Supplements', 'Self-Care'],
    };

    // Determine allowed categories based on primary topics
    let allowedCategories: string[] = [];
    for (const topic of primaryTopics) {
      const topicLower = topic.toLowerCase();
      for (const [key, cats] of Object.entries(topicCategoryMap)) {
        if (topicLower.includes(key) || key.includes(topicLower)) {
          allowedCategories.push(...cats);
        }
      }
    }
    
    // If no specific mapping, infer from topic keywords
    if (allowedCategories.length === 0 && hasTopics) {
      // Check for health/fitness keywords
      const topicsLower = primaryTopics.join(' ').toLowerCase();
      if (topicsLower.includes('health') || topicsLower.includes('fitness') || topicsLower.includes('workout') || 
          topicsLower.includes('nutrition') || topicsLower.includes('wellness') || topicsLower.includes('yoga') ||
          topicsLower.includes('running') || topicsLower.includes('gym') || topicsLower.includes('weight')) {
        allowedCategories = ['Health & Fitness', 'Nutrition', 'Supplements', 'Wellness', 'Activewear'];
      } else {
        // Default to gaming/tech if not health/fitness
        allowedCategories = ['Gaming', 'Tech', 'Creator Tools', 'Gaming Peripherals'];
      }
    }
    
    // Remove duplicates
    allowedCategories = Array.from(new Set(allowedCategories));
    
    const categoryConstraint = allowedCategories.length > 0 
      ? `\nCRITICAL TOPIC CONSTRAINT: This creator focuses on: ${primaryTopics.join(', ')}. 
- ALL brands MUST relate to these topics. Categories must be one of: ${allowedCategories.join(', ')}
- For Minecraft channels, suggest: server hosting, gaming peripherals, Minecraft marketplaces, modding tools, creator tools, indie gaming merch, gaming energy drinks, PC parts/accessories, Discord tools, gaming chairs, headsets/mics
- DISALLOW off-topic categories like Beauty, Fashion, Wellness, Subscription Boxes UNLESS the topics explicitly indicate them
- If a brand category doesn't match the creator's topics, discard it`
      : '';

    const sizeInstructions = sizeTier === 'nano'
      ? `CRITICAL: This creator is NANO tier (${followers.toLocaleString()} subscribers, avg views: ${avgViews}).

STRICT REQUIREMENTS FOR NANO CREATORS (subs < 1,000):
- Generate at least 12 brands, ALL must be small/medium/indie brands
- Deal types: ONLY "affiliate" or "gifted" (NO "paid" unless avg_views >= 1000)
- Confidence cap: 80 maximum
- DO NOT suggest: Twitch, Discord, YouTube, Blue, Logitech, Razer, HyperX, SteelSeries, Corsair, Elgato, Shure, Rode, or any platforms/global hardware brands
- DO NOT suggest: Epic Games, Riot, Valve, Activision, EA, Ubisoft, or any major game studios
- DO NOT suggest: Monster Energy, Red Bull, G Fuel, or major energy drink brands
- DO NOT suggest: NordVPN, ExpressVPN, Surfshark, or major VPN services
- Prefer: Small Minecraft server hosts, indie mod marketplaces, niche gaming accessories, small creator tools (NOT platforms)
- ${hasMinecraftOrGaming(primaryTopics) ? 'At least 70% must be Minecraft ecosystem specific (server hosting, mods, textures, indie gaming merch)' : ''}
- Each recommendation MUST include an "attainability_reason" explaining why this brand would realistically work with a creator at this size`

      : isNanoOrMicro
      ? `CRITICAL: This creator is ${sizeTier.toUpperCase()} tier (${followers.toLocaleString()} subscribers).

STRICT REQUIREMENTS FOR ${sizeTier.toUpperCase()} CREATORS:
- Generate at least 12 brands, with at least 8 being small/medium/indie brands
- At least 4 brands should be affiliate program friendly
- DO NOT suggest any large household name brands or platforms
- Prefer: Shopify/DTC brands, indie ecommerce, Amazon FBA brands, creator-first platforms, affiliate programs
- Focus on brands that work with micro-influencers (under 10K followers)
- Deal types should be primarily "gifted" or "affiliate" (minimal "paid")
- Each recommendation MUST include an "attainability_reason" explaining why this brand would realistically work with a creator at this size`

      : `This creator is ${sizeTier.toUpperCase()} tier. You can suggest brands of appropriate scale, including larger brands that work with ${sizeTier === 'mid' ? 'mid-tier' : 'large'} creators.`;

    // Check API keys
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const serpApiKey = process.env.SERPAPI_KEY;
    const client = new OpenAI({ apiKey: openaiApiKey });

    interface Candidate {
      name_guess: string;
      title: string;
      link: string;
      snippet: string;
      domain: string;
    }

    let allCandidates: Candidate[] = [];
    
    // Use cached candidates if available, otherwise fetch from SerpAPI
    // Only use cache if user_id matches (leak detection guard)
    if (cachedData && cachedData.candidates && cachedData.user_id === userId) {
      timingStart('cache_load');
      if (jobId) await updateJobProgress(jobId, 60, 'Using cached brand data…');
      allCandidates = cachedData.candidates as Candidate[];
      timingEnd('cache_load');
      console.log(`[Brand Generation] Using cached candidates (${allCandidates.length} brands) for userId=${userId}`);
    } else {
      // Generate search queries (deterministic if profile exists, otherwise use OpenAI)
      timingStart('query_build');
      if (jobId) await updateJobProgress(jobId, 15, 'Generating search queries…');
      let searchQueries: string[] = [];
      
      // Use deterministic generation if we have a good profile
      if (primaryTopics.length > 0 && creatorProfile) {
        searchQueries = generateQueriesDeterministic(sizeTier, primaryTopics, keywords);
        console.log(`[Brand Generation] Generated ${searchQueries.length} queries deterministically`);
      } else {
        // Fallback to OpenAI for query generation (only if profile is missing)
        const searchQueriesPrompt = `Based on this creator profile, generate ${sizeTier === 'nano' ? '4-6' : sizeTier === 'micro' ? '6-8' : '8-10'} targeted Google search queries to find real brands that would collaborate with this creator.

${creatorSummary}

${sizeInstructions}${categoryConstraint}

Return JSON: { queries: ["query1", "query2", ...] }`;

        try {
          const queriesResponse = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a search query generator for finding brand collaboration opportunities." },
              { role: "user", content: searchQueriesPrompt },
            ],
            temperature: 0.7,
            response_format: { type: "json_object" },
            max_tokens: 300, // Reduce tokens for faster response
          });

          const queriesContent = queriesResponse.choices[0]?.message?.content;
          if (queriesContent) {
            const queriesParsed = JSON.parse(queriesContent);
            searchQueries = Array.isArray(queriesParsed.queries) ? queriesParsed.queries : [];
          }
        } catch (err) {
          console.error("Failed to generate search queries with OpenAI, falling back to deterministic:", err);
          // Fallback to deterministic even if OpenAI fails
          searchQueries = generateQueriesDeterministic(sizeTier, primaryTopics, keywords);
        }
      }
      
      if (searchQueries.length === 0) {
        return NextResponse.json(
          { error: "No search queries generated" },
          { status: 500 }
        );
      }
      timingEnd('query_build');

      if (!serpApiKey) {
        return NextResponse.json(
          { error: "SerpAPI key not configured. Please add SERPAPI_KEY to your environment variables." },
          { status: 400 }
        );
      }

      // STEP 2: Search queries in parallel with SerpAPI
      timingStart('serpapi_total');
      if (jobId) await updateJobProgress(jobId, 30, 'Searching Google results (0/' + searchQueries.length + ')…', 'running', undefined,
        `Running ${searchQueries.length} Google searches…`);
      
      // Track progress for parallel SerpAPI calls
      let completedQueries = 0;
      const totalQueries = searchQueries.length;
      const progressStart = 25;
      const progressEnd = 60;
      const progressRange = progressEnd - progressStart;
      
      // Modified parallel search with progress tracking
      const searchQueriesParallelWithProgress = async (
        queries: string[],
        apiKey: string,
        concurrency: number = 3
      ): Promise<Array<{ query: string; results: any[]; error?: string }>> => {
        const results: Array<{ query: string; results: any[]; error?: string }> = [];
        
        for (let i = 0; i < queries.length; i += concurrency) {
          const batch = queries.slice(i, i + concurrency);
          const batchPromises = batch.map(async (query) => {
            try {
              const searchResults = await searchGoogle(query, apiKey);
              completedQueries++;
              // Update progress proportionally
              if (jobId) {
                const progress = Math.floor(progressStart + (completedQueries / totalQueries) * progressRange);
                const resultCount = searchResults.length;
                await updateJobProgress(
                  jobId, 
                  progress, 
                  `Searching Google results (${completedQueries}/${totalQueries})…`,
                  'running',
                  undefined,
                  `Found ${resultCount} results for "${query.substring(0, 40)}${query.length > 40 ? '...' : ''}"`
                );
              }
              return { query, results: searchResults, error: undefined };
            } catch (err: any) {
              completedQueries++;
              console.error(`SerpAPI error for query "${query}":`, err);
              if (jobId) {
                const progress = Math.floor(progressStart + (completedQueries / totalQueries) * progressRange);
                await updateJobProgress(jobId, progress, `Searching Google results (${completedQueries}/${totalQueries})…`);
              }
              return { query, results: [], error: err.message };
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          results.push(...batchResults);
          
          if (i + concurrency < queries.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        return results;
      };
      
      const serpResults = await searchQueriesParallelWithProgress(searchQueries, serpApiKey, 3);
      timingEnd('serpapi_total');
      
      // Collect and deduplicate candidates
      const beforeDedupCount = allCandidates.length;
      if (jobId) await updateJobProgress(jobId, 55, 'Deduplicating and cleaning candidates…', 'running', undefined,
        `Found ${beforeDedupCount} brand candidates from search results`);
      
      const seenDomains = new Set<string>();
      const disallowedDomains = [
        'google.com', 'youtube.com', 'twitch.tv', 'amazon.com', 'facebook.com', 'instagram.com',
        'twitter.com', 'tiktok.com', 'discord.com', 'reddit.com', 'wikipedia.org',
        'microsoft.com', 'apple.com', 'nvidia.com', 'intel.com', 'amd.com',
      ];
      
      let duplicateCount = 0;
      let disallowedCount = 0;
      let platformCount = 0;
      allCandidates = []; // Reset to collect fresh

      for (const { results } of serpResults) {
        for (const result of results) {
          if (!result.link || !result.domain) continue;
          
          const domainLower = result.domain.toLowerCase().replace('www.', '');
          
          // Skip disallowed domains
          if (disallowedDomains.some(d => domainLower.includes(d))) {
            disallowedCount++;
            continue;
          }
          
          // Skip if already seen (deduplicate by domain)
          if (seenDomains.has(domainLower)) {
            duplicateCount++;
            continue;
          }
          
          // Skip if domain looks like a platform
          if (looksLikePlatform(result.domain) || isDisallowedBrand(result.domain)) {
            platformCount++;
            continue;
          }
          
          seenDomains.add(domainLower);
          
          const nameGuess = extractBrandName(result.title, result.domain);
          
          // Additional filtering for nano/micro creators
          if (isNanoOrMicro) {
            if (isDisallowedBrand(nameGuess) || looksLikePlatform(nameGuess)) {
              platformCount++;
              continue;
            }
          }
          
          allCandidates.push({
            name_guess: nameGuess,
            title: result.title,
            link: result.link,
            snippet: result.snippet || '',
            domain: domainLower,
          });
        }
      }
      
      // Log deduplication results
      if (jobId) {
        await updateJobProgress(jobId, 55, 'Deduplicating and cleaning candidates…', 'running', undefined,
          `Removed ${duplicateCount} duplicates, ${disallowedCount + platformCount} disallowed brands`);
        await updateJobProgress(jobId, 55, 'Deduplicating and cleaning candidates…', 'running', undefined,
          `Kept ${allCandidates.length} clean candidates`);
      }
      
      // Store candidates in cache for future use (scoped by user_id + topics_hash)
      if (allCandidates.length > 0) {
        try {
          // Leak detection guard before caching
          const cacheData = {
            user_id: userId, // Critical: must be scoped to this user
            topics_hash: topicsHash,
            candidates: allCandidates,
            created_at: new Date().toISOString(),
          };
          
          // Verify user_id matches
          if (cacheData.user_id !== userId) {
            console.error(`[Brands Generate] CRITICAL: Cannot cache for different user! userId=${userId}, cacheData.user_id=${cacheData.user_id}`);
            throw new Error("Data security error: cannot cache candidates for different user");
          }
          
          await supabaseAdmin
            .from("cache_brand_candidates")
            .upsert(cacheData, {
              onConflict: 'user_id,topics_hash'
            });
          
          console.log(`[Brands Generate] Cached ${allCandidates.length} candidates for userId=${userId}, topics_hash=${topicsHash.substring(0, 8)}...`);
        } catch (cacheError) {
          console.warn("Failed to cache candidates (non-fatal):", cacheError);
        }
      }
    }

    if (allCandidates.length === 0) {
      return NextResponse.json(
        { error: "No brand candidates found. Try connecting more platforms or adjusting your niche." },
        { status: 400 }
      );
    }

    // STEP 3: Use OpenAI to score and select final matches from real candidates
    timingStart('openai_scoring');
    if (jobId) await updateJobProgress(jobId, 85, 'Scoring and filtering…');
    const candidatesList = allCandidates.slice(0, 50).map((c, idx) => 
      `${idx + 1}. Name: ${c.name_guess}\n   Domain: ${c.domain}\n   Title: ${c.title}\n   Snippet: ${c.snippet}\n   Link: ${c.link}`
    ).join('\n\n');

    const scoringPrompt = `From these REAL brand candidates found via web search, select the best ${isNanoOrMicro ? '12-15' : '10-15'} matches for this creator:

${creatorSummary}

${sizeInstructions}${categoryConstraint}

CANDIDATES (you MUST only select from this list):
${candidatesList}

Return JSON with "recommendations" array. Each recommendation must reference EXACTLY one candidate from the list above by number, and include:
- brand_name: string (use the name_guess or improve it based on title/domain)
- website: string (use the EXACT link from the candidate)
- category: string (one of: ${allowedCategories.length > 0 ? allowedCategories.join(', ') : 'Gaming, Tech, Creator Tools'})
- why_match: string (1-2 sentences explaining why this brand fits)
- suggested_pitch_angle: string (1-2 sentences on how to pitch)
- attainability_reason: string (why this brand would work with a ${sizeTier} creator - REQUIRED)
- deal_type: string (one of: "gifted", "affiliate", "paid" - prefer gifted/affiliate for nano/micro)
- confidence: number (0-100)

CRITICAL:
- You MUST only select from the candidates list above
- Use the EXACT link as the website
- ${isNanoOrMicro ? 'Prefer small/medium brands. Filter out any that seem like mega-brands or platforms.\n' : ''}- All brands must relate to: ${primaryTopics.join(', ')}

Example:
{
  "recommendations": [
    {
      "brand_name": "Apex Hosting",
      "website": "https://apexminecrafthosting.com",
      "category": "Server Hosting",
      "why_match": "...",
      "suggested_pitch_angle": "...",
      "attainability_reason": "This small hosting provider actively works with nano creators and offers affiliate programs.",
      "deal_type": "affiliate",
      "confidence": 75
    }
  ]
}`;

    let recommendations: BrandRecommendation[] = [];
    let retries = 0;
    const maxRetries = 2;

    while (retries <= maxRetries && recommendations.length === 0) {
      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a brand matchmaking assistant. You must only select from the provided candidate list. Use real websites and links." },
            { role: "user", content: scoringPrompt },
          ],
          temperature: 0.5,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No content in OpenAI response");
        }

        const parsed = JSON.parse(content);
        
        if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
          recommendations = parsed.recommendations;
        } else if (Array.isArray(parsed)) {
          recommendations = parsed;
        } else {
          const keys = Object.keys(parsed);
          if (keys.length > 0 && Array.isArray(parsed[keys[0]])) {
            recommendations = parsed[keys[0]];
          }
        }

        // Validate recommendations structure and filter disallowed brands
        if (recommendations.length > 0) {
          const originalCount = recommendations.length;
          let validated = recommendations
            .filter((r: any) => r.brand_name && r.why_match && r.website) // Require website now
            .map((r: any) => {
              const brandName = r.brand_name || '';
              const website = r.website || '';
              
              // Extract domain from website
              let domain = '';
              try {
                domain = new URL(website).hostname.replace('www.', '');
              } catch {
                // Invalid URL, skip
              }
              
              // Multiple checks for nano creators
              const isDisallowed = isNanoOrMicro && (isDisallowedBrand(brandName) || isDisallowedBrand(domain));
              const isPlatform = isNanoOrMicro && (looksLikePlatform(brandName) || looksLikePlatform(domain));
              
              // Enforce deal_type constraints for nano
              let dealType = r.deal_type || (isNanoOrMicro ? 'gifted' : 'paid');
              if (sizeTier === 'nano') {
                // Only allow paid if avgViews >= 1000
                if (dealType === 'paid' && avgViews < 1000) {
                  dealType = 'affiliate'; // Force to affiliate instead
                }
                // Enforce only affiliate/gifted for nano
                if (dealType !== 'affiliate' && dealType !== 'gifted') {
                  dealType = 'gifted';
                }
              }

              // Cap confidence for nano
              let confidence = Math.max(0, Math.min(100, r.confidence || 50));
              if (sizeTier === 'nano') {
                confidence = Math.min(80, confidence); // Cap at 80 for nano
              }
              if (isNanoOrMicro && !r.attainability_reason) {
                confidence = Math.min(confidence, 50);
              }

              // Check if category matches allowed categories (case-insensitive)
              const brandCategory = (r.category || "General").toLowerCase();
              const categoryAllowed = allowedCategories.length === 0 || 
                allowedCategories.some(cat => cat.toLowerCase() === brandCategory);

              // Check if brand is Minecraft ecosystem aligned (for niche alignment check)
              const isMinecraftEcosystem = hasMinecraftOrGaming(primaryTopics) && (
                brandCategory.includes('minecraft') ||
                brandCategory.includes('server') ||
                brandCategory.includes('mod') ||
                brandCategory.includes('plugin') ||
                brandName.toLowerCase().includes('minecraft') ||
                brandName.toLowerCase().includes('server') ||
                brandName.toLowerCase().includes('mod')
              );

              // Calculate attainability score
              const attainabilityScore = calculateAttainabilityScore(
                sizeTier,
                dealType,
                !isDisallowed && !isPlatform && dealType !== 'paid'
              );

              // Validate website URL format
              let validatedWebsite = website;
              if (validatedWebsite && typeof validatedWebsite === 'string') {
                const trimmed = validatedWebsite.trim();
                if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
                  validatedWebsite = null; // Invalid format, set to null
                } else {
                  validatedWebsite = trimmed;
                }
              } else {
                validatedWebsite = null;
              }

              return {
                brand_name: brandName,
                category: r.category || "General",
                why_match: r.why_match || "",
                suggested_pitch_angle: r.suggested_pitch_angle || "",
                attainability_reason: r.attainability_reason || (isNanoOrMicro ? "Brand works with micro-influencers" : ""),
                deal_type: dealType,
                confidence: confidence,
                attainability_score: attainabilityScore,
                website: validatedWebsite,
                domain: domain,
                source_url: validatedWebsite, // Use website as source URL
                _isDisallowed: isDisallowed,
                _isPlatform: isPlatform,
                _categoryMismatch: allowedCategories.length > 0 && !categoryAllowed,
                _isMinecraftEcosystem: isMinecraftEcosystem,
              };
            });

          // Filter out disallowed brands, platforms, and category mismatches
          if (isNanoOrMicro || allowedCategories.length > 0) {
            const beforeFilterCount = validated.length;
            validated = validated.filter(r => 
              !r._isDisallowed && 
              !r._isPlatform && 
              !r._categoryMismatch
            );
            const removedCount = beforeFilterCount - validated.length;
            const removalPercentage = beforeFilterCount > 0 ? (removedCount / beforeFilterCount) * 100 : 0;
            
            // Check niche alignment for Minecraft/gaming creators
            if (sizeTier === 'nano' && hasMinecraftOrGaming(primaryTopics) && validated.length > 0) {
              const minecraftEcosystemCount = validated.filter(r => r._isMinecraftEcosystem).length;
              const minecraftPercentage = (minecraftEcosystemCount / validated.length) * 100;
              
              // If less than 70% are Minecraft ecosystem, regenerate
              if (minecraftPercentage < 70 && retries < maxRetries) {
                retries++;
                recommendations = [];
                continue;
              }
            }
            
            // If more than 30% were removed, auto-retry
            if (removalPercentage > 30 && retries < maxRetries) {
              retries++;
              recommendations = [];
              continue;
            }
            
            // Ensure we have enough small/medium brands
            const smallBrandCount = validated.filter(r => 
              r.deal_type === 'gifted' || r.deal_type === 'affiliate'
            ).length;
            
            // For nano, ensure we have at least 8 results with mostly affiliate/gifted
            if (validated.length < 8 || (sizeTier === 'nano' && smallBrandCount < 6)) {
              if (retries < maxRetries) {
                retries++;
                recommendations = [];
                continue;
              }
            }
          }

          // Remove internal flags and limit results
          recommendations = validated
            .map(({ _isDisallowed, _isPlatform, _categoryMismatch, _isMinecraftEcosystem, ...r }) => r)
            .slice(0, isNanoOrMicro ? 15 : 12);
        }
      } catch (parseError: any) {
        console.error("JSON parse error:", parseError);
        if (retries < maxRetries) {
          retries++;
          // Try again with stricter prompt
          continue;
        } else {
          throw new Error(`Failed to parse AI response: ${parseError.message}`);
        }
      }

      // Final check: if we still have disallowed brands or platforms, retry
      if (recommendations.length > 0 && sizeTier === 'nano') {
        const hasDisallowed = recommendations.some((r: any) => 
          isDisallowedBrand(r.brand_name || '') || looksLikePlatform(r.brand_name || '')
        );

        const hasInvalidDealType = recommendations.some((r: any) => 
          r.deal_type === 'paid' && avgViews < 1000
        );

        if ((hasDisallowed || hasInvalidDealType) && retries < maxRetries) {
          retries++;
          recommendations = []; // Clear and retry
          continue;
        }
      }
    }
    
    timingEnd('openai_scoring');

    if (recommendations.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate valid brand recommendations" },
        { status: 500 }
      );
    }

    // Delete old recommendations based on mode
    timingStart('db_write');
    if (jobId) await updateJobProgress(jobId, 92, 'Saving your new matches…', 'running', undefined,
      `Saving ${recommendations.length} brand recommendations…`);
    if (mode === 'replace') {
      // Delete all 'new' status recommendations (keep 'saved' and 'ignored')
      const { error: deleteError } = await supabaseAdmin
        .from("brand_recommendations")
        .delete()
        .eq("user_id", userId)
        .eq("status", "new");
    }
    // If mode is 'append', don't delete anything

    // Encode attainability_reason and deal_type in suggested_pitch_angle for storage
    // Format: "[DEAL_TYPE:gifted|affiliate|paid] [ATTAINABILITY:...] Original pitch angle"
    if (!recommendations || recommendations.length === 0) {
      return NextResponse.json(
        { error: "No recommendations to insert" },
        { status: 500 }
      );
    }
    
    const insertDataWithMetadata = recommendations.map((r: any) => {
      const metadataPrefix = `[DEAL:${r.deal_type || 'gifted'}] ${r.attainability_reason ? `[REASON:${r.attainability_reason}] ` : ''}`;
      const baseData: any = {
        user_id: userId,
        brand_name: r.brand_name,
        category: r.category,
        why_match: r.why_match,
        suggested_pitch_angle: metadataPrefix + (r.suggested_pitch_angle || ''),
        confidence: r.confidence,
        website: r.website || null,
        status: "new",
      };
      
      // Only include optional columns if they exist in the schema
      // These columns may not exist if migrations haven't been run yet
      if (r.attainability_score !== undefined) {
        baseData.attainability_score = r.attainability_score;
      }
      if (r.source_url !== undefined || r.website) {
        baseData.source_url = r.source_url || r.website || null;
      }
      if (r.domain !== undefined) {
        baseData.domain = r.domain || null;
      }
      
      // Contact fields (will be null initially, can be populated later)
      if (r.contact_email !== undefined) {
        baseData.contact_email = r.contact_email || null;
      }
      if (r.contact_website !== undefined) {
        baseData.contact_website = r.contact_website || null;
      }
      if (r.contact_instagram !== undefined) {
        baseData.contact_instagram = r.contact_instagram || null;
      }
      if (r.contact_tiktok !== undefined) {
        baseData.contact_tiktok = r.contact_tiktok || null;
      }
      if (r.contact_linkedin !== undefined) {
        baseData.contact_linkedin = r.contact_linkedin || null;
      }
      if (r.contact_form_url !== undefined) {
        baseData.contact_form_url = r.contact_form_url || null;
      }
      if (r.preferred_contact !== undefined) {
        baseData.preferred_contact = r.preferred_contact || null;
      }
      
      return baseData;
    });

    // Leak detection guard before insert
    insertDataWithMetadata.forEach((rec: any) => {
      if (rec.user_id !== userId) {
        console.error(`[Brands Generate] CRITICAL: Data leak detected! userId=${userId}, insertData.user_id=${rec.user_id}`);
        throw new Error("Data security error: cannot insert recommendations for different user");
      }
    });

    const { error: insertError, data: insertResult } = await supabaseAdmin
      .from("brand_recommendations")
      .insert(insertDataWithMetadata);

    if (insertError) {
      console.error("Error inserting recommendations:", insertError);
      
      // Check if table doesn't exist
      if (insertError.code === 'PGRST205' || insertError.message?.includes('Could not find the table')) {
        return NextResponse.json(
          { error: "Database table not found. Please run the migration: supabase/migrations/0004_brand_recommendations.sql in your Supabase SQL editor." },
          { status: 500 }
        );
      }
      
      // Check if column doesn't exist (PGRST204) - retry without optional columns
      if (insertError.code === 'PGRST204' || insertError.message?.includes("Could not find the '")) {
        // Retry with only base table columns (from migration 0004)
        // These columns exist in the base table: user_id, brand_name, category, why_match, suggested_pitch_angle, confidence, status
        // DO NOT include: website, attainability_score, source_url, domain (added in later migrations)
        const insertDataMinimal = recommendations.map((r: any) => {
          const metadataPrefix = `[DEAL:${r.deal_type || 'gifted'}] ${r.attainability_reason ? `[REASON:${r.attainability_reason}] ` : ''}`;
          return {
            user_id: userId,
            brand_name: r.brand_name,
            category: r.category,
            why_match: r.why_match,
            suggested_pitch_angle: metadataPrefix + (r.suggested_pitch_angle || ''),
            confidence: r.confidence,
            status: "new",
          };
        });
        
        const { error: retryError, data: retryResult } = await supabaseAdmin
          .from("brand_recommendations")
          .insert(insertDataMinimal);
        
        if (retryError) {
          return NextResponse.json(
            { error: `Failed to save recommendations: ${retryError.message || 'Unknown error'}. Please run migrations: supabase/migrations/0004_brand_recommendations.sql, 0007_add_attainability_score.sql, and 0009_add_source_fields_to_brand_recommendations.sql` },
            { status: 500 }
          );
        }
        
        return NextResponse.json({
          success: true,
          count: recommendations.length,
          warning: "Some optional columns are missing. Please run migrations 0007 and 0009 for full functionality.",
        });
      }
      
      return NextResponse.json(
        { error: `Failed to save recommendations: ${insertError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    timingEnd('db_write');

    // Upsert brands and enqueue contact enrichment jobs
    try {
      for (const rec of recommendations) {
        try {
          const brandId = await upsertBrand(rec.brand_name, rec.website || null);
          
          // Check if contact info already exists
          const { data: existingContacts } = await supabaseAdmin
            .from('brand_contacts')
            .select('id, enrichment_status')
            .eq('brand_id', brandId)
            .single();

          // Only enqueue if no contact info exists or it's failed
          if (!existingContacts || existingContacts.enrichment_status === 'failed') {
            // Delay enrichment by 5 seconds to avoid immediate API calls
            await enqueueContactEnrichment(brandId, 5);
          }
        } catch (enrichError) {
          // Log but don't fail the entire request if enrichment enqueue fails
          console.error(`[Brand Generation] Failed to enqueue enrichment for ${rec.brand_name}:`, enrichError);
        }
      }
    } catch (enrichBatchError) {
      // Log but don't fail the request
      console.error('[Brand Generation] Error in batch enrichment enqueue:', enrichBatchError);
    }
    
    // Mark job as complete
    if (jobId) {
      await updateJobProgress(jobId, 100, 'Done. New matches ready.', 'complete', undefined,
        `Successfully saved ${recommendations.length} brand matches`);
    }
    
    const totalTime = Date.now() - startTime;
    
    // Log timing diagnostics
    const timingLog = [
      `profile_load:${timings.profile_load || 0}ms`,
      `cache_check:${timings.cache_check || 0}ms`,
      `cache_load:${timings.cache_load || 0}ms`,
      `query_build:${timings.query_build || 0}ms`,
      `serpapi_total:${timings.serpapi_total || 0}ms`,
      `openai_scoring:${timings.openai_scoring || 0}ms`,
      `db_write:${timings.db_write || 0}ms`,
      `total:${totalTime}ms`
    ].join(' | ');
    
    console.log(`[Brand Generation Performance] ${timingLog}`);

    return NextResponse.json({
      success: true,
      count: recommendations.length,
      jobId: jobId,
      timings: {
        total: totalTime,
        ...timings
      }
    });
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`[Brand Generation Error] total:${totalTime}ms`, error);
    
    // Mark job as failed
    if (jobId) {
      await updateJobProgress(
        jobId,
        -1, // Keep current progress
        'Failed',
        'failed',
        error.message || "Failed to generate brand recommendations"
      );
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to generate brand recommendations", jobId: jobId || null },
      { status: 500 }
    );
  }
}
