/**
 * Region-aware character classification for source text.
 *
 * Lets a regex-based rule distinguish a match in code (`console.log(x)`)
 * from the same textual pattern appearing in a string literal
 * (`"call console.log to debug"`) or a comment
 * (`// avoid console.log here`). Without this, pattern rules fire on
 * their own documentation and test fixtures, which is a high-volume
 * source of false positives. See the `feedback-detection-before-exception`
 * principle: fix detection before reaching for exceptions.
 *
 * This is a tokenizer-level scan, not an AST. It handles:
 *
 * - Line comments (`// ...` to end of line)
 * - Block comments (delimited by slash-star and star-slash)
 * - Single-quoted, double-quoted, and backtick (template) string literals
 * - Backslash-escape sequences inside string literals
 *
 * Known limitations (acceptable for this layer):
 *
 * - Template-literal `${ … }` interpolation: the embedded expression IS
 *   code, but we treat the whole template literal as a string. A pattern
 *   matched inside an interpolation will be incorrectly classified as
 *   `string`. Acceptable because the common false-positive case is
 *   docstrings/fixtures, not interpolated expressions.
 * - Regex literals (`/foo/g`): treated as code (the slashes are operators
 *   here). A pattern that happens to appear inside a regex literal is
 *   classified as `code`. Generally correct — a regex describing
 *   `console.log` references the term but doesn't call it.
 * - Unterminated strings/comments: scan stops at the obvious anchor (EOF,
 *   end-of-line for line comments). Robust enough for malformed input.
 */

export type Region = 'code' | 'string' | 'comment';

/**
 * Classify each character index in `content` as code / string / comment.
 * Returns an array of length `content.length`. O(n) single-pass.
 *
 * The body uses bounded integer indexing into a same-length array
 * (allocated below). Every index is a loop counter compared against the
 * content length on each iteration — exactly the
 * caller-validated-dynamic-key pattern.
 */
/* eslint-disable security/detect-object-injection -- exception-id: caller-validated-dynamic-key */
export function classifyRegions(content: string): Region[] {
  const regions: Region[] = Array.from({ length: content.length }, () => 'code');
  let i = 0;
  const n = content.length;

  while (i < n) {
    const ch = content.charAt(i);
    const next = content.charAt(i + 1);

    // Line comment: `//` to end of line (or EOF)
    if (ch === '/' && next === '/') {
      while (i < n && content.charAt(i) !== '\n') {
        regions[i] = 'comment';
        i += 1;
      }
      continue;
    }

    // Block comment: `/*` to `*/` (or EOF)
    if (ch === '/' && next === '*') {
      regions[i] = 'comment';
      regions[i + 1] = 'comment';
      i += 2;
      while (i < n) {
        if (content.charAt(i) === '*' && content.charAt(i + 1) === '/') {
          regions[i] = 'comment';
          regions[i + 1] = 'comment';
          i += 2;
          break;
        }
        regions[i] = 'comment';
        i += 1;
      }
      continue;
    }

    // Single- or double-quoted string literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      regions[i] = 'string';
      i += 1;
      while (i < n) {
        const c = content.charAt(i);
        if (c === '\\' && i + 1 < n) {
          regions[i] = 'string';
          regions[i + 1] = 'string';
          i += 2;
          continue;
        }
        regions[i] = 'string';
        if (c === quote) {
          i += 1;
          break;
        }
        // Unterminated string ends at newline (matches JS parse error
        // behavior; bail gracefully so we don't classify the rest of the
        // file as one big string on a syntax error).
        if (c === '\n') {
          break;
        }
        i += 1;
      }
      continue;
    }

    // Template literal (backtick)
    if (ch === '`') {
      regions[i] = 'string';
      i += 1;
      while (i < n) {
        const c = content.charAt(i);
        if (c === '\\' && i + 1 < n) {
          regions[i] = 'string';
          regions[i + 1] = 'string';
          i += 2;
          continue;
        }
        regions[i] = 'string';
        if (c === '`') {
          i += 1;
          break;
        }
        // We do NOT enter "code" mode inside `${ ... }` interpolation;
        // the whole template is classified as string. Documented limitation.
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  return regions;
}

/**
 * Quick predicate: does the character at `index` sit in a code region?
 * Useful when iterating regex matches and filtering out matches whose
 * starting offset lands in a string or comment.
 */
export function isCodeAt(regions: readonly Region[], index: number): boolean {
  return regions[index] === 'code';
}
/* eslint-enable security/detect-object-injection */
