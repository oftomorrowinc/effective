import { describe, expect, it } from 'vitest';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCommitMetadata } from '../src/source/git.js';
import { verify } from '../src/verify.js';
import { git, useEphemeralRepo } from './_git-helpers.js';
import { changed, patternRule, scope } from './_helpers.js';

describe('loadCommitMetadata', () => {
  const repoRef = useEphemeralRepo();

  it('reads subject, sha, author, and date from the given ref', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'a.ts'), 'export {};\n');
    await git(repo, 'add a.ts');
    await git(repo, 'commit -m "feat: add a"');
    const meta = await loadCommitMetadata(repo, 'HEAD');
    expect(meta?.message).toBe('feat: add a');
    expect(meta?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(meta?.author).toBe('Test');
    expect(meta?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns undefined for a ref that does not exist', async () => {
    const meta = await loadCommitMetadata(repoRef.current, 'definitely-not-a-ref');
    expect(meta).toBeUndefined();
  });

  it('omits the message key for a commit with an empty message', async () => {
    const repo = repoRef.current;
    await git(repo, 'commit --allow-empty --allow-empty-message -m ""');
    const meta = await loadCommitMetadata(repo, 'HEAD');
    expect(meta).toBeDefined();
    expect(meta?.message).toBeUndefined();
    expect(meta?.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('handles a multi-word commit subject', async () => {
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'a.ts'), 'export {};\n');
    await git(repo, 'add a.ts');
    await git(repo, 'commit -m "fix(api): handle the empty case correctly"');
    const meta = await loadCommitMetadata(repo, 'HEAD');
    expect(meta?.message).toBe('fix(api): handle the empty case correctly');
  });
});

describe('verify() — inline commitMetadata threading', () => {
  it('forwards caller-supplied commitMetadata into the context', async () => {
    let seenMeta: unknown;
    await verify({
      scope: scope('free-form'),
      config: {
        rules: [
          {
            ...patternRule('inspector'),
            kind: 'custom',
            checkRef: 'capture',
          },
        ],
      } as never,
      source: { kind: 'inline', changedFiles: [changed('a.ts', 'x')] },
      commitMetadata: { sha: 'abc123', message: 'feat: x', attempt: 2 },
      customChecks: {
        capture: (_rule, c) => {
          seenMeta = c.commitMetadata;
          return [];
        },
      },
    });
    expect(seenMeta).toEqual({ sha: 'abc123', message: 'feat: x', attempt: 2 });
  });
});

describe('verify() — git source commitMetadata', () => {
  const repoRef = useEphemeralRepo();

  it('auto-populates commitMetadata for git sources from `git log -1`', async () => {
    let captured: unknown;
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'a.ts'), 'export const x = 1;\n');
    await git(repo, 'add a.ts');
    await git(repo, 'commit -m "feat: baseline"');
    await git(repo, 'checkout -b feature');
    await writeFile(path.join(repo, 'b.ts'), 'export const y = 2;\n');
    await git(repo, 'add b.ts');
    await git(repo, 'commit -m "feat: add y"');

    await verify({
      scope: scope('free-form'),
      config: {
        rules: [
          {
            ...patternRule('capture'),
            kind: 'custom',
            checkRef: 'cap',
          },
        ],
      } as never,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
      customChecks: {
        cap: (_rule, c) => {
          captured = c.commitMetadata;
          return [];
        },
      },
    });
    const meta = captured as { message?: string; sha?: string } | undefined;
    expect(meta?.message).toBe('feat: add y');
    expect(meta?.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('caller-supplied commitMetadata fields win over git-derived ones', async () => {
    let captured: unknown;
    const repo = repoRef.current;
    await writeFile(path.join(repo, 'a.ts'), 'x');
    await git(repo, 'add a.ts');
    await git(repo, 'commit -m "feat: real"');
    await git(repo, 'checkout -b feature');
    await writeFile(path.join(repo, 'b.ts'), 'y');
    await git(repo, 'add b.ts');
    await git(repo, 'commit -m "feat: real-feature"');

    await verify({
      scope: scope('free-form'),
      config: {
        rules: [{ ...patternRule('c'), kind: 'custom', checkRef: 'cap' }],
      } as never,
      source: { kind: 'git', repo, work: 'feature', baseline: 'main' },
      commitMetadata: { attempt: 3 }, // caller sets attempt; sha/message come from git
      customChecks: {
        cap: (_rule, c) => {
          captured = c.commitMetadata;
          return [];
        },
      },
    });
    const meta = captured as { attempt?: number; message?: string; sha?: string } | undefined;
    expect(meta?.attempt).toBe(3); // from caller
    expect(meta?.message).toBe('feat: real-feature'); // from git
    expect(meta?.sha).toBeDefined();
  });
});
