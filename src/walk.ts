import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Directories the source-file walker skips by default. Engine workspaces,
 * package-manager caches, build outputs, and version-control internals.
 * Callers can pass their own set via WalkOptions if a project's layout
 * needs broader or narrower exclusion.
 */
export const DEFAULT_IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.effective',
  '.next',
  '.turbo',
  '.cache',
  'out',
]);

/** Extensions the source-file walker matches. */
export const DEFAULT_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);

export interface WalkOptions {
  /**
   * Directories to skip (matched by basename anywhere in the tree).
   * Defaults to `DEFAULT_IGNORED_DIRS`.
   */
  readonly ignoredDirs?: ReadonlySet<string>;
  /**
   * File extensions to include (with leading dot). Defaults to
   * `DEFAULT_SOURCE_EXTENSIONS`.
   */
  readonly extensions?: ReadonlySet<string>;
}

/**
 * Recursively walk a directory tree and return absolute paths to every
 * source file (matching `extensions`, skipping `ignoredDirs`). Dot-files
 * and dot-directories are skipped wholesale.
 *
 * Returns absolute paths. The caller is responsible for relativizing
 * against the repo root if needed.
 */
export async function walkSourceFiles(root: string, options: WalkOptions = {}): Promise<string[]> {
  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const extensions = options.extensions ?? DEFAULT_SOURCE_EXTENSIONS;
  const out: string[] = [];
  async function go(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      // The walk root is caller-controlled (audit, escape-hatch scan,
      // new-exports caller check). Suppression scoped to this single
      // intentional dynamic read.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await go(abs);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        out.push(abs);
      }
    }
  }
  await go(root);
  return out;
}
