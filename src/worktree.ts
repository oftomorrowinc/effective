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
  /**
   * Skip the post-checkout `<package-manager> install` step. By default,
   * `prepareWorktree` detects the project's lockfile and runs the
   * matching frozen install (`pnpm install --frozen-lockfile`,
   * `npm ci`, `yarn install --immutable`) so per-package `node_modules`
   * directories exist for monorepo workspace projects — without that,
   * toolchain commands like `pnpm -r typecheck` fail with
   * `sh: tsc: command not found` because the workspace symlinks live
   * in per-package node_modules that aren't tracked by git. Set to
   * `true` if you've populated the worktree some other way (e.g. by
   * mounting a pre-installed `node_modules`).
   */
  skipInstall?: boolean;
}

interface InstallPlan {
  manager: 'pnpm' | 'npm' | 'yarn';
  command: string;
}

async function detectInstallPlan(repoRoot: string): Promise<InstallPlan | undefined> {
  if (await exists(path.join(repoRoot, 'pnpm-lock.yaml'))) {
    return { manager: 'pnpm', command: 'pnpm install --frozen-lockfile' };
  }
  if (await exists(path.join(repoRoot, 'yarn.lock'))) {
    return { manager: 'yarn', command: 'yarn install --immutable' };
  }
  if (await exists(path.join(repoRoot, 'package-lock.json'))) {
    return { manager: 'npm', command: 'npm ci' };
  }
  return undefined;
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
 * toolchain commands.
 *
 * Two paths depending on the project shape:
 *
 *   - **Project has a lockfile** (pnpm/npm/yarn): run the matching
 *     frozen install inside the worktree after checkout. This is the
 *     only way per-package `node_modules` directories (which workspace
 *     projects rely on for `tsc` / `vitest` / etc. invoked from inside
 *     a workspace package) end up in the worktree — they're not
 *     tracked by git, and a shared-root symlink can't fabricate them.
 *     Package-manager caches (pnpm's global store, npm's cache) make
 *     repeat installs fast (~1–3s) on warm machines.
 *
 *   - **No lockfile** (toy projects, demos): fall back to the original
 *     shared-symlink behavior. `<repo>/.effective/node_modules` is
 *     symlinked into the worktree so downstream tools see *some*
 *     node_modules, even if it's empty on first run.
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

  const plan = options.skipInstall === true ? undefined : await detectInstallPlan(worktreePath);
  if (plan === undefined) {
    await symlinkNodeModules(worktreePath, sharedNodeModulesPath);
  } else {
    const installResult = await runCommand({ command: plan.command, cwd: worktreePath });
    if (installResult.exitCode !== 0) {
      const tail = (installResult.stderr.trim() || installResult.stdout.trim())
        .split('\n')
        .slice(-15)
        .join('\n');
      throw new Error(
        `${plan.manager} install in worktree failed (exit ${String(installResult.exitCode)}):\n${tail}`,
      );
    }
  }

  return {
    path: worktreePath,
    cleanup: async (): Promise<void> => {
      await removeWorktree(options.repo, worktreePath);
    },
  };
}
