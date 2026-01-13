/**
 * OAuth Debug Event Logger
 * Persists debug events to Supabase for troubleshooting OAuth flows
 */

import { supabaseAdmin } from './supabaseAdmin';

export interface OAuthDebugMeta {
  redirect_uri?: string;
  state_prefix?: string;
  has_code?: boolean;
  has_state?: boolean;
  has_error?: boolean;
  error?: string;
  http_status?: number;
  error_code?: string;
}

export async function logOAuthEvent(
  provider: 'tiktok' | 'youtube' | 'instagram',
  requestId: string,
  step: 'start' | 'callback' | 'exchange' | 'store' | 'redirect',
  status: 'ok' | 'fail',
  message: string,
  userId?: string | null,
  meta?: OAuthDebugMeta
): Promise<void> {
  try {
    await supabaseAdmin.from('oauth_debug_events').insert({
      provider,
      request_id: requestId,
      step,
      status,
      message,
      user_id: userId || null,
      meta: meta || null,
    });
  } catch (error: any) {
    // Don't throw - logging failures shouldn't break OAuth flow
    console.error('[OAuth Debug] Failed to log event:', error.message);
  }
}
