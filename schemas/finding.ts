import { z } from 'zod';

/**
 * Finding — the central interface of the package.
 *
 * Every rule emits Findings. `verify()` returns Findings. `kickBack()` consumes
 * Findings. The shape is uniform regardless of source: deterministic rule, toolchain
 * parser output (ESLint, TypeScript, Vitest, coverage), or future LLM-review-pass.
 *
 * Design decisions:
 *   - Severity is a four-level enum, not a numeric scale. Numeric scales invite
 *     fiddling ("is this an 8 or a 9?"); discrete levels force clear classification.
 *   - `CRITICAL` is the only severity that fails the verdict. Everything else is
 *     informational. This collapses "is this rule blocking?" to a single check.
 *   - `location` is optional because some findings have no specific file:line
 *     (e.g., "test count decreased" is a project-wide finding). But when location
 *     is known, file + line + endLine + column are all optional fields under it.
 *   - `evidence` is a short snippet (file content, log output, diff hunk) that
 *     justifies the finding. Required because findings without evidence are
 *     unfixable — the worker can't see what triggered the rule.
 *   - `message` is the human-readable explanation. Must include both *what* failed
 *     and *what would satisfy the rule*. The kickBack projection uses this directly.
 *   - `ruleId` resolves to a Rule in the active Constitution. Stable across versions
 *     within a major release (severity may change in minor; ID is stable until major).
 *   - `category` is derived from the rule and is denormalized onto the finding for
 *     ergonomic filtering ("show me all lane violations").
 *   - `source` distinguishes findings that came from Effective's own rules vs.
 *     toolchain parser output. Useful for filtering ("just show me the rules I added"
 *     vs. "show me everything including ESLint").
 */

export const Severity = z.enum(['CRITICAL', 'HIGH', 'MED', 'LOW']);
export type Severity = z.infer<typeof Severity>;

export const FindingLocation = z.object({
  /** Path relative to the worktree root. Forward-slash-separated regardless of OS. */
  file: z.string(),

  /** 1-indexed line number. Optional because some findings cover whole files. */
  line: z.number().int().positive().optional(),

  /** 1-indexed end line for multi-line findings. Defaults to `line` if absent. */
  endLine: z.number().int().positive().optional(),

  /** 1-indexed column. Rare; most findings are line-granular. */
  column: z.number().int().positive().optional(),
});
export type FindingLocation = z.infer<typeof FindingLocation>;

/**
 * Where the finding came from. Useful for filtering and for deciding whether
 * the user can act on it directly (e.g., "ESLint" findings are fixable by
 * editing the source; "verify-internal" findings might need a different fix path).
 */
export const FindingSource = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rule'),
    /** The rule that produced this finding. Same as Finding.ruleId. */
    ruleId: z.string(),
  }),
  z.object({
    kind: z.literal('toolchain'),
    /** Which toolchain command produced this finding. */
    tool: z.enum(['lint', 'typecheck', 'test', 'coverage', 'custom']),
    /** Tool-specific identifier (e.g., ESLint rule ID, TS error code). */
    nativeRuleId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('llm-review'),
    /** Rule the LLM was reviewing against. */
    ruleId: z.string(),
    /** Model identifier for traceability. */
    model: z.string().optional(),
  }),
]);
export type FindingSource = z.infer<typeof FindingSource>;

export const Finding = z.object({
  /**
   * Effective rule ID. Stable across minor versions; major-version bump if removed.
   * Example: 'no-disabled-tests-without-exception', 'lane.test-writer.forbidden-app-files'.
   */
  ruleId: z.string(),

  severity: Severity,

  /**
   * Denormalized from the rule. Lets findings be grouped without resolving the
   * rule object. Example categories: 'lane', 'tests', 'exceptions', 'scope',
   * 'toolchain', 'spec-discipline'.
   */
  category: z.string(),

  /** Optional — present when the finding has a specific file:line. */
  location: FindingLocation.optional(),

  /**
   * Evidence justifying the finding. May be a code snippet, a diff hunk, a log
   * excerpt, or an output line. Should be short enough to read at a glance but
   * specific enough to fix.
   */
  evidence: z.string(),

  /**
   * Human-readable message. MUST describe what failed AND what would satisfy
   * the rule. The kickBack projection reads this directly.
   *
   * Bad:  "skip not allowed"
   * Good: ".skip on a test without an exception ref. Add a tracked exception in
   *        the config's `exceptions` field and cite its ID in the comment, or fix the
   *        underlying test failure."
   */
  message: z.string(),

  source: FindingSource,
});
export type Finding = z.infer<typeof Finding>;

/**
 * The verdict from a verify() call. `pass` means no CRITICAL findings.
 * `needs-review` is reserved for cases where deterministic rules pass but
 * LLM-review-pass surfaced findings the user should consider — those don't
 * fail the build but warrant attention.
 */
export const Verdict = z.enum(['pass', 'fail', 'needs-review']);
export type Verdict = z.infer<typeof Verdict>;

export const VerifyResult = z.object({
  verdict: Verdict,
  findings: z.array(Finding),
  /**
   * Optional summary stats — counts per severity, counts per category, etc.
   * Computed from `findings`; included for ergonomic dashboard rendering.
   */
  summary: z
    .object({
      critical: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      med: z.number().int().nonnegative(),
      low: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
});
export type VerifyResult = z.infer<typeof VerifyResult>;
