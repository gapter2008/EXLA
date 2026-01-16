import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { name, primary_platform, onboarding_step } = await req.json();

    // Get auth token from request
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user with anon key client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = user.id;

    // Build update object (only include provided fields)
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (primary_platform !== undefined) updateData.primary_platform = primary_platform;
    if (onboarding_step !== undefined) updateData.onboarding_step = onboarding_step;

    // Use service role client for reliable updates (bypasses RLS and schema cache)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Try update first
    const { error: updateError, count } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('[Profile Update API] Service role update failed:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        userId,
      });
      
      // If update fails, try insert (profile might not exist)
      // DO NOT include email or role - columns may not exist in profiles table
      const insertData: any = {
        id: userId,
        ...updateData,
        onboarding_completed: false, // Default
      };

      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(insertData);

      if (insertError) {
        console.error('[Profile Update API] Service role insert failed:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          userId,
        });
        return NextResponse.json(
          { error: `Failed to save profile: ${insertError.message || 'Database error'}` },
          { status: 500 }
        );
      }
    } else if (count === 0) {
      // No rows updated, profile doesn't exist - try insert
      // DO NOT include email or role - columns may not exist in profiles table
      const insertData: any = {
        id: userId,
        ...updateData,
        onboarding_completed: false,
      };

      const { error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(insertData);

      if (insertError) {
        console.error('[Profile Update API] Service role insert failed after zero rows updated:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          userId,
        });
        return NextResponse.json(
          { error: `Failed to save profile: ${insertError.message || 'Database error'}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API error updating profile:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

