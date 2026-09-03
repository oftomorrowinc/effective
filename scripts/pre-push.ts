/**
 * Pre-push gate with a fast path for pushes that add no new history.
 *
 * Git feeds the hook one line per ref being pushed on stdin:
 * `<local-ref> <local-sha> <remote-ref> <remote-sha>`.
 *
 * The fast path exists for tag pushes: `git push origin v1.0.0` names
 * commits that already went through the PR gate and CI, so re-running
 * lint + tests + build + verify is pure redundancy — and worse,
 * `verify --against origin/main` reports on branch state a tag push
 * doesn't change (see docs/RELEASING.md).
 *
 * The predicate is NOT "the remote ref is a tag." That reads the
 * DESTINATION name, which the pusher chooses freely:
 *
 *   git push origin my-branch:refs/tags/v9.9.9
 *
 * spells a tag on the remote while uploading whatever commits the local
 * branch points at. Before this was fixed, that push printed "skipping
 * the gate" and shipped never-verified code — a complete zero-check
 * path from disk to remote, since tag pushes trigger no CI either.
 *
 * The predicate that actually matches the justification is about
 * CONTENT, not naming: skip only when every commit being pushed is
 * ALREADY on the remote. A real tag push satisfies that (the commits
 * merged first); a spoofed one does not (the branch commits are new);
 * a fresh tag on an unpushed commit does not either. Deletions push no
 * commits and are covered by the same rule.
 *
 * Anything we cannot prove is already-pushed runs the full gate.
 * Skipping is the exception, and it has to earn it.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const GATE =
  'pnpm lint && pnpm typecheck && pnpm test && pnpm build && node dist/cli.mjs verify --against origin/main';

const ZERO = /^0+$/;

export interface GitResult {
  readonly status: number | null;
  readonly stdout: string;
}

export type GitRunner = (args: readonly string[]) => GitResult;

const defaultRunGit: GitRunner = (args) => {
  const result = spawnSync('git', [...args], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout };
};

/**
 * Commits reachable from `sha` that are NOT reachable from any remote
 * ref. Empty means the remote already has every one of them.
 *
 * `--not --remotes` is deliberately broad: any remote-tracking ref
 * counts as "already pushed", because CI gates what lands on a remote
 * branch, not which name it arrived under.
 */
export const unpushedCommits = (sha: string, runGit: GitRunner = defaultRunGit): string[] => {
  // Order matters: the rev comes FIRST, then `--not --remotes`. Passing
  // the sha after a `--` makes git read it as a pathspec, which returns
  // nothing and turns this guard into a rubber stamp. That mistake is
  // silent and fails open, so it has a test of its own.
  const result = runGit(['rev-list', sha, '--not', '--remotes']);
  // A git failure (unknown sha, no remotes configured, not a repo) is
  // NOT evidence of safety. Report something so the caller gates.
  if (result.status !== 0) return ['<rev-list failed>'];
  return result.stdout.split('\n').filter((line) => line.trim().length > 0);
};

/**
 * Parse the hook's stdin into ref lines.
 */
export const parseRefLines = (stdin: string): string[] => {
  return stdin
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

/**
 * True when every ref in this push carries only commits the remote
 * already has. Deletions (all-zero local sha) push nothing.
 *
 * An empty ref list is FALSE: no refs means stdin was unreadable, which
 * is not the same as having nothing to check.
 */
export const addsNoNewCommits = (
  refLines: readonly string[],
  runGit: GitRunner = defaultRunGit,
): boolean => {
  if (refLines.length === 0) return false;
  for (const line of refLines) {
    const localSha = line.split(/\s+/)[1];
    if (localSha === undefined) return false;
    if (ZERO.test(localSha)) continue;
    if (unpushedCommits(localSha, runGit).length > 0) return false;
  }
  return true;
};

const main = (): void => {
  let stdin = '';
  try {
    stdin = readFileSync(0, 'utf8');
  } catch {
    // No readable stdin — treat as no refs, which runs the full gate.
  }
  const lines = parseRefLines(stdin);
  if (addsNoNewCommits(lines)) {
    process.stdout.write(
      `[pre-push] no new commits (${String(lines.length)} ref(s)) — skipping the gate; ` +
        'every commit in this push is already on the remote and was gated when it landed.\n',
    );
    return;
  }
  const result = spawnSync(GATE, { shell: true, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
};

// Only run the gate when invoked as the hook, so the predicate above can
// be imported and tested without spawning a build.
if (process.env.EFFECTIVE_PRE_PUSH_IMPORT !== '1') main();
