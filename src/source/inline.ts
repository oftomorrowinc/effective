import { compilePatterns } from '../glob.js';
import type { ProtectedPath, ResolvedScope } from '../resolve.js';
import type { ExceptionRegistry } from '../schemas.js';
import type { ChangedFile, CustomCheck, ToolchainResult, VerifyContext } from './types.js';

/**
 * Inline source — the simplest VerifySource. Phase 1 supports only this; git
 * worktree + toolchain spawning live in phase 2.
 *
 * The caller supplies everything verify() needs as data:
 *   - changedFiles      : the diff, materialized in memory
 *   - toolchainResults  : output of lint/typecheck/test runs the caller did
 *   - artifacts         : structured artifacts (spec body, PR description, etc.)
 *   - customChecks      : function map referenced by CustomRule.checkRef
 *   - exceptionRegistry : the project's exception map (defineExceptions output)
 */
export interface InlineSource {
  readonly kind: 'inline';
  readonly changedFiles: readonly ChangedFile[];
  readonly toolchainResults?: Readonly<Record<string, ToolchainResult>>;
  readonly artifacts?: Readonly<Record<string, unknown>>;
  readonly customChecks?: Readonly<Record<string, CustomCheck>>;
  readonly exceptionRegistry?: ExceptionRegistry;
}

export function loadInlineSource(
  source: InlineSource,
  scope: ResolvedScope,
  protectedPaths: readonly ProtectedPath[] = [],
): VerifyContext {
  return {
    changedFiles: source.changedFiles,
    editableMatcher: compilePatterns(scope.editable),
    protectedPaths,
    scope,
    artifacts: source.artifacts ?? {},
    toolchainResults: source.toolchainResults ?? {},
    customChecks: source.customChecks ?? {},
    exceptionRegistry: source.exceptionRegistry ?? {},
  };
}
