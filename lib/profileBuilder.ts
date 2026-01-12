import { supabaseAdmin } from "./supabaseAdmin";
import OpenAI from "openai";

// Stop words to filter out common words when extracting keywords
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'what', 'which', 'who', 'whom', 'where', 'when', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too',
  'very', 'just', 'now', 'then', 'here', 'there', 'up', 'down', 'out', 'off', 'over', 'under',
]);

// Extract keywords from text (simple NLP)
function extractKeywords(text: string, maxKeywords: number = 20): string[] {
  if (!text) return [];
  
  // Normalize and split into words
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

  // Count frequency
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }

  // Sort by frequency and return top keywords
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

// Infer niche from topics and keywords
function inferNicheFromTopics(primaryTopics: string[], keywords: string[], text: string): string {
  // Normalize text for matching
  const normalizedText = text.toLowerCase();
  
  // Map common topic patterns to niches
  const nicheMap: Record<string, string> = {
    'health': 'Health & Fitness',
    'fitness': 'Health & Fitness',
    'gym': 'Health & Fitness',
    'workout': 'Health & Fitness',
    'nutrition': 'Health & Nutrition',
    'wellness': 'Health & Wellness',
    'yoga': 'Health & Wellness',
    'running': 'Fitness',
    'weight loss': 'Health & Fitness',
    'supplements': 'Health & Nutrition',
    'minecraft': 'Gaming - Minecraft',
    'gaming': 'Gaming',
    'pc building': 'Tech - PC Building',
    'tech': 'Technology',
    'coding': 'Technology - Programming',
    'programming': 'Technology - Programming',
    'education': 'Education',
    'tutorial': 'Education',
    'how to': 'Education',
    'travel': 'Travel',
    'food': 'Food & Cooking',
    'cooking': 'Food & Cooking',
    'beauty': 'Beauty',
    'fashion': 'Fashion',
    'lifestyle': 'Lifestyle',
    'comedy': 'Comedy',
    'entertainment': 'Entertainment',
    'music': 'Music',
    'documentary': 'Documentary',
    'storytelling': 'Storytelling',
  };

  // Check primary topics first
  for (const topic of primaryTopics) {
    const topicLower = topic.toLowerCase();
    for (const [key, niche] of Object.entries(nicheMap)) {
      if (topicLower.includes(key) || key.includes(topicLower)) {
        return niche;
      }
    }
  }

  // Check keywords
  for (const keyword of keywords) {
    const keywordLower = keyword.toLowerCase();
    for (const [key, niche] of Object.entries(nicheMap)) {
      if (keywordLower.includes(key) || key.includes(keywordLower)) {
        return niche;
      }
    }
  }

  // Check text content directly
  for (const [key, niche] of Object.entries(nicheMap)) {
    if (normalizedText.includes(key)) {
      return niche;
    }
  }

  // Default: use first primary topic or generic
  if (primaryTopics.length > 0) {
    return primaryTopics[0];
  }

  return 'General Content Creator';
}

// Infer primary topics from video titles and descriptions using OpenAI
async function inferTopics(
  channelTitle: string,
  topVideos: any[],
  niche: string,
  openaiApiKey: string,
  platform: string = "youtube",
  bioDescription: string = ""
): Promise<{ primary_topics: string[]; keywords: string[]; summary: string; niche?: string }> {
  const client = new OpenAI({ apiKey: openaiApiKey });

  // Build video context (include both title and description)
  const videoContext = topVideos
    .slice(0, 10)
    .map((v: any, idx: number) => {
      const descPreview = v.description ? v.description.substring(0, 200) : '';
      const titleText = v.title || "Untitled";
      return `${idx + 1}. "${titleText}"${descPreview ? ` - ${descPreview}` : ''}`;
    })
    .join('\n');

  // Note: bioDescription is now passed as a parameter (from buildCreatorProfile)
  const platformLabel = platform === "tiktok" ? "TikTok" : platform === "youtube" ? "YouTube" : platform;
  const bioContext = bioDescription ? `\nBio: ${bioDescription}` : '';

  const prompt = `Analyze this ${platformLabel} creator's content to extract topics, keywords, niche, and write a summary.

Channel: ${channelTitle}${bioContext}
Platform: ${platformLabel}
Top Videos:
${videoContext || 'No videos available'}

Extract:
1. Primary Topics (4-6 main topics): Array of specific topics. For TikTok/health-fitness creators, extract topics like "Health & Fitness", "Nutrition", "Gym", "Running", "Weight Loss", "Supplements", "Yoga", "Workout", "Wellness", etc. For gaming creators, use topics like "Minecraft", "Gaming", "PC Building", "Server Hosting", "Modding Tools", "Game Development", "Streaming", etc. Be specific to the content shown in bio and videos.
2. Keywords (15-25 terms): Array of relevant keywords extracted from bio, titles, and descriptions.
3. Niche (single category): A concise niche category like "Health & Fitness", "Gaming - Minecraft", "Technology - PC Building", "Education", "Food & Cooking", "Travel", "Beauty", "Fashion", "Comedy", "Documentary", "General Content Creator", etc. Base it on the primary topics and content focus.
4. Summary (2-3 sentences): Natural language summary of the creator's content focus.

Return ONLY valid JSON:
{
  "primary_topics": ["topic1", "topic2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "niche": "Health & Fitness",
  "summary": "2-3 sentence summary"
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a content analysis assistant. Extract topics and keywords from ${platformLabel} creator data. Return only valid JSON.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    const allText = [
      channelTitle,
      bioDescription || '',
      ...topVideos.map((v: any) => `${v.title} ${v.description || ''}`).join(' '),
    ].join(' ');
    
    return {
      primary_topics: Array.isArray(parsed.primary_topics) ? parsed.primary_topics.slice(0, 6) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 25) : [],
      summary: parsed.summary || `Content creator focused on various topics`,
      niche: parsed.niche || inferNicheFromTopics(
        Array.isArray(parsed.primary_topics) ? parsed.primary_topics : [],
        Array.isArray(parsed.keywords) ? parsed.keywords : [],
        allText
      ),
    };
  } catch (error: any) {
    console.error("Error inferring topics:", error);
    // Fallback: extract keywords manually
    const allText = [
      channelTitle,
      bioDescription || '',
      ...topVideos.map((v: any) => `${v.title} ${v.description || ''}`).join(' '),
    ].join(' ');

    const extractedKeywords = extractKeywords(allText, 25);
    const inferredTopics = extractedKeywords.slice(0, 4);
    const inferredNiche = inferNicheFromTopics(inferredTopics, extractedKeywords, allText);

    return {
      primary_topics: inferredTopics.length > 0 ? inferredTopics : [inferredNiche || 'General'],
      keywords: extractedKeywords,
      summary: `Content creator focused on ${inferredNiche || 'various topics'}`,
      niche: inferredNiche,
    };
  }
}

export async function buildCreatorProfile(userId: string) {
  if (!supabaseAdmin) {
    throw new Error("Database not configured");
  }

  // Fetch creator metrics and profile (support multiple platforms, prioritize TikTok > YouTube > most recent)
  const { data: metrics } = await supabaseAdmin
    .from("creator_metrics")
    .select("platform, followers, avg_views_10, top_videos, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  // Note: RLS policies ensure only this user's data is returned

  // Fetch creator record (use maybeSingle to handle case where it doesn't exist yet)
  const { data: creator, error: creatorFetchError } = await supabaseAdmin
    .from("creators")
    .select("niche")
    .eq("user_id", userId)
    .maybeSingle();
  
  // Log if creator table doesn't exist or query failed
  if (creatorFetchError) {
    // PGRST116 means "no rows returned" which is fine - we'll create the record
    if (!creatorFetchError.message?.includes("PGRST116") && !creatorFetchError.code?.includes("PGRST116")) {
      console.warn(`[profileBuilder] Warning: Failed to fetch creator record: ${creatorFetchError.message || creatorFetchError.code}`);
      console.warn(`[profileBuilder] This might mean the creators table doesn't exist yet. Run migration: 0021_create_creators_table.sql`);
    }
  }

  if (!metrics || metrics.length === 0) {
    throw new Error("No creator metrics found. Please scan your account first.");
  }

  // Select primary platform: TikTok > YouTube > most recent
  const tiktokMetrics = metrics.find((m) => m.platform === "tiktok");
  const youtubeMetrics = metrics.find((m) => m.platform === "youtube");
  const primaryMetrics = tiktokMetrics || youtubeMetrics || metrics[0];

  if (!primaryMetrics) {
    throw new Error("No creator metrics found for any platform");
  }

  const platform = primaryMetrics.platform;
  const followers = primaryMetrics.followers || 0;
  const avgViews = primaryMetrics.avg_views_10 || 0;
  const topVideos = primaryMetrics.top_videos || [];
  const existingNiche = creator?.niche || null;

  // Fetch social account for the primary platform (including bio if TikTok)
  const { data: socialAccount } = await supabaseAdmin
    .from("social_accounts")
    .select("handle, bio_description, avatar_url")
    .eq("user_id", userId)
    .eq("platform", platform)
    .single();

  const channelTitle = socialAccount?.handle || "Unknown Channel";
  const bio = socialAccount?.bio_description || null;

  // Log which platform's data is being used for profile building
  console.log(`[profileBuilder] userId=${userId}, building profile for platform=${platform}, available platforms=${metrics.map((m: any) => m.platform).join(",")}`);

  // Compute size tier
  let sizeTier: 'nano' | 'micro' | 'mid' | 'large' = 'nano';
  const sizeMetric = followers > 0 ? followers : Math.floor(avgViews / 10);
  
  if (sizeMetric >= 100000) {
    sizeTier = 'large';
  } else if (sizeMetric >= 10000) {
    sizeTier = 'mid';
  } else if (sizeMetric >= 1000) {
    sizeTier = 'micro';
  } else {
    sizeTier = 'nano';
  }

  // Infer topics and keywords using OpenAI (with niche inference)
  const openaiApiKey = process.env.OPENAI_API_KEY;
  let profileData: { primary_topics: string[]; keywords: string[]; summary: string; niche?: string };

  if (openaiApiKey && topVideos.length > 0) {
    // Use existing niche if available, otherwise infer from content
    profileData = await inferTopics(channelTitle, topVideos, existingNiche || "", openaiApiKey, platform, bio);
  } else {
    // Fallback: extract keywords manually and infer niche
    const allText = [
      channelTitle,
      bio || '',
      ...topVideos.map((v: any) => `${v.title} ${v.description || ''}`).join(' '),
    ].join(' ');

    const extractedKeywords = extractKeywords(allText, 25);
    const inferredTopics = extractedKeywords.slice(0, 4);

    // Infer niche from topics/keywords
    const inferredNiche = inferNicheFromTopics(inferredTopics, extractedKeywords, allText);

    profileData = {
      primary_topics: inferredTopics.length > 0 ? inferredTopics : [inferredNiche || 'General'],
      keywords: extractedKeywords,
      summary: `Content creator focused on ${inferredNiche || 'various topics'}`,
      niche: inferredNiche,
    };
  }

  // Infer niche from primary topics if not already set
  let inferredNiche: string;
  if (profileData.niche) {
    inferredNiche = profileData.niche;
    console.log(`[profileBuilder] Using niche from OpenAI: "${inferredNiche}"`);
  } else if (profileData.primary_topics && profileData.primary_topics.length > 0) {
    // Use the first primary topic as the niche, or infer from topics
    const topicText = profileData.primary_topics.join(' ');
    inferredNiche = inferNicheFromTopics(profileData.primary_topics, profileData.keywords || [], topicText);
    console.log(`[profileBuilder] Inferred niche from topics: "${inferredNiche}"`);
  } else {
    // Last resort: use first keyword or generic
    if (profileData.keywords && profileData.keywords.length > 0) {
      inferredNiche = profileData.keywords[0];
      console.log(`[profileBuilder] Using first keyword as niche: "${inferredNiche}"`);
    } else {
      inferredNiche = existingNiche || "General Content Creator";
      console.log(`[profileBuilder] Using fallback niche: "${inferredNiche}"`);
    }
  }

  // Update creators table with inferred niche (always update if missing or changed)
  if (!existingNiche || existingNiche !== inferredNiche) {
    console.log(`[profileBuilder] Updating niche: existingNiche=${existingNiche}, inferredNiche=${inferredNiche}`);
    
    const { error: creatorUpdateError } = await supabaseAdmin
      .from("creators")
      .upsert(
        {
          user_id: userId,
          niche: inferredNiche,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (creatorUpdateError) {
      console.error("Error: Failed to update creator niche:", creatorUpdateError);
      // Check if it's because table doesn't exist
      if (creatorUpdateError.message?.includes("relation") || creatorUpdateError.message?.includes("does not exist")) {
        console.error("CRITICAL: The 'creators' table does not exist! Please run migration: supabase/migrations/0021_create_creators_table.sql");
      }
      // Don't throw - this is non-critical, but log it clearly
    } else {
      console.log(`[profileBuilder] ✅ Successfully updated creator niche to: "${inferredNiche}" for userId=${userId}`);
    }
  } else {
    console.log(`[profileBuilder] Niche already set: "${existingNiche}", no update needed`);
  }

  // Upsert creator profile
  const { error: profileError } = await supabaseAdmin
    .from("creator_profiles")
    .upsert(
      {
        user_id: userId,
        size_tier: sizeTier,
        primary_topics: profileData.primary_topics,
        keywords: profileData.keywords,
        summary: profileData.summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (profileError) {
    console.error("Error upserting creator profile:", profileError);
    throw new Error("Failed to save creator profile");
  }

  return {
    size_tier: sizeTier,
    primary_topics: profileData.primary_topics,
    keywords: profileData.keywords,
    summary: profileData.summary,
    niche: inferredNiche,
  };
}

