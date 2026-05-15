import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions } from './resolve.js';
import { checkRule } from './rules/check.js';
import { ruleAppliesToRole } from './rules/selection.js';
import { loadInlineSource } from './source/inline.js';
import type { InlineSource } from './source/inline.js';
import { loadGitSource, loadStagedSource } from './source/git-source.js';
import { computeVerdict, summarizeFindings } from './verdict.js';
import { builtInChecks, presets } from './presets/index.js';
import { scanFilesForEscapeHatches } from './escape-hatches/scan.js';
import type {
  Constitution,
  ExceptionRegistry,
  Finding,
  RuleCategory,
  Scope,
  SkippedRule,
  VerifyResult,
} from './schemas.js';
import type { CommitMetadata, CustomCheck } from './source/types.js';

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
  /** Custom check functions referenced by CustomRule.checkRef and MetaRule.checkRef. */
  customChecks?: Readonly<Record<string, CustomCheck>>;
  /** Project's exception registry (defineExceptions() output). */
  exceptions?: ExceptionRegistry;
  /** Structured artifacts (e.g., spec body keyed by path). */
  artifacts?: Readonly<Record<string, unknown>>;
  /**
   * Optional worker self-report — typically the build log markdown.
   * MetaRule checks read this; when absent, meta rules silently skip.
   */
  agentReport?: string;
  /**
   * Optional commit-time metadata. For git sources, auto-populated
   * from `git log` against the work ref when this field is absent;
   * the caller's value (when present) wins. For inline sources, the
   * caller supplies whatever is available.
   */
  commitMetadata?: CommitMetadata;
  /**
   * Worktree-cleanup behavior for git sources.
   *
   * - `'on-pass'` (default): keep the worktree at `.effective/work` if
   *   the run produces any CRITICAL finding, remove it on pass. Lets
   *   the adopter `cd .effective/work` and rerun the failing toolchain
   *   command by hand to see what went wrong, without polluting a
   *   clean tree.
   * - `'always'`: keep the worktree regardless of verdict. Useful when
   *   iterating on the constitution itself or when chaining multiple
   *   inspections of the same run.
   * - `'never'`: always remove. Matches the previous behavior; appropriate
   *   for CI environments where the runner is ephemeral anyway.
   *
   * Inline and staged sources don't create a worktree; this option is
   * a no-op for them.
   */
  keepWorktree?: 'on-pass' | 'always' | 'never';
  /**
   * Skip the post-checkout `pnpm install` / `npm ci` / `yarn install`
   * step in `prepareWorktree`. Useful for fast iteration when the
   * worktree's `node_modules` is already populated from a previous
   * run (combine with `keepWorktree: 'always'`), or when you've
   * mounted node_modules some other way. Default: false (install runs).
   */
  skipInstall?: boolean;
  /**
   * Skip rules whose `category` field matches any value in this list.
   * Mirrors `audit`'s `--include-toolchain` opt-in but in reverse: by
   * default `verify` runs every rule that's applicable for the scope,
   * which forces inline-source callers to either spawn real toolchain
   * commands (slow, wrong-by-design at intermediate workflow steps) or
   * supply synthetic passing `toolchainResults`. `skipCategories:
   * ['toolchain']` lets a long-running runner do per-step gate checks
   * (lane, schema, meta, custom) at millisecond latency and defer
   * lint/typecheck/test/coverage to the PR-time CLI `verify --against`
   * pass.
   *
   * Skipped rules appear in `result.skipped` so callers can audit the
   * skip decision after the fact.
   */
  skipCategories?: readonly RuleCategory[];
  /**
   * Skip specific rules by id. Combined with `skipCategories` as a
   * union — a rule that matches either is skipped. Use this for
   * surgical opt-outs when category-level skipping would be too
   * broad.
   */
  skipRules?: readonly string[];
}

export function dedupeBySignature(findings: readonly Finding[]): Finding[] {
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
        resolved.protectedPaths,
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
        ...(input.skipInstall === true ? { skipInstall: true } : {}),
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

    if (input.agentReport !== undefined) {
      ctx = { ...ctx, agentReport: input.agentReport };
    }
    if (input.commitMetadata !== undefined) {
      // Caller-supplied wins; if the source loader populated commitMetadata
      // from `git log` for a git source, this either keeps that or replaces
      // it with the caller's explicit value.
      ctx = { ...ctx, commitMetadata: { ...ctx.commitMetadata, ...input.commitMetadata } };
    }

    const skipCategorySet = new Set<RuleCategory>(input.skipCategories ?? []);
    const skipRuleSet = new Set<string>(input.skipRules ?? []);
    const skipped: SkippedRule[] = [];
    const findings: Finding[] = [];
    for (const rule of resolved.rules.values()) {
      if (skipRuleSet.has(rule.id)) {
        skipped.push({ ruleId: rule.id, reason: 'rule-excluded' });
        continue;
      }
      if (skipCategorySet.has(rule.category)) {
        skipped.push({ ruleId: rule.id, reason: 'category-excluded' });
        continue;
      }
      if (!ruleAppliesToRole(rule, scope.role)) continue;
      const ruleFindings = await checkRule(rule, ctx);
      findings.push(...ruleFindings);
    }
    // On a passing run, fold in pre-parsed toolchain findings that no rule
    // explicitly consumed — they're still valuable signal. Skip when the
    // caller asked us not to run the toolchain category at all (otherwise
    // we'd surface findings from results the caller may not have supplied
    // by hand, e.g. when feeding empty toolchainResults to keep the engine
    // honest).
    if (!skipCategorySet.has('toolchain')) {
      for (const toolResult of Object.values(ctx.toolchainResults)) {
        for (const finding of toolResult.findings ?? []) {
          findings.push(finding);
        }
      }
    }

    const deduped = dedupeBySignature(findings);
    const escapeHatchCount = scanFilesForEscapeHatches(ctx.changedFiles).length;
    const disabledRulesCount = Object.keys(input.config.disable ?? {}).length;
    const verdict = computeVerdict(deduped);
    const result: VerifyResult = {
      verdict,
      findings: deduped,
      summary: summarizeFindings(deduped),
      escapeHatchCount,
      disabledRulesCount,
      ...(skipped.length > 0 ? { skipped } : {}),
    };
    // Decide cleanup policy after we know the verdict so 'on-pass' can
    // preserve the worktree when something failed and the adopter
    // needs to inspect.
    const policy = input.keepWorktree ?? 'on-pass';
    const shouldKeep = policy === 'always' || (policy === 'on-pass' && verdict !== 'pass');
    if (!shouldKeep) await cleanup();
    return result;
  } catch (error) {
    // Errors during the rule pass shouldn't leak the worktree either —
    // honor the same policy. Treat thrown errors as "not pass" so the
    // default 'on-pass' policy keeps the tree for inspection.
    const policy = input.keepWorktree ?? 'on-pass';
    if (policy === 'never') await cleanup();
    throw error;
  }
}
