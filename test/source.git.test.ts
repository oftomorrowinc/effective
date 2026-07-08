import { describe, expect, it } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadGitDiff, loadStagedDiff } from '../src/source/git.js';
import { git, useEphemeralRepo } from './_git-helpers.js';

describe('loadGitDiff', () => {
  const repoRef = useEphemeralRepo();

  it('captures additions, modifications, and deletions in a feature branch', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'a.txt'), 'first\n');
    await git(repo, 'add a.txt');
    await git(repo, 'commit -m "add a"');

    await git(repo, 'checkout -b feature');
    await writeFile(path.join(repo, 'a.txt'), 'modified\n');
    await writeFile(path.join(repo, 'b.txt'), 'new file\n');
    await git(repo, 'add a.txt b.txt');
    await git(repo, 'commit -m "modify a, add b"');

    await git(repo, 'rm a.txt');
    await git(repo, 'commit -m "remove a"');

    const files = await loadGitDiff({ repo, work: 'feature', baseline: 'main' });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(byPath['a.txt']?.status).toBe('deleted');
    expect(byPath['a.txt']?.content).toBe('');
    expect(byPath['b.txt']?.status).toBe('added');
    expect(byPath['b.txt']?.content.trim()).toBe('new file');
  });

  it('returns no files when work matches baseline', async () => {
    const files = await loadGitDiff({ repo: repoRef.current, work: 'main', baseline: 'main' });
    expect(files).toEqual([]);
  });

  it('throws a useful error if the baseline ref does not exist', async () => {
    await expect(
      loadGitDiff({ repo: repoRef.current, work: 'main', baseline: 'does-not-exist' }),
    ).rejects.toThrowError(/git diff/);
  });
});

describe('loadStagedDiff', () => {
  const repoRef = useEphemeralRepo();

  it('returns files currently in the index but not yet committed', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'one.txt'), 'staged content\n');
    await git(repo, 'add one.txt');
    const files = await loadStagedDiff({ repo });
    expect(files.length).toBe(1);
    expect(files[0]?.path).toBe('one.txt');
    expect(files[0]?.status).toBe('added');
    expect(files[0]?.content.trim()).toBe('staged content');
  });

  it('returns an empty list when nothing is staged', async () => {
    expect(await loadStagedDiff({ repo: repoRef.current })).toEqual([]);
  });

  it('handles staged deletions with empty content', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'gone.txt'), 'bye\n');
    await git(repo, 'add gone.txt');
    await git(repo, 'commit -m "add gone"');
    await git(repo, 'rm gone.txt');
    const files = await loadStagedDiff({ repo });
    expect(files[0]?.status).toBe('deleted');
    expect(files[0]?.content).toBe('');
  });

  it('handles nested paths', async () => {
    const repo = repoRef.current;
    await mkdir(path.join(repo, 'src', 'lib'), { recursive: true });
    await writeFile(path.join(repo, 'src', 'lib', 'a.ts'), 'export {};\n');
    await git(repo, 'add src/lib/a.ts');
    const files = await loadStagedDiff({ repo });
    expect(files[0]?.path).toBe('src/lib/a.ts');
  });
});

describe('loadStagedDiff — index is authoritative', () => {
  const repoRef = useEphemeralRepo();

  it('reads content from the INDEX, not the working tree', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'file.ts'), 'const staged = 1;\n');
    await git(repo, 'add file.ts');
    // Working-tree divergence after staging: a violation that exists
    // only on disk must not be verified, and a staged violation must
    // not be masked by a working-tree-only fix.
    await writeFile(path.join(repo, 'file.ts'), 'console.log("working tree only");\n');

    const files = await loadStagedDiff({ repo });
    expect(files[0]?.content).toBe('const staged = 1;\n');
  });

  it('reads correct content when invoked from a repo subdirectory', async () => {
    const repo = repoRef.current;
    await mkdir(path.join(repo, 'sub'), { recursive: true });
    await writeFile(path.join(repo, 'sub', 'inner.ts'), 'const inner = 1;\n');
    await git(repo, 'add sub/inner.ts');

    // Simulates `effective verify --staged` run from a subdirectory:
    // paths from `git diff --cached` are root-relative, and index reads
    // resolve them root-relative regardless of cwd.
    const files = await loadStagedDiff({ repo: path.join(repo, 'sub') });
    expect(files[0]?.path).toBe('sub/inner.ts');
    expect(files[0]?.content).toBe('const inner = 1;\n');
  });
});

describe('git diff parsing — hostile filenames', () => {
  const repoRef = useEphemeralRepo();

  it('reads content for filenames that git would C-quote (spaces, quotes, non-ASCII)', async () => {
    const repo = repoRef.current;
    await git(repo, 'checkout -b feature');
    const weird = "wé ird's file.ts";
    await writeFile(path.join(repo, weird), 'console.log("hide me");\n');
    await git(repo, `add "${weird}"`);
    await git(repo, 'commit -m "weird name"');

    const files = await loadGitDiff({ repo, work: 'feature', baseline: 'main' });
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe(weird);
    // Pre-fix behavior: the C-quoted path failed to read and the file
    // was silently verified as EMPTY content — a rule-evasion channel.
    expect(files[0]?.content).toBe('console.log("hide me");\n');
  });
});
