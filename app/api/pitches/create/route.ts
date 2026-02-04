import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:7',message:'POST handler entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  try {
    const body = await req.json();
    const { userId, brandName, brandWebsite, channel, subject, body: pitchBody, suggestedRate, deliverable } = body;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:11',message:'Parsed request body',data:{hasUserId:!!userId,hasBrandName:!!brandName,hasChannel:!!channel,hasBody:!!pitchBody,channel},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!brandName || !channel || !pitchBody) {
      return NextResponse.json(
        { error: "Missing required fields: brandName, channel, body" },
        { status: 400 }
      );
    }

    if (channel !== 'email' && channel !== 'dm') {
      return NextResponse.json(
        { error: "Channel must be 'email' or 'dm'" },
        { status: 400 }
      );
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:29',message:'Checking supabaseAdmin',data:{hasSupabaseAdmin:!!supabaseAdmin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    // Pitches table has no brand_id - only brand_name, brand_website (schema 0005)
    const insertData = {
      user_id: userId,
      brand_name: brandName,
      brand_website: brandWebsite || null,
      channel: channel,
      subject: channel === 'email' ? (subject || null) : null,
      body: pitchBody,
      suggested_rate: suggestedRate ?? null,
      deliverable: deliverable ?? null,
      status: 'draft',
    };
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:42',message:'Before insert',data:{insertData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    const { data: pitch, error } = await supabaseAdmin
      .from("pitches")
      .insert(insertData)
      .select()
      .single();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:50',message:'After insert',data:{hasError:!!error,errorCode:error?.code,errorMessage:error?.message,errorDetails:error?.details,errorHint:error?.hint,hasPitch:!!pitch},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (error) {
      console.error("Error creating pitch:", error);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:54',message:'Insert error detected',data:{errorCode:error?.code,errorMessage:error?.message,errorDetails:error?.details,errorHint:error?.hint},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Check if table doesn't exist
      if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
        return NextResponse.json(
          { error: "Database table not found. Please run the migration: supabase/migrations/0005_pitches_and_followups.sql in your Supabase SQL editor." },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: error.message || "Failed to create pitch" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, pitch });
  } catch (error: any) {
    console.error("Create pitch error:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/pitches/create/route.ts:65',message:'Uncaught error in catch block',data:{errorMessage:error?.message,errorStack:error?.stack?.substring(0,200),errorName:error?.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      { error: error.message || "Failed to create pitch" },
      { status: 500 }
    );
  }
}

