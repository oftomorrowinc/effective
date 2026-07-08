import path from 'node:path';
import { runCommand } from './toolchain/run.js';

/**
 * Filter a list of absolute file paths down to the ones git would NOT
 * ignore, using git's own semantics rather than a reimplementation of
 * gitignore matching.
 *
 * The predicate for dropping a path is exactly "would git itself ignore
 * it": the file is UNTRACKED **and** matched by an ignore rule
 * (`.gitignore` at any nesting level, `.git/info/exclude`, or the
 * user's global excludes file — whatever `git check-ignore` consults).
 *
 * Invariant — an ignore rule can never hide tracked code: a TRACKED
 * file is always kept, even when a (possibly later-added) ignore
 * pattern matches its path. Otherwise a real violation in committed
 * code could be hidden from the audit simply by adding a `.gitignore`
 * entry after the fact. `git check-ignore` already consults the index
 * and doesn't report tracked files, but because the invariant is
 * security-relevant we don't rely on that alone: every path
 * check-ignore reports is re-checked against the `git ls-files`
 * tracked set before being dropped.
 *
 * Fails open: when `root` is not inside a git work tree, git is not
 * installed, or any git invocation errors, the input list is returned
 * unchanged. For an audit, scanning too much is recoverable noise;
 * silently scanning too little is a false all-clear.
 */
export async function filterGitIgnored(
  root: string,
  absolutePaths: readonly string[],
): Promise<string[]> {
  if (absolutePaths.length === 0) return [];
  const entries = absolutePaths.map((abs) => ({
    abs,
    rel: path.relative(root, abs).replaceAll('\\', '/'),
  }));

  // Paths travel over stdin NUL-separated (-z), so filenames with
  // spaces, quotes, or newlines need no shell quoting at all.
  const checkIgnore = await runCommand({
    command: 'git check-ignore --stdin -z',
    cwd: root,
    stdin: entries.map((e) => e.rel).join('\0'),
  });
  // Exit 1 = "no path is ignored"; 128 = not a repo / bad invocation;
  // -1 = git missing. Only exit 0 means we have ignored paths to drop.
  if (checkIgnore.exitCode !== 0) return [...absolutePaths];
  const ignored = new Set(checkIgnore.stdout.split('\0').filter((p) => p.length > 0));
  if (ignored.size === 0) return [...absolutePaths];

  const lsFiles = await runCommand({ command: 'git ls-files -z', cwd: root });
  if (lsFiles.exitCode !== 0) return [...absolutePaths];
  const tracked = new Set(lsFiles.stdout.split('\0').filter((p) => p.length > 0));

  return entries.filter((e) => !(ignored.has(e.rel) && !tracked.has(e.rel))).map((e) => e.abs);
}
