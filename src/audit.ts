import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveConstitution, resolveScope } from './resolve.js';
import type { ResolveOptions } from './resolve.js';
import { checkRule } from './rules/check.js';
import { presets, builtInChecks } from './presets/index.js';
import { compilePatterns } from './glob.js';
import { walkSourceFiles } from './walk.js';
import { dedupeBySignature } from './verify.js';
import { summarizeFindings } from './verdict.js';
import { scanFilesForEscapeHatches } from './escape-hatches/scan.js';
import type { FindingSummary } from './verdict.js';
import type { ChangedFile, CustomCheck, ToolchainResult, VerifyContext } from './source/types.js';
import type {
  Constitution,
  ExceptionRegistry,
  Finding,
  Rule,
  Scope,
  SkippedRule,
} from './schemas.js';

export interface AuditInput {
  /** The project's constitution. */
  readonly config: Constitution;
  /** Absolute path to the repository root. */
  readonly repo: string;
  /** Resolve options; the built-in `recommended` preset is auto-wired. */
  readonly resolveOptions?: ResolveOptions;
  /** Custom check registry (merged with the built-ins). */
  readonly customChecks?: Readonly<Record<string, CustomCheck>>;
  /** Exception registry override (defaults to `config.exceptions ?? {}`). */
  readonly exceptions?: ExceptionRegistry;
  /** Structured artifacts (e.g., spec body keyed by path). */
  readonly artifacts?: Readonly<Record<string, unknown>>;
  /**
   * Whether to include toolchain rules in the audit. Default `false`:
   * toolchain checks shell out to lint/typecheck/test/coverage and are
   * better run via the user's existing scripts. Opt in when you want
   * a full baseline including toolchain state.
   */
  readonly includeToolchain?: boolean;
  /**
   * Optional filter: only run the rule with this id. Useful for
   * `effective audit --rule <id>` style invocations.
   */
  readonly onlyRuleId?: string;
}

/**
 * Backwards-compat alias for {@link SkippedRule}. The audit-specific
 * name predates verify gaining the same skip surface in rc.6; new
 * code should prefer the shared `SkippedRule` type from the public
 * schemas re-export, but this alias remains exported so existing
 * adopters' imports don't break.
 */
export type AuditSkipReason = SkippedRule;

export interface AuditResult {
  /** Findings produced by the audit pass. */
  readonly findings: readonly Finding[];
  /** Per-severity counts. */
  readonly summary: FindingSummary;
  /** Rules skipped, with reason. Reported so the user knows what didn't run. */
  readonly skipped: readonly SkippedRule[];
  /** Source files the audit walked (relative paths). */
  readonly filesScanned: readonly string[];
  /**
   * Total escape-hatch comments (`c8 ignore`, `@ts-expect-error`,
   * `eslint-disable`, `prettier-ignore`) found across the scanned
   * files — both those that cite a valid `exception-id` and those
   * that don't. Surfaced separately from findings so adopters can
   * track suppression growth over time as a project-health metric.
   */
  readonly escapeHatchCount: number;
  /**
   * Number of rules the project's config explicitly disabled via its
   * `disable` map. Counted from `config.disable` at the top level.
   */
  readonly disabledRulesCount: number;
}

async function readAsChangedFile(absolutePath: string, repo: string): Promise<ChangedFile> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- exception-id: intentional-source-tree-walker
  const content = await fs.readFile(absolutePath, 'utf8');
  return {
    path: path.relative(repo, absolutePath).replaceAll('\\', '/'),
    content,
    status: 'modified',
  };
}

function withBuiltInPresets(options: ResolveOptions): ResolveOptions {
  return {
    ...options,
    presetRegistry: {
      recommended: presets.recommended,
      ...options.presetRegistry,
    },
  };
}

function shouldSkip(rule: Rule, includeToolchain: boolean): SkippedRule['reason'] | undefined {
  if (rule.diffOnly === true) return 'diff-only';
  if (rule.kind === 'lane') return 'lane-no-scope';
  if (rule.kind === 'meta') return 'meta-no-report';
  if (rule.kind === 'toolchain' && !includeToolchain) return 'toolchain-not-included';
  return undefined;
}

/**
 * Audit the current state of a repository against the constitution.
 *
 * Unlike `verify()`, audit doesn't take a diff — it walks the repo
 * for source files and runs every applicable rule against the
 * current state. The intended use is establishing a baseline at
 * adoption time: "what's already in my codebase that the
 * constitution would flag?"
 *
 * Audit is informational. It produces findings + a summary but no
 * verdict — there is no PASS / FAIL semantic. Callers triage
 * findings into one of four buckets: fix the code, register an
 * exception, override the rule's severity, or disable the rule
 * with rationale.
 *
 * Rules skipped during audit (with reasons reported in `result.skipped`):
 * - `diffOnly: true` rules (their check requires a diff to be present)
 * - Lane rules (no scope, no editable lane to check against)
 * - Meta rules (no agent self-report to compare against)
 * - Toolchain rules (unless `includeToolchain: true`)
 */
export async function audit(input: AuditInput): Promise<AuditResult> {
  const resolved = resolveConstitution(
    input.config,
    withBuiltInPresets(input.resolveOptions ?? {}),
  );
  const auditScope: Scope = {
    goal: 'Audit current state for baseline',
    editable: ['**/*'],
    role: 'free-form',
  };
  const scope = resolveScope(auditScope, resolved);

  const absolutePaths = await walkSourceFiles(input.repo);
  const changedFiles: ChangedFile[] = [];
  for (const abs of absolutePaths) {
    try {
      changedFiles.push(await readAsChangedFile(abs, input.repo));
    } catch {
      // Skip unreadable files — race with deletion, permission, etc.
    }
  }

  const customChecks = { ...builtInChecks, ...input.customChecks };
  const exceptions = input.exceptions ?? input.config.exceptions ?? {};
  const artifacts = input.artifacts ?? {};
  const toolchainResults: Readonly<Record<string, ToolchainResult>> = {};

  const ctx: VerifyContext = {
    changedFiles,
    editableMatcher: compilePatterns(scope.editable),
    protectedPaths: resolved.protectedPaths,
    scope,
    artifacts,
    toolchainResults,
    customChecks,
    exceptionRegistry: exceptions,
    repo: input.repo,
  };

  const findings: Finding[] = [];
  const skipped: SkippedRule[] = [];

  for (const rule of resolved.rules.values()) {
    if (input.onlyRuleId !== undefined && rule.id !== input.onlyRuleId) continue;
    const skipReason = shouldSkip(rule, input.includeToolchain ?? false);
    if (skipReason !== undefined) {
      skipped.push({ ruleId: rule.id, reason: skipReason });
      continue;
    }
    const ruleFindings = await checkRule(rule, ctx);
    findings.push(...ruleFindings);
  }

  const deduped = dedupeBySignature(findings);
  const escapeHatchCount = scanFilesForEscapeHatches(changedFiles).length;
  const disabledRulesCount = Object.keys(input.config.disable ?? {}).length;
  return {
    findings: deduped,
    summary: summarizeFindings(deduped),
    skipped,
    filesScanned: changedFiles.map((f) => f.path),
    escapeHatchCount,
    disabledRulesCount,
  };
}
