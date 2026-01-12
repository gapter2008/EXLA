import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching

export async function POST(req: Request) {
  const { name, email } = await req.json();
  if (!name || !email) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const { error } = await supabase.from("waitlist_users").insert({ name, email });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}


