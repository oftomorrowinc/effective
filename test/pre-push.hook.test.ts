import { describe, expect, it } from 'vitest';

process.env.EFFECTIVE_PRE_PUSH_IMPORT = '1';
const { addsNoNewCommits, unpushedCommits, parseRefLines } = await import('../scripts/pre-push.js');

type GitRunner = (args: readonly string[]) => { status: number | null; stdout: string };

const failing: GitRunner = () => ({ status: 128, stdout: '' });

const ZERO = '0'.repeat(40);
const ON_REMOTE = 'a'.repeat(40);
const UNPUSHED = 'b'.repeat(40);

/** Stands in for git: UNPUSHED has one commit the remote lacks. */
const fakeGit: GitRunner = (args) => {
  const sha = args[1];
  if (sha === UNPUSHED) return { status: 0, stdout: `${UNPUSHED}\n` };
  return { status: 0, stdout: '' };
};

function line(local: string, localSha: string, remote: string, remoteSha = ZERO): string {
  return `${local} ${localSha} ${remote} ${remoteSha}`;
}

describe('pre-push gate predicate', () => {
  it('skips a real tag push whose commits are already on the remote', () => {
    const refs = [line('refs/tags/v1.0.0', ON_REMOTE, 'refs/tags/v1.0.0')];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(true);
  });

  it('GATES a branch ref pushed to a tag destination (the spoof)', () => {
    // `git push origin my-branch:refs/tags/v9.9.9` — the destination is a
    // tag, the content is unverified commits. Naming must not decide this.
    const refs = [line('refs/heads/feature', UNPUSHED, 'refs/tags/v9.9.9')];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(false);
  });

  it('GATES a fresh tag placed on a commit that was never pushed', () => {
    const refs = [line('refs/tags/v9.9.9', UNPUSHED, 'refs/tags/v9.9.9')];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(false);
  });

  it('GATES an ordinary branch push carrying new commits', () => {
    const refs = [line('refs/heads/feature', UNPUSHED, 'refs/heads/feature')];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(false);
  });

  it('GATES a mixed push even when one ref is a legitimate tag', () => {
    const refs = [
      line('refs/tags/v1.0.0', ON_REMOTE, 'refs/tags/v1.0.0'),
      line('refs/heads/feature', UNPUSHED, 'refs/heads/feature'),
    ];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(false);
  });

  it('skips a deletion, which pushes no commits at all', () => {
    const refs = [line('(delete)', ZERO, 'refs/tags/v9.9.9', ON_REMOTE)];
    expect(addsNoNewCommits(refs, fakeGit)).toBe(true);
  });

  it('GATES when stdin yielded no refs — unreadable is not the same as empty', () => {
    expect(addsNoNewCommits([], fakeGit)).toBe(false);
  });

  it('GATES when git itself fails — a broken query is not evidence of safety', () => {
    expect(unpushedCommits(ON_REMOTE, failing).length).toBeGreaterThan(0);
    expect(addsNoNewCommits([line('refs/tags/v1', ON_REMOTE, 'refs/tags/v1')], failing)).toBe(
      false,
    );
  });

  it('passes the sha as a REV, never after a `--` where git reads it as a pathspec', () => {
    // The pathspec form returns empty output and exit 0, which would make
    // every push look already-pushed. Pin the argument order.
    let seen: readonly string[] = [];
    const spy: GitRunner = (args) => {
      seen = args;
      return { status: 0, stdout: '' };
    };
    unpushedCommits(ON_REMOTE, spy);
    expect(seen).toEqual(['rev-list', ON_REMOTE, '--not', '--remotes']);
    expect(seen).not.toContain('--');
  });

  it('parses ref lines and ignores blank padding', () => {
    expect(parseRefLines(`\n  ${line('a', ON_REMOTE, 'b')}  \n\n`)).toHaveLength(1);
  });
});
