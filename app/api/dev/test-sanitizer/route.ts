import { NextResponse } from "next/server";
import { runSanitizerTest } from "@/lib/chatMessageSanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dev/test-sanitizer
 * Runs sanitizer on sample markdown and returns pass/fail. Dev only.
 */
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  const result = runSanitizerTest();
  return NextResponse.json(result);
}
