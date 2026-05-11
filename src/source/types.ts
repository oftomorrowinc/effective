import type { PathMatcher } from '../glob.js';
import type { ResolvedScope } from '../resolve.js';
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

export interface VerifyContext {
  readonly changedFiles: readonly ChangedFile[];
  readonly editableMatcher: PathMatcher;
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
}
