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
 * Find the matching close of the JSON value that starts at `start`.
 * Walks balanced brackets while respecting string literals (so `"]"` or
 * `"}"` inside a string don't decrement depth). Returns the index ONE
 * PAST the matching close, suitable for `slice(start, end)`. Returns -1
 * if the brackets never balance (truncated output).
 *
 * Needed because `JSON.parse` is strict about trailing characters, and
 * package-manager wrappers (notably pnpm/npm) commonly append exit
 * messages like ` ELIFECYCLE  Command failed with exit code 1.` AFTER
 * the JSON output of a non-zero-exiting child. Slicing precisely to
 * the JSON value's end avoids `Unexpected token` on parse.
 */
function findJsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Locate the first JSON value in `stdout` and parse it. Returns
 * undefined for empty/non-JSON input or for syntactically invalid JSON.
 * Callers cast the returned `unknown` to their parser-specific shape.
 *
 * Used by every parser that wraps a CLI tool whose JSON output may be
 * preceded by package-manager banners or followed by exit-code chatter
 * (pnpm's `ELIFECYCLE  Command failed with exit code N` is the
 * canonical example). Brackets are bracket-counted so trailing garbage
 * after the JSON value doesn't break the parse.
 */
export function parseTrailingJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return undefined;
  const start = findJsonStart(trimmed);
  if (start < 0) return undefined;
  const end = findJsonEnd(trimmed, start);
  if (end < 0) return undefined;
  try {
    return JSON.parse(trimmed.slice(start, end));
  } catch {
    return undefined;
  }
}
