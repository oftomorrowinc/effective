import picomatch from 'picomatch';

export type PathMatcher = (filePath: string) => boolean;

interface CompiledPatterns {
  includes: picomatch.Matcher[];
  excludes: picomatch.Matcher[];
}

function normalize(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\/+/, '');
}

function compile(patterns: readonly string[]): CompiledPatterns {
  const includes: picomatch.Matcher[] = [];
  const excludes: picomatch.Matcher[] = [];
  for (const raw of patterns) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('!')) {
      excludes.push(picomatch(trimmed.slice(1), { dot: true }));
    } else {
      includes.push(picomatch(trimmed, { dot: true }));
    }
  }
  return { includes, excludes };
}

/**
 * Compile a gitignore-style glob list into a path matcher.
 *
 * Patterns ending in or containing `**` follow glob semantics. A pattern
 * prefixed with `!` is a negation: a path matched by a negation is excluded
 * even if other patterns include it.
 *
 * Examples:
 *   ['app/**', 'lib/**']                  // app/ and lib/ are editable
 *   ['app/**', '!app/legacy/**']          // app/ except app/legacy/
 *   []                                    // nothing matches
 *
 * Paths are normalized to forward slashes and any leading `/` is stripped
 * before matching, so callers don't have to think about OS separators.
 */
export function compilePatterns(patterns: readonly string[]): PathMatcher {
  const { includes, excludes } = compile(patterns);
  return (filePath: string): boolean => {
    const normalized = normalize(filePath);
    if (!includes.some((m) => m(normalized))) return false;
    return !excludes.some((m) => m(normalized));
  };
}
