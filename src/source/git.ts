import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runCommand } from '../toolchain/run.js';
import type { ChangedFile, ChangedFileStatus } from './types.js';

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

async function gitRun(repo: string, args: string): Promise<string> {
  const result = await runCommand({ command: `git ${args}`, cwd: repo });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args} failed (exit ${String(result.exitCode)}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function parseNameStatus(stdout: string): { path: string; status: ChangedFileStatus }[] {
  const entries: { path: string; status: ChangedFileStatus }[] = [];
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const [letter, ...rest] = line.split('\t');
    if (letter === undefined || rest.length === 0) continue;
    const status = STATUS_MAP[letter.charAt(0).toUpperCase()] ?? 'modified';
    entries.push({ path: rest.join('\t'), status });
  }
  return entries;
}

async function listChangedPaths(
  input: GitDiffInput,
): Promise<{ path: string; status: ChangedFileStatus }[]> {
  const stdout = await gitRun(
    input.repo,
    `diff --name-status --no-renames ${shellQuote(input.baseline)}...${shellQuote(input.work)}`,
  );
  return parseNameStatus(stdout);
}

async function readFileAtRef(repo: string, ref: string, filePath: string): Promise<string> {
  const result = await runCommand({
    command: `git show ${shellQuote(`${ref}:${filePath}`)}`,
    cwd: repo,
  });
  if (result.exitCode !== 0) return '';
  return result.stdout;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./@:^~-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * Resolve the diff between `work` and `baseline` into a list of
 * ChangedFile records with their post-change contents.
 *
 * Deleted files come back with empty content. Renamed files surface as
 * a single 'modified'-style entry on the new path (we pass `--no-renames`
 * to git, so a rename actually appears as a delete + add).
 */
export async function loadGitDiff(input: GitDiffInput): Promise<ChangedFile[]> {
  const paths = await listChangedPaths(input);
  const files: ChangedFile[] = [];
  for (const entry of paths) {
    if (entry.status === 'deleted') {
      files.push({ path: entry.path, content: '', status: 'deleted' });
      continue;
    }
    const content = await readFileAtRef(input.repo, input.work, entry.path);
    files.push({ path: entry.path, content, status: entry.status });
  }
  return files;
}

export interface StagedDiffInput {
  /** Absolute path to the git repo. */
  repo: string;
}

export async function loadStagedDiff(input: StagedDiffInput): Promise<ChangedFile[]> {
  const stdout = await gitRun(input.repo, 'diff --name-status --cached --no-renames');
  const entries = parseNameStatus(stdout);
  const files: ChangedFile[] = [];
  for (const entry of entries) {
    if (entry.status === 'deleted') {
      files.push({ path: entry.path, content: '', status: 'deleted' });
      continue;
    }
    const filePath = path.join(input.repo, entry.path);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      files.push({ path: entry.path, content, status: entry.status });
    } catch {
      files.push({ path: entry.path, content: '', status: entry.status });
    }
  }
  return files;
}
