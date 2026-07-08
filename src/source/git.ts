import { runProcess } from '../toolchain/run.js';
import type { ChangedFile, ChangedFileStatus, CommitMetadata } from './types.js';

export interface GitDiffInput {
  /** Absolute path to the git repo (the directory containing .git). */
  repo: string;
  /** The branch/ref representing the work being verified. */
  work: string;
  /** The branch/ref the work is being compared against. */
  baseline: string;
}

const STATUS_MAP: Record<string, ChangedFileStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'modified',
};

/**
 * All git invocations here go through `runProcess` (argv array, no
 * shell): refs and file paths are repository-derived data, and with no
 * shell in the middle there is nothing to quote or inject into — on
 * POSIX or Windows alike.
 */
async function gitRun(repo: string, args: readonly string[]): Promise<string> {
  const result = await runProcess({ file: 'git', args, cwd: repo });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (exit ${String(result.exitCode)}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

/**
 * Parse `git diff --name-status -z` output: NUL-delimited alternating
 * status / path records. `-z` makes git emit pathnames verbatim —
 * no C-quoting of spaces, quotes, or non-ASCII bytes — so a filename
 * can never be mangled into an unreadable path that would otherwise
 * be silently verified as empty content.
 */
function parseNameStatusZ(stdout: string): { path: string; status: ChangedFileStatus }[] {
  const tokens = stdout.split('\0');
  const entries: { path: string; status: ChangedFileStatus }[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const rawStatus = tokens[i];
    const filePath = tokens[i + 1];
    if (rawStatus === undefined || rawStatus.length === 0) break;
    if (filePath === undefined || filePath.length === 0) continue;
    const status = STATUS_MAP[rawStatus.charAt(0).toUpperCase()] ?? 'modified';
    entries.push({ path: filePath, status });
  }
  return entries;
}

async function listChangedPaths(
  input: GitDiffInput,
): Promise<{ path: string; status: ChangedFileStatus }[]> {
  const stdout = await gitRun(input.repo, [
    'diff',
    '--name-status',
    '--no-renames',
    '-z',
    `${input.baseline}...${input.work}`,
  ]);
  return parseNameStatusZ(stdout);
}

/**
 * Read a blob's content at a rev-spec (`<ref>:<path>` or the index
 * form `:0:<path>`). Paths without a `./` prefix resolve relative to
 * the repo ROOT regardless of cwd, matching the root-relative paths
 * `git diff --name-status` emits — so verification works from a repo
 * subdirectory too.
 *
 * Returns `undefined` when the spec names a submodule gitlink (a
 * commit object, not a blob) — a submodule bump has no file content
 * to scan. Any other read failure THROWS: silently substituting empty
 * content would let a rule-violating file pass verification as if it
 * were blank, which is exactly the false-all-clear an audit gate must
 * never produce.
 */
async function readBlobAt(repo: string, spec: string): Promise<string | undefined> {
  const result = await runProcess({ file: 'git', args: ['show', spec], cwd: repo });
  if (result.exitCode === 0) return result.stdout;
  const type = await runProcess({ file: 'git', args: ['cat-file', '-t', spec], cwd: repo });
  if (type.exitCode === 0 && type.stdout.trim() === 'commit') return undefined;
  throw new Error(
    `git show ${spec} failed (exit ${String(result.exitCode)}): ${result.stderr.trim()} — ` +
      `refusing to verify unreadable content as empty.`,
  );
}

/**
 * Resolve the diff between `work` and `baseline` into a list of
 * ChangedFile records with their post-change contents.
 *
 * Deleted files come back with empty content. Renamed files surface as
 * a single 'modified'-style entry on the new path (we pass `--no-renames`
 * to git, so a rename actually appears as a delete + add). Submodule
 * bumps (gitlink entries) are skipped — there is no file content to
 * check. An unreadable non-deleted file is an error, never empty
 * content.
 */
export async function loadGitDiff(input: GitDiffInput): Promise<ChangedFile[]> {
  const paths = await listChangedPaths(input);
  const files: ChangedFile[] = [];
  for (const entry of paths) {
    if (entry.status === 'deleted') {
      files.push({ path: entry.path, content: '', status: 'deleted' });
      continue;
    }
    const content = await readBlobAt(input.repo, `${input.work}:${entry.path}`);
    if (content === undefined) continue;
    files.push({ path: entry.path, content, status: entry.status });
  }
  return files;
}

export interface StagedDiffInput {
  /** Absolute path to the git repo. */
  repo: string;
}

/**
 * Read commit-time metadata for a given ref. Returns undefined when
 * the ref doesn't resolve (e.g., an empty repo or a misspelled ref);
 * downstream rules check for the specific field they consume.
 *
 * Output format: `%s%n%H%n%an%n%aI` (subject, sha, author, ISO date),
 * one field per line. The message is the SUBJECT only — the full body
 * is fetched separately when needed.
 */
export async function loadCommitMetadata(
  repo: string,
  ref: string,
): Promise<CommitMetadata | undefined> {
  const FIELD_SEP = '%n----%n';
  const result = await runProcess({
    file: 'git',
    args: ['log', '-1', `--format=%s${FIELD_SEP}%H${FIELD_SEP}%an${FIELD_SEP}%aI`, ref],
    cwd: repo,
  });
  if (result.exitCode !== 0) return undefined;
  const [message, sha, author, date] = result.stdout.split('\n----\n').map((s) => s.trim());
  if (message === undefined || sha === undefined) return undefined;
  return {
    ...(message.length > 0 ? { message } : {}),
    ...(sha.length > 0 ? { sha } : {}),
    ...(author !== undefined && author.length > 0 ? { author } : {}),
    ...(date !== undefined && date.length > 0 ? { date } : {}),
  };
}

/**
 * Load the staged diff with content read from the INDEX (`git show
 * :0:<path>`), not the working tree. The index is the authoritative
 * "what will be committed" state: a fix that exists only in the
 * working tree must not make a pre-commit verify pass, and unstaged
 * working-tree noise must not fail it. Index reads also resolve
 * root-relative, so running from a repo subdirectory reads the right
 * files instead of silently verifying empty content.
 */
export async function loadStagedDiff(input: StagedDiffInput): Promise<ChangedFile[]> {
  const stdout = await gitRun(input.repo, [
    'diff',
    '--name-status',
    '--cached',
    '--no-renames',
    '-z',
  ]);
  const entries = parseNameStatusZ(stdout);
  const files: ChangedFile[] = [];
  for (const entry of entries) {
    if (entry.status === 'deleted') {
      files.push({ path: entry.path, content: '', status: 'deleted' });
      continue;
    }
    const content = await readBlobAt(input.repo, `:0:${entry.path}`);
    if (content === undefined) continue;
    files.push({ path: entry.path, content, status: entry.status });
  }
  return files;
}
