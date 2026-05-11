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
