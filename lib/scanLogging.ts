/**
 * Structured logging for scan pipeline steps
 * Safe logging (no tokens, no secrets)
 */

export interface ScanLogEntry {
  scan_run_id: string;
  user_id: string;
  provider: string;
  step: string;
  endpoint?: string;
  http_status?: number;
  http_error?: string;
  response_body?: string; // Safe to log TikTok error JSON (no tokens)
  db_result?: 'success' | 'failure';
  db_error?: string;
  error_code?: string;
  timestamp: number;
}

/**
 * Log a scan step (safe logging only - no tokens, no secrets)
 */
export function logScanStep(entry: Omit<ScanLogEntry, 'timestamp'>): void {
  const logEntry: ScanLogEntry = {
    ...entry,
    timestamp: Date.now(),
  };
  
  // Log to console (structured JSON)
  console.log(`[Scan Pipeline] ${entry.step}:`, JSON.stringify(logEntry, null, 2));
  
  // Send to debug endpoint if available (non-blocking, only in development)
  // In production, logs are sent to console only
  if (typeof fetch !== 'undefined' && process.env.NODE_ENV === 'development') {
    const debugEndpoint = process.env.DEBUG_LOG_ENDPOINT || 'http://127.0.0.1:7242/ingest/7b86813a-4110-42bb-937a-5779b59b7bd2';
    fetch(debugEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: `lib/scanLogging.ts:logScanStep`,
        message: `Scan step: ${entry.step}`,
        data: logEntry,
        timestamp: Date.now(),
        sessionId: 'scan-pipeline',
        runId: entry.scan_run_id,
      }),
    }).catch(() => {
      // Ignore fetch errors (logging is non-critical)
    });
  }
}

/**
 * Generate a scan run ID
 */
export function generateScanRunId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

