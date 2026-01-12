import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function POST(req: Request) {
  try {
    const { name, niche, brand, suggestedRate, deliverable, channel = 'email' } = await req.json();
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const system = `You are an assistant that writes concise, professional outreach ${channel === 'email' ? 'emails' : 'DMs'} for creators pitching brands. Keep it under 200 words.`;
    
    const rateText = suggestedRate ? `Suggested rate: $${suggestedRate}.` : 'Open to collaboration.';
    const deliverableText = deliverable ? `Deliverable: ${deliverable}.` : '';
    
    const user = `Creator: ${name} (niche: ${niche})
Brand: ${brand.brand_name || brand.name}
${brand.category ? `Category: ${brand.category}\n` : ''}${brand.why_match ? `Why this brand fits: ${brand.why_match}\n` : ''}
${rateText} ${deliverableText}

Write a professional ${channel === 'email' ? 'email' : 'DM'} with:
${channel === 'email' ? '- Subject line (keep it short and engaging)\n' : ''}- Body (personalized, authentic, and includes the creator's value proposition)

Format as JSON: ${channel === 'email' ? '{"subject": "...", "body": "..."}' : '{"body": "..."}'}`;

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = res.choices[0]?.message?.content?.trim() || "";
    let parsed;
    
    try {
      parsed = JSON.parse(content);
    } catch {
      // Fallback: try to extract subject and body from text
      const subjectMatch = content.match(/subject[:\s]+(.+?)(?:\n|$)/i);
      const bodyMatch = content.match(/body[:\s]+(.+)/is);
      
      parsed = {
        subject: channel === 'email' ? (subjectMatch?.[1]?.trim() || `Collaboration opportunity with ${name}`) : undefined,
        body: bodyMatch?.[1]?.trim() || content,
      };
    }

    return NextResponse.json({
      subject: parsed.subject || (channel === 'email' ? `Collaboration opportunity with ${name}` : undefined),
      body: parsed.body || content,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to generate pitch" }, { status: 500 });
  }
}


