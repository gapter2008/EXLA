import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    // Check for API key - try multiple possible names
    const apiKey = process.env.OPENAI_API_KEY || 
                   process.env.OPENAI_KEY || 
                   process.env.OAI_API_KEY;
    
    // Debug logging in development - show all env vars related to OpenAI
    if (process.env.NODE_ENV === 'development') {
      console.log("🔍 OpenAI API Key Debug:", {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.slice(0, 7)}...` : "NOT SET",
        OPENAI_KEY: process.env.OPENAI_KEY ? "SET" : "NOT SET",
        OAI_API_KEY: process.env.OAI_API_KEY ? "SET" : "NOT SET",
        foundKey: !!apiKey,
        keyLength: apiKey?.length || 0,
        allEnvKeys: Object.keys(process.env).filter(k => k.includes("OPENAI") || k.includes("OAI")).join(", ")
      });
    }
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: "OPENAI_API_KEY is not configured. Please verify:\n1. File is named exactly '.env.local' in project root\n2. Line format: OPENAI_API_KEY=sk-... (no quotes, no spaces around =)\n3. Dev server was fully restarted after adding the key\n\nCheck terminal logs for debug info." 
        },
        { status: 500 }
      );
    }

    // Parse and validate request body
    const body = await req.json();
    const { messages, context, mode = "generic" } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required and must not be empty" },
        { status: 400 }
      );
    }

    // Validate message structure
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return NextResponse.json(
          { error: "Each message must have 'role' and 'content' fields" },
          { status: 400 }
        );
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return NextResponse.json(
          { error: "Message role must be 'user', 'assistant', or 'system'" },
          { status: 400 }
        );
      }
    }

    // Initialize OpenAI client
    const client = new OpenAI({ apiKey });

    // Build messages array with optional Exla context
    let systemMessages: Array<{ role: "system"; content: string }> = [];
    
    if (mode === "exla" && context) {
      // Build context summary
      const metrics = context.creator_metrics;
      const profile = context.creator_profile;
      const topVideos = context.top_videos || [];
      const brands = context.brand_recommendations || [];
      const pitches = context.pitches_summary || { counts: {}, latest: [] };

      let contextText = `You are Exla Assistant, an AI that helps creators land brand deals. Your job is to turn creator stats into actionable advice that closes deals.

CREATOR CONTEXT:
`;

      if (metrics) {
        contextText += `- Subscribers: ${metrics.followers?.toLocaleString() || 0}
- Avg views (last 10): ${metrics.avg_views_10?.toLocaleString() || 0}
- Engagement rate: ${metrics.engagement_rate_10?.toFixed(2) || 0}%
`;
      }

      if (profile) {
        contextText += `- Size tier: ${profile.size_tier || 'unknown'}
- Topics: ${profile.primary_topics?.join(', ') || 'general'}
- Summary: ${profile.summary || 'Content creator'}
`;
      }

      if (topVideos.length > 0) {
        contextText += `\nTop videos:\n${topVideos.map((v: any, i: number) => `${i + 1}. ${v.title} (${v.views?.toLocaleString() || 0} views)`).join('\n')}\n`;
      }

      if (brands.length > 0) {
        contextText += `\nAvailable brand matches: ${brands.map((b: any) => b.brand_name).join(', ')}\n`;
      }

      if (pitches.counts) {
        contextText += `\nPitch pipeline: ${pitches.counts.draft || 0} drafts, ${pitches.counts.sent || 0} sent, ${pitches.counts.replied || 0} replied, ${pitches.counts.closed || 0} closed\n`;
      }

      contextText += `\nINSTRUCTIONS:
- Be concise. Use bullets and short paragraphs.
- Always provide clear next steps.
- If asked for pitches: give 2 versions (Email + DM).
- If asked for follow-ups: give 2 follow-up options.
- If asked "which brand": pick 3 from available matches with reasons.
- Focus on actionable advice that helps close deals.
- Never output long walls of text.`;

      systemMessages.push({ role: "system", content: contextText });
    }

    // Combine system messages with user messages
    const allMessages = [
      ...systemMessages,
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      })),
    ];

    // Call OpenAI Chat Completions
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: allMessages,
      temperature: 0.7,
    });

    const assistantMessage = completion.choices[0]?.message?.content?.trim() || "";

    if (!assistantMessage) {
      return NextResponse.json(
        { error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ text: assistantMessage });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process chat request" },
      { status: 500 }
    );
  }
}

