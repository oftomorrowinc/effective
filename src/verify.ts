import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions } from './resolve.js';
import { checkRule } from './rules/check.js';
import { ruleAppliesToRole } from './rules/selection.js';
import { loadInlineSource } from './source/inline.js';
import type { InlineSource } from './source/inline.js';
import { loadGitSource, loadStagedSource } from './source/git-source.js';
import { computeVerdict, summarizeFindings } from './verdict.js';
import { builtInChecks, presets } from './presets/index.js';
import type { Constitution, ExceptionRegistry, Finding, Scope, VerifyResult } from './schemas.js';
import type { CustomCheck } from './source/types.js';

function withBuiltInPresets(options: ResolveOptions): ResolveOptions {
  return {
    ...options,
    presetRegistry: {
      recommended: presets.recommended,
      ...options.presetRegistry,
    },
  };
}

/**
 * Git-backed source. `verify()` creates an isolated worktree at
 * `.effective/work` pointed at `work`, runs the configured toolchain
 * commands there, parses their output, then runs every rule against
 * the diff (work vs baseline).
 */
export interface GitSource {
  readonly kind: 'git';
  readonly repo: string;
  readonly work: string;
  readonly baseline: string;
}

/**
 * Staged-changes source. Powers `effective verify --staged`. Toolchain
 * commands run in the repo working tree (not in a worktree). Use only
 * for pre-commit verification where the index is the authoritative diff.
 */
export interface StagedSource {
  readonly kind: 'staged';
  readonly repo: string;
}

export type VerifySource = InlineSource | GitSource | StagedSource;

export interface VerifyInput {
  scope: Scope;
  config: Constitution;
  source: VerifySource;
  resolveOptions?: ResolveOptions;
  /** Custom check functions referenced by CustomRule.checkRef. */
  customChecks?: Readonly<Record<string, CustomCheck>>;
  /** Project's exception registry (defineExceptions() output). */
  exceptions?: ExceptionRegistry;
  /** Structured artifacts (e.g., spec body keyed by path). */
  artifacts?: Readonly<Record<string, unknown>>;
}

function dedupeBySignature(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const loc = finding.location;
    const key = [
      finding.ruleId,
      finding.severity,
      loc?.file ?? '',
      loc?.line ?? '',
      loc?.column ?? '',
      finding.evidence,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export async function verify(input: VerifyInput): Promise<VerifyResult> {
  const resolved = resolveConstitution(
    input.config,
    withBuiltInPresets(input.resolveOptions ?? {}),
  );
  const scope = resolveScope(input.scope, resolved);
  const customChecks = { ...builtInChecks, ...input.customChecks };
  const artifacts = input.artifacts ?? {};
  const exceptions = input.exceptions ?? {};

  let cleanup: () => Promise<void> = () => Promise.resolve();
  let ctx;
  try {
    if (input.source.kind === 'inline') {
      ctx = loadInlineSource(
        {
          ...input.source,
          customChecks: { ...customChecks, ...input.source.customChecks },
          artifacts: { ...artifacts, ...input.source.artifacts },
          exceptionRegistry: input.source.exceptionRegistry ?? exceptions,
        },
        scope,
      );
    } else if (input.source.kind === 'git') {
      const loaded = await loadGitSource({
        repo: input.source.repo,
        work: input.source.work,
        baseline: input.source.baseline,
        resolved,
        scope,
        customChecks,
        artifacts,
        exceptions,
      });
      ctx = loaded.ctx;
      cleanup = loaded.cleanup;
    } else {
      const loaded = await loadStagedSource({
        repo: input.source.repo,
        resolved,
        scope,
        customChecks,
        artifacts,
        exceptions,
      });
      ctx = loaded.ctx;
      cleanup = loaded.cleanup;
    }

    const findings: Finding[] = [];
    for (const rule of resolved.rules.values()) {
      if (!ruleAppliesToRole(rule, scope.role)) continue;
      const ruleFindings = await checkRule(rule, ctx);
      findings.push(...ruleFindings);
    }
    // On a passing run, fold in pre-parsed toolchain findings that no rule
    // explicitly consumed — they're still valuable signal.
    for (const toolResult of Object.values(ctx.toolchainResults)) {
      for (const finding of toolResult.findings ?? []) {
        findings.push(finding);
      }
    }

    const deduped = dedupeBySignature(findings);
    return {
      verdict: computeVerdict(deduped),
      findings: deduped,
      summary: summarizeFindings(deduped),
    };
  } finally {
    await cleanup();
  }
}
