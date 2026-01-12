import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Check all environment variables
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const youtubeClientId = process.env.YOUTUBE_CLIENT_ID;
  const youtubeClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const youtubeRedirectUri = process.env.YOUTUBE_REDIRECT_URI;
  
  const allSupabaseVars = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes("SUPABASE") || k.toUpperCase().includes("SERVICE"))
    .reduce((acc, key) => {
      acc[key] = process.env[key] ? `${process.env[key]!.substring(0, 20)}... (${process.env[key]!.length} chars)` : "NOT SET";
      return acc;
    }, {} as Record<string, string>);

  const allYoutubeVars = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes("YOUTUBE"))
    .reduce((acc, key) => {
      acc[key] = process.env[key] ? (key.includes("SECRET") ? "✅ SET (hidden)" : `${process.env[key]!.substring(0, 30)}... (${process.env[key]!.length} chars)`) : "NOT SET";
      return acc;
    }, {} as Record<string, string>);

  const serpApiKey = process.env.SERPAPI_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  return NextResponse.json({
    supabase: {
      SERVICE_ROLE_KEY: serviceKey 
        ? `✅ FOUND (${serviceKey.length} chars, starts with: ${serviceKey.substring(0, 15)}...)`
        : "❌ NOT FOUND",
      allSupabaseVars,
    },
    youtube: {
      CLIENT_ID: youtubeClientId 
        ? `✅ FOUND (${youtubeClientId.length} chars, starts with: ${youtubeClientId.substring(0, 20)}...)`
        : "❌ NOT FOUND",
      CLIENT_SECRET: youtubeClientSecret ? "✅ FOUND" : "❌ NOT FOUND",
      REDIRECT_URI: youtubeRedirectUri || "Using default: http://localhost:3000/api/oauth/youtube/callback",
      allYoutubeVars,
    },
    serpapi: {
      SERPAPI_KEY: serpApiKey 
        ? `✅ FOUND (${serpApiKey.length} chars, starts with: ${serpApiKey.substring(0, 10)}...)`
        : "❌ NOT FOUND",
    },
    openai: {
      OPENAI_API_KEY: openaiKey ? "✅ FOUND" : "❌ NOT FOUND",
    },
    allRelevantEnvKeys: Object.keys(process.env).filter(k => 
      k.includes("SUPABASE") || k.includes("SERVICE") || k.includes("YOUTUBE") || k.includes("OPENAI") || k.includes("SERPAPI")
    ),
    nodeEnv: process.env.NODE_ENV,
  }, { status: 200 });
}

