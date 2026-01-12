/**
 * Centralized application configuration
 * All base URLs and app settings should derive from here
 */

/**
 * Get the base application URL
 * Priority:
 * 1. NEXT_PUBLIC_APP_URL (explicit production URL)
 * 2. VERCEL_URL (Vercel deployment)
 * 3. Request origin (for API routes)
 * 4. NEXT_PUBLIC_SITE_URL (fallback)
 * 5. localhost:3000 (development fallback only)
 */
export function getAppUrl(req?: { url?: string; headers?: Headers }): string {
  // Explicit app URL (highest priority)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Vercel deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Request origin (for API routes)
  if (req?.url) {
    try {
      const url = new URL(req.url);
      return url.origin;
    } catch {
      // Invalid URL, continue to next option
    }
  }

  // Request headers (alternative for API routes)
  if (req?.headers) {
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    if (host) {
      return `${protocol}://${host}`;
    }
  }

  // Fallback from NEXT_PUBLIC_SITE_URL
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  // Development fallback (should only happen in local dev)
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  // Last resort - should not happen in production
  throw new Error('Unable to determine app URL. Please set NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL');
}

/**
 * Get OAuth redirect URI for a given callback path
 */
export function getOAuthRedirectUri(callbackPath: string, req?: { url?: string; headers?: Headers }): string {
  const baseUrl = getAppUrl(req);
  // Ensure callbackPath starts with /
  const path = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`;
  return `${baseUrl}${path}`;
}

/**
 * Check if we're in a development environment
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in a production environment
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

