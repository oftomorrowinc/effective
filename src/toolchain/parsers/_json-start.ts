/**
 * Find the start of the first JSON value (`{` or `[`) in a stream of text.
 * Returns the index, or -1 if no JSON-looking character appears.
 */
function findJsonStart(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (ch === '{' || ch === '[') return i;
  }
  return -1;
}

/**
 * Locate the first JSON-looking substring in `stdout` and parse it. Returns
 * undefined for empty/non-JSON input or for syntactically invalid JSON.
 * Callers cast the returned `unknown` to their parser-specific shape.
 *
 * Used by every parser that wraps a CLI tool whose JSON output may be
 * preceded by package-manager banners or other non-JSON chatter.
 */
export function parseTrailingJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  const start = findJsonStart(trimmed);
  if (start < 0) return undefined;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return undefined;
  }
}
