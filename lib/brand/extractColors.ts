import fs from "node:fs";
import path from "node:path";

export type BrandColors = { primary: string; muted: string };

function clamp(n: number, min = 0, max = 1) { return Math.max(min, Math.min(max, n)); }

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)] as const;
}

export function extractColors(projectRoot: string = process.cwd()): BrandColors | null {
  try {
    const svgPath = path.join(projectRoot, "public/brand/logo.svg");
    const pngPath = path.join(projectRoot, "public/brand/logo.png");
    if (fs.existsSync(svgPath)) {
      const txt = fs.readFileSync(svgPath, "utf8");
      const fills = Array.from(txt.matchAll(/fill\s*=\s*"(#[0-9a-fA-F]{3,8})"/g)).map(m=>m[1]);
      const hex = fills[0] || "#6366f1";
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const [h, s, l] = rgbToHsl(r,g,b);
      const primary = `${h} ${s}% ${l}%`;
      const muted = `${h} ${Math.max(10, Math.round(s*0.2))}% ${clamp(l*1.15,0,100)}%`;
      return { primary, muted };
    }
    if (fs.existsSync(pngPath)) {
      // Simple heuristic: read first pixel bytes (not accurate but sufficient for suggestion)
      const buf = fs.readFileSync(pngPath);
      const r = buf[33], g = buf[34], b = buf[35];
      const [h, s, l] = rgbToHsl(r,g,b);
      return { primary: `${h} ${s}% ${l}%`, muted: `${h} ${Math.max(10, Math.round(s*0.2))}% ${clamp(l*1.15,0,100)}%` };
    }
    return null;
  } catch {
    return null;
  }
}

// Dev helper: log suggestion on startup
if (process.env.NODE_ENV !== "production" && process.env.BRAND_LOCKED !== "true") {
  const colors = extractColors();
  if (colors) {
    // eslint-disable-next-line no-console
    console.log(`[Brand] Suggested HSL → --brand: ${colors.primary}; --brand-muted: ${colors.muted}`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[Brand] Logo not found at /public/brand/logo.svg; using default brand color.");
  }
}


