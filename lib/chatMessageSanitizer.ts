/**
 * Sanitize AI chat messages for plain-text display.
 * Removes markdown artifacts (**, #, -, numbered lists, etc.) so the UI
 * can render clean, mobile-friendly text without markdown parsing.
 */

export function sanitizeChatMessage(text: string): string {
  if (!text || typeof text !== "string") return "";

  let out = text;

  // Strip bold: **text** or __text__
  out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  out = out.replace(/__(.+?)__/g, "$1");
  out = out.replace(/\*(.+?)\*/g, "$1");
  out = out.replace(/_(.+?)_/g, "$1");

  // Strip heading markers (###, ##, #) from start of line
  out = out.replace(/^#{1,6}\s+/gm, "");

  // Strip list prefixes: "1. ", "2. ", "- ", "• ", "* " at line start
  out = out.replace(/^\d+\.\s+/gm, "");
  out = out.replace(/^[-*•]\s+/gm, "");
  out = out.replace(/^\s*[-*•]\s+/gm, "");

  // Strip inline code backticks (single word or phrase)
  out = out.replace(/`([^`]+)`/g, "$1");

  // Strip link syntax [text](url) -> text
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Collapse 3+ newlines to at most 2
  out = out.replace(/\n{3,}/g, "\n\n");

  // Trim each line and collapse multiple spaces
  out = out
    .split("\n")
    .map((line) => line.trim().replace(/\s{2,}/g, " "))
    .join("\n");

  return out.trim();
}

/**
 * Run a quick regression test: sanitize sample markdown and verify output has no markdown.
 * Use from dev API GET /api/dev/test-sanitizer or in console.
 */
export function runSanitizerTest(): { pass: boolean; input: string; output: string; hasMarkdownInOutput: boolean } {
  const input = `**Strengths of your channel:**

1. High engagement rate (4.2%)
2. Consistent uploads
3. Strong niche focus

### Next step
Try reaching out to [NordVPN](https://nordvpn.com) – they work with nano creators.`;
  const output = sanitizeChatMessage(input);
  const hasMarkdownInOutput =
    output.includes("**") ||
    output.includes("###") ||
    /^\d+\.\s/m.test(output) ||
    /^[-*•]\s/m.test(output) ||
    output.includes("](http");
  return { pass: !hasMarkdownInOutput, input, output, hasMarkdownInOutput };
}
