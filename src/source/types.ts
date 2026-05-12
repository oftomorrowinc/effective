import type { PathMatcher } from '../glob.js';
import type { ProtectedPath, ResolvedScope } from '../resolve.js';
import type { CustomRule, ExceptionRegistry, Finding, MetaRule } from '../schemas.js';

export type ChangedFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ChangedFile {
  readonly path: string;
  readonly content: string;
  readonly status: ChangedFileStatus;
}

export interface ToolchainResult {
  readonly tool: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Findings already parsed by an upstream parser. */
  readonly findings?: readonly Finding[];
  /** Current count of findings/issues reported by the tool. */
  readonly count?: number;
  /** Baseline count for `count-increased` comparisons. */
  readonly baselineCount?: number;
}

/**
 * Check function shared by CustomRule and MetaRule. Both kinds receive
 * the rule + context and return findings; the SHAPE is identical even
 * though the SEMANTIC ROLE differs (custom checks read the diff; meta
 * checks read `ctx.agentReport`). One registry, two consumers.
 */
export type CustomCheck = (
  rule: CustomRule | MetaRule,
  ctx: VerifyContext,
) => Finding[] | Promise<Finding[]>;

/**
 * Commit-time metadata that some rules need beyond the diff itself —
 * commit message (for cited-decision rules), retry attempt number (for
 * retry-scope-expansion rules), authorship, raw SHA + date.
 *
 * Every field is optional. Rules that need a specific field check for
 * it explicitly and skip (or fall back) when absent.
 */
export interface CommitMetadata {
  /** Full commit message (subject + body), or just the subject if body unavailable. */
  readonly message?: string;
  /** Commit SHA. */
  readonly sha?: string;
  /** Author handle / name. */
  readonly author?: string;
  /** ISO date the commit was authored. */
  readonly date?: string;
  /**
   * Retry attempt number, when this verify call is part of a retry
   * loop. 1 = first attempt; N ≥ 2 = retry. Used by retry-scope-
   * expansion-into-architectural-config and related retry-aware rules.
   */
  readonly attempt?: number;
}

export interface VerifyContext {
  readonly changedFiles: readonly ChangedFile[];
  readonly editableMatcher: PathMatcher;
  /**
   * Resolved-merged protected paths from `Constitution.protected`. Each
   * entry has a glob `path` and a `rationale`. Rules that enforce
   * protected-path policy iterate this list and match each entry against
   * `file.path` individually (so the finding cites the specific
   * rationale that applied).
   */
  readonly protectedPaths: readonly ProtectedPath[];
  readonly scope: ResolvedScope;
  readonly artifacts: Readonly<Record<string, unknown>>;
  readonly toolchainResults: Readonly<Record<string, ToolchainResult>>;
  readonly customChecks: Readonly<Record<string, CustomCheck>>;
  readonly exceptionRegistry: ExceptionRegistry;
  /**
   * Optional worker self-report (build log, attempt log, verification
   * commands run). MetaRule checks consume this. When absent, MetaRule
   * checks silently skip — meta checks are opt-in to scopes that have
   * the report available.
   */
  readonly agentReport?: string;
  /**
   * Optional commit-time metadata. Rules that need it check for the
   * specific field they consume and fall back gracefully when absent.
   */
  readonly commitMetadata?: CommitMetadata;
  /**
   * Absolute path to the repository root, when the source is git-backed.
   * Rules that need to consult files outside the diff (cross-codebase
   * caller searches, full-codebase greps) read this; rules check for
   * its presence and skip when absent (e.g., inline source has no repo).
   */
  readonly repo?: string;
}
