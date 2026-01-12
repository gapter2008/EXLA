import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching

export async function GET() {
  const { data, error } = await supabase
    .from("brands")
    .select("id, brand_name, contact_email, platform, industry, notes")
    .order("brand_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}


