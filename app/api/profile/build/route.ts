import { NextRequest, NextResponse } from "next/server";
import { buildCreatorProfile } from "@/lib/profileBuilder";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Prevent Next.js caching of user-specific data

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await buildCreatorProfile(userId);

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    console.error("Build profile error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build creator profile" },
      { status: 500 }
    );
  }
}


