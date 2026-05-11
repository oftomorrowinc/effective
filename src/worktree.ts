import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runCommand } from './toolchain/run.js';

export interface WorktreeOptions {
  /** Absolute path to the source git repo (containing .git). */
  repo: string;
  /** Branch/ref to materialize in the worktree. */
  work: string;
  /** Directory to host the worktree. Defaults to `<repo>/.effective/work`. */
  worktreePath?: string;
  /** Directory to persist node_modules between runs. Defaults to `<repo>/.effective/node_modules`. */
  sharedNodeModulesPath?: string;
}

export interface WorktreeHandle {
  readonly path: string;
  /** Remove the worktree (use after a clean verify run). */
  cleanup(): Promise<void>;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function removeWorktree(repo: string, worktreePath: string): Promise<void> {
  if (!(await exists(worktreePath))) return;
  // `git worktree remove --force` cleans the registered worktree state and the directory.
  await runCommand({ command: `git worktree remove --force ${quote(worktreePath)}`, cwd: repo });
  if (await exists(worktreePath)) {
    await fs.rm(worktreePath, { recursive: true, force: true });
  }
}

function quote(p: string): string {
  if (/^[A-Za-z0-9_./@:^~-]+$/.test(p)) return p;
  return `'${p.replaceAll("'", String.raw`'\''`)}'`;
}

async function symlinkNodeModules(worktreePath: string, sharedPath: string): Promise<void> {
  if (!(await exists(sharedPath))) {
    await fs.mkdir(sharedPath, { recursive: true });
  }
  const link = path.join(worktreePath, 'node_modules');
  if (await exists(link)) {
    const stat = await fs.lstat(link);
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(link);
      if (path.resolve(worktreePath, target) === path.resolve(sharedPath)) return;
      await fs.unlink(link);
    } else {
      await fs.rm(link, { recursive: true, force: true });
    }
  }
  await fs.symlink(path.resolve(sharedPath), link, 'dir');
}

/**
 * Create (or rebuild) the isolated worktree where `verify()` will run
 * toolchain commands. Reuses a persisted `node_modules` directory via a
 * symlink so subsequent runs don't reinstall.
 */
export async function prepareWorktree(options: WorktreeOptions): Promise<WorktreeHandle> {
  const worktreePath = options.worktreePath ?? path.join(options.repo, '.effective', 'work');
  const sharedNodeModulesPath =
    options.sharedNodeModulesPath ?? path.join(options.repo, '.effective', 'node_modules');

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });
  await removeWorktree(options.repo, worktreePath);

  // `--detach` lets us materialize a branch that's also the main repo's
  // current HEAD. Without it, `git worktree add` refuses with "branch is
  // already used by worktree at ..." for the most common case where the
  // user is verifying the branch they're currently on.
  const result = await runCommand({
    command: `git worktree add --detach ${quote(worktreePath)} ${quote(options.work)}`,
    cwd: options.repo,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git worktree add failed (exit ${String(result.exitCode)}): ${result.stderr.trim()}`,
    );
  }
  await symlinkNodeModules(worktreePath, sharedNodeModulesPath);

  return {
    path: worktreePath,
    cleanup: async (): Promise<void> => {
      await removeWorktree(options.repo, worktreePath);
    },
  };
}
