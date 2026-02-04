/**
 * Derive the best thumbnail URL from YouTube API snippet.thumbnails.
 * Priority: maxres → high → medium → default.
 */
export function getYoutubeThumbnailUrl(thumbnails: {
  maxres?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
} | null | undefined): string | null {
  if (!thumbnails || typeof thumbnails !== "object") return null;
  const url =
    thumbnails.maxres?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null;
  return url || null;
}
