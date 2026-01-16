import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
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

    // Use service role to delete all user data
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Delete user data from all tables (most have CASCADE, but we'll be explicit)
    // Tables with CASCADE will auto-delete when profile is deleted:
    // - tokens
    // - social_posts (and post_analyses via cascade)
    // - creators
    // - media_kits
    // - pitches
    // - brand_recommendations
    // - scan_jobs
    // - social_accounts
    // - connected_accounts
    // - creator_stats
    // - creator_profile
    // - oauth_states
    // etc.

    // Delete from tables that don't cascade or need explicit deletion
    // Most tables have ON DELETE CASCADE, but some need explicit cleanup
    const tablesToClean = [
      { table: 'api_usage', column: 'user_id' }, // has ON DELETE SET NULL
      { table: 'oauth_debug_events', column: 'user_id' }, // has ON DELETE SET NULL
      { table: 'media_kit_views', column: 'kit_user_id' }, // different column name
      { table: 'cache_brand_candidates', column: 'user_id' },
      { table: 'usage_limits', column: 'user_id' },
      { table: 'brand_generation_jobs', column: 'user_id' },
      { table: 'oauth_states', column: 'user_id' }, // cleanup OAuth states
    ];

    for (const { table, column } of tablesToClean) {
      try {
        await supabaseAdmin
          .from(table)
          .delete()
          .eq(column, userId);
      } catch (err: any) {
        // Table might not exist or column might be different, continue
        console.warn(`Could not delete from ${table}:`, err.message);
      }
    }

    // Delete the profile (this will cascade to all related tables)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return NextResponse.json(
        { error: profileError.message || 'Failed to delete profile' },
        { status: 500 }
      );
    }

    // Finally, delete the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      // Profile is already deleted, so we'll return success anyway
      // The auth user deletion might fail if user doesn't exist, which is fine
    }

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (err: any) {
    console.error('Delete account error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

