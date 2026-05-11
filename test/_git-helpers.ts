import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { runCommand } from '../src/toolchain/run.js';

export async function git(cwd: string, args: string): Promise<void> {
  const result = await runCommand({ command: `git ${args}`, cwd });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args} failed: ${result.stderr}`);
  }
}

async function makeTestRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'effective-test-'));
  await git(dir, 'init -b main');
  await git(dir, 'config user.email test@example.com');
  await git(dir, 'config user.name Test');
  await git(dir, 'commit --allow-empty -m initial');
  return dir;
}

interface RepoRef {
  current: string;
}

/**
 * Register a fresh ephemeral git repo for every test in the enclosing
 * `describe` block. Returns a ref whose `.current` property updates per
 * test. Use inside a describe() so beforeEach/afterEach are scoped.
 */
export function useEphemeralRepo(): RepoRef {
  const ref: RepoRef = { current: '' };
  beforeEach(async () => {
    ref.current = await makeTestRepo();
  });
  afterEach(async () => {
    if (ref.current.length > 0) {
      await rm(ref.current, { recursive: true, force: true });
      ref.current = '';
    }
  });
  return ref;
}
