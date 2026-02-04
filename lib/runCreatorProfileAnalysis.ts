/**
 * Server-side only. Runs AI creator profile analysis and upserts creator_ai_profiles.
 * Idempotent: rerun updates the same row.
 */
import { supabaseAdmin } from "./supabaseAdmin";
import { getContentSamplesForUser, ContentSamples } from "./creatorProfileAnalyzer";
import { creatorAiProfileOutputSchema } from "./creatorAiProfileSchema";
import OpenAI from "openai";

export interface RunAnalysisResult {
  success: boolean;
  profile?: Record<string, unknown>;
  error?: string;
}

async function upsertProfileStatus(
  userId: string,
  status: string,
  errorMessage: string | null
) {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from("creator_ai_profiles")
    .upsert(
      {
        user_id: userId,
        last_analysis_status: status,
        last_analysis_error: errorMessage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
}

function buildAnalysisPrompt(samples: ContentSamples): string {
  const ch = samples.channel;
  const videoTitles = samples.recent_videos.length > 0
    ? samples.recent_videos.map((v) => v.title).slice(0, 15)
    : [];
  const desc = ch.description ? ch.description.slice(0, 800) : "(none)";
  const videoSection = videoTitles.length > 0
    ? `Recent video titles:\n${videoTitles.map((t) => `- ${t}`).join("\n")}`
    : "Recent video titles: (none - use channel description only)";

  return `Analyze this creator's channel and output a single JSON object with exactly these keys (no extra keys):

{
  "headline": "One compelling one-line creator headline (e.g. 'Tech reviewer and how-to creator on YouTube')",
  "bio": "2-4 sentence bio summarizing who they are and what they create",
  "niches": ["niche1", "niche2"],
  "themes": ["theme1", "theme2"],
  "content_formats": ["e.g. tutorials", "reviews", "vlogs"],
  "style_descriptors": ["e.g. fast-paced", "informative", "comedic"],
  "audience_summary": "1-2 sentences on who the audience likely is",
  "brand_fit": [{"category": "Category name", "reasoning": "brief why"}],
  "suggested_collab_types": ["e.g. sponsored video", "affiliate", "gifted product"],
  "confidence": 0.0 to 1.0,
  "evidence": {"top_video_titles": ["..."], "recurring_keywords": ["..."], "stats_used": "brief"}
}

Input data:
Platform: ${samples.platform}
Channel: ${ch.display_name || ch.handle || "Unknown"}
Description: ${desc}
Subscribers: ${ch.subscribers ?? "unknown"}
${videoSection}

Output ONLY the JSON object.`;
}

/**
 * Run AI creator profile analysis for a user. Server-side only.
 * Returns { success, profile? } or { success: false, error }.
 */
export async function runCreatorProfileAnalysis(userId: string): Promise<RunAnalysisResult> {
  if (!supabaseAdmin) {
    return { success: false, error: "Database not configured" };
  }

  const contentSamples = await getContentSamplesForUser(userId);
  if (!contentSamples) {
    return { success: false, error: "No connected platform data. Connect a platform and run a sync first." };
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return { success: false, error: "OpenAI API key not configured" };
  }

  try {
    await upsertProfileStatus(userId, "running", null);
    console.log("[creator_profile_analysis] start", { userId, platform: contentSamples.platform, videoCount: contentSamples.recent_videos.length });

    const prompt = buildAnalysisPrompt(contentSamples);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing creator channels. Output ONLY valid JSON matching the required schema. No markdown, no code fences.`,
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const rawText = completion.choices[0]?.message?.content?.trim();
    if (!rawText) {
      await upsertProfileStatus(userId, "failed", "Empty LLM response");
      return { success: false, error: "Empty analysis response" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      await upsertProfileStatus(userId, "failed", "Invalid JSON from LLM");
      return { success: false, error: "Invalid JSON from analyzer" };
    }

    const result = creatorAiProfileOutputSchema.safeParse(parsed);
    if (!result.success) {
      await upsertProfileStatus(userId, "failed", result.error.message);
      return { success: false, error: "Schema validation failed" };
    }

    const profile = result.data;
    const { data: row, error: upsertError } = await supabaseAdmin
      .from("creator_ai_profiles")
      .upsert(
        {
          user_id: userId,
          primary_platform: contentSamples.platform,
          headline: profile.headline,
          bio: profile.bio,
          niches: profile.niches,
          themes: profile.themes,
          content_formats: profile.content_formats,
          style_descriptors: profile.style_descriptors,
          audience_summary: profile.audience_summary,
          brand_fit: profile.brand_fit,
          suggested_collab_types: profile.suggested_collab_types,
          confidence: profile.confidence,
          evidence: profile.evidence ?? {},
          last_analysis_status: "ok",
          last_analysis_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (upsertError) {
      await upsertProfileStatus(userId, "failed", upsertError.message);
      console.log("[creator_profile_analysis] db_upsert_fail", { userId, error: upsertError.message });
      return { success: false, error: upsertError.message };
    }

    console.log("[creator_profile_analysis] success", { userId, profileId: (row as any)?.id, headline: profile.headline?.slice(0, 40) });
    return { success: true, profile: row ?? undefined };
  } catch (err: any) {
    console.error("[runCreatorProfileAnalysis]", err);
    await upsertProfileStatus(userId, "failed", err?.message ?? "Unknown error");
    console.log("[creator_profile_analysis] error", { userId, error: err?.message });
    return { success: false, error: err?.message ?? "Analysis failed" };
  }
}
