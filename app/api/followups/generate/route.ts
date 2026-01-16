import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, pitchId } = body;

    if (!userId || !pitchId) {
      return NextResponse.json(
        { error: "Missing required fields: userId, pitchId" },
        { status: 400 }
      );
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Fetch pitch details - include all fields that might be needed
    const { data: pitchData, error: pitchError } = await supabaseAdmin
      .from("pitches")
      .select("id, user_id, brand_name, channel, subject, body")
      .eq("id", pitchId)
      .eq("user_id", userId)
      .single();

    if (pitchError || !pitchData) {
      return NextResponse.json(
        { error: "Pitch not found" },
        { status: 404 }
      );
    }

    // Type assertion to ensure TypeScript recognizes the selected fields
    // The select statement above explicitly includes brand_name, channel, subject, body
    type PitchFields = {
      id: string;
      user_id: string;
      brand_name: string | null;
      channel: string | null;
      subject: string | null;
      body: string | null;
    };
    const pitch = pitchData as unknown as PitchFields;
    
    // Safe field extraction with fallbacks
    const brand = pitch.brand_name ?? "Brand";
    const channel = pitch.channel ?? "email";
    const subject = pitch.subject ?? "";
    const pitchBody = pitch.body ?? "";

    // Fetch creator metrics for context
    const { data: metrics } = await supabaseAdmin
      .from("creator_metrics")
      .select("followers, avg_views_10, engagement_rate_10")
      .eq("user_id", userId)
      .eq("platform", "youtube")
      .single();

    const client = new OpenAI({ apiKey: openaiApiKey });

    const followUpPrompt = `Generate a friendly follow-up message for a brand pitch. 

Original pitch:
Brand: ${brand}
Channel: ${channel}
${subject ? `Subject: ${subject}` : ''}
Body: ${pitchBody}

Creator stats:
${metrics ? `- Followers: ${metrics.followers?.toLocaleString() || 0}
- Avg views: ${metrics.avg_views_10?.toLocaleString() || 0}
- Engagement: ${metrics.engagement_rate_10?.toFixed(2) || 0}%` : 'N/A'}

Generate a short, professional follow-up message (2-3 sentences) that:
- Is friendly and not pushy
- References the original pitch briefly
- Offers value or asks if they need any additional information
- Maintains a professional tone

Return JSON: { message: "follow-up text here" }`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional email/message writer for creator outreach." },
        { role: "user", content: followUpPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      success: true,
      message: parsed.message || "Hi! Just following up on my previous message. I'd love to collaborate if you're interested!",
    });
  } catch (error: any) {
    console.error("Generate follow-up error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate follow-up" },
      { status: 500 }
    );
  }
}

