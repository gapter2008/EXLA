import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Show all OpenAI-related env vars (without exposing the actual key)
  const envInfo = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ SET (length: " + process.env.OPENAI_API_KEY.length + ")" : "❌ NOT SET",
    OPENAI_KEY: process.env.OPENAI_KEY ? "✅ SET" : "❌ NOT SET",
    OAI_API_KEY: process.env.OAI_API_KEY ? "✅ SET" : "❌ NOT SET",
    allOpenAIKeys: Object.keys(process.env).filter(k => k.toUpperCase().includes("OPENAI") || k.toUpperCase().includes("OAI")),
    nodeEnv: process.env.NODE_ENV,
  };

  return NextResponse.json(envInfo, { status: 200 });
}

