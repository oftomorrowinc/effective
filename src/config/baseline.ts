import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadConfigFromPath } from './load.js';
import { resolveConstitution } from '../resolve.js';
import type { ProtectedPath, ResolveOptions } from '../resolve.js';

/**
 * The constitution that judges a diff must be the one that existed
 * BEFORE the diff.
 *
 * `verify` resolves its config from the working tree, which is the WORK
 * side of the comparison — so a single commit could edit
 * `effective.config.ts` to `protected: []` and pass with zero findings,
 * having deleted the rule that would have caught it. The protections a
 * change is held to have to come from the baseline, or they are not
 * protections at all; a constitutional change takes effect for the NEXT
 * diff, after a reviewer has seen it.
 *
 * This module reads the baseline ref's copy of the config and resolves
 * it in isolation, so the caller can hold the diff to the union of
 * (what was protected before) and (what the diff protects now). Adding
 * protection is immediate; removing it is not.
 */

/** Outcome of trying to resolve the constitution as of the baseline ref. */
type BaselineConstitution =
  /** Baseline had a config; these are the protections it declared. */
  | { readonly kind: 'resolved'; readonly protectedPaths: readonly ProtectedPath[] }
  /**
   * Baseline had no config at that path — a first adoption, or the
   * config lives somewhere this run cannot see. There is nothing to
   * ratchet against, so the work-side config stands alone.
   */
  | { readonly kind: 'absent' }
  /**
   * Baseline HAD a config and it could not be read or resolved. This is
   * not the same as 'absent': something is there and we failed to
   * understand it, so the caller must fail closed rather than fall back
   * to the work side — falling back is precisely the bypass.
   */
  | { readonly kind: 'unreadable'; readonly reason: string };

/**
 * Read one path out of a git ref without checking it out.
 * Returns undefined when the ref has no such path.
 */
function showAtRef(repo: string, ref: string, relPath: string): string | undefined {
  const result = spawnSync('git', ['show', `${ref}:${relPath}`], {
    cwd: repo,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return undefined;
  return result.stdout;
}

/**
 * Resolve the constitution as of `baseline`.
 *
 * The baseline config is written into `.effective/` inside the repo
 * rather than a system temp dir, deliberately: config files import
 * `@oftomorrow/effective` and may import project-relative modules, and
 * both only resolve from inside the project. `.effective/` is
 * gitignored by `init` and unconditionally skipped by the walker.
 */
export async function resolveBaselineConstitution(input: {
  readonly repo: string;
  readonly baseline: string;
  /** Absolute path of the config the work side loaded. */
  readonly configPath: string;
  readonly resolveOptions: ResolveOptions;
}): Promise<BaselineConstitution> {
  const relPath = path.relative(input.repo, input.configPath);
  // A config outside the repo (an ancestor directory, or --config
  // pointing elsewhere) has no baseline revision to compare against.
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) return { kind: 'absent' };

  const source = showAtRef(input.repo, input.baseline, relPath);
  if (source === undefined) return { kind: 'absent' };

  const scratchDir = path.join(input.repo, '.effective', 'baseline');
  const scratchPath = path.join(scratchDir, `constitution${path.extname(input.configPath)}`);
  try {
    await mkdir(scratchDir, { recursive: true });
    await writeFile(scratchPath, source, 'utf8');
    const loaded = await loadConfigFromPath(scratchPath);
    const resolved = resolveConstitution(loaded.config, input.resolveOptions);
    return { kind: 'resolved', protectedPaths: resolved.protectedPaths };
  } catch (error) {
    return { kind: 'unreadable', reason: error instanceof Error ? error.message : String(error) };
  } finally {
    // Best-effort cleanup: a leftover scratch dir must never turn a
    // successful resolution into a failure.
    try {
      await rm(scratchDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Union of baseline and work protections, keyed by glob so an entry
 * present in both keeps ONE rationale — the baseline's, since that is
 * the text a reviewer agreed to.
 */
export function unionProtectedPaths(
  baseline: readonly ProtectedPath[],
  work: readonly ProtectedPath[],
): ProtectedPath[] {
  const merged = new Map<string, ProtectedPath>();
  for (const entry of work) merged.set(entry.path, entry);
  for (const entry of baseline) merged.set(entry.path, entry);
  return [...merged.values()];
}
