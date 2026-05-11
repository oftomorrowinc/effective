import { z } from 'zod';

/**
 * Scope — declares what a worker is supposed to do for a piece of work.
 *
 * Scope flows into both `prepare()` (so the worker reads it as part of the
 * augmented prompt) and `verify()` (so the verifier knows what counts as
 * success for THIS work, not just in general).
 *
 * The role-aware Expectations are the load-bearing part. Different roles have
 * different success criteria — a test-writer expects new tests to fail; a
 * code-writer expects them to pass. Without role-aware expectations, every
 * step would have to encode its own validation logic, and we'd be back to the
 * hand-coded per-step validation we're trying to replace.
 */

/**
 * Built-in roles. Each ships with sensible expectations defaults. Custom roles
 * are added in effective.config.ts (see config.ts schema).
 *
 * - `test-writer`  : authors failing tests for unimplemented behavior
 * - `code-writer`  : implements behavior to pass tests
 * - `reviewer`     : audits diff against constitution; read-only
 * - `free-form`    : no specific role; constitution applies in full
 */
export const BuiltInRole = z.enum(['test-writer', 'code-writer', 'reviewer', 'free-form']);
export type BuiltInRole = z.infer<typeof BuiltInRole>;

/**
 * Role can be a built-in or a string referencing a custom role defined in
 * effective.config.ts under `roles`.
 */
export const Role = z.union([BuiltInRole, z.string()]);
export type Role = z.infer<typeof Role>;

/**
 * Expectations — the success criteria for a piece of work.
 *
 * Every field is optional because different roles care about different
 * subsets. The verifier reads only the expectations that are set; absent
 * expectations mean "don't check this." This makes scope ergonomic to write
 * — you only declare what matters.
 *
 * Design note: these are boolean flags, not predicates. Predicates would give
 * more flexibility but invite the same fiddling problem as numeric severity
 * scales — "did the test FAIL right?" becomes a debate. Booleans force clear
 * yes/no semantics.
 */
export const Expectations = z.object({
  // -- Test discipline --
  /** New test cases appear in committed test files. */
  newTestsExist: z.boolean().optional(),
  /** New tests are expected to fail (test-writer role). */
  newTestsFail: z.boolean().optional(),
  /** Pre-existing tests still pass (code-writer, test-writer both want this). */
  existingTestsPass: z.boolean().optional(),
  /** All tests, including new ones, pass (code-writer role). */
  allTestsPass: z.boolean().optional(),

  // -- Quality gates --
  lintClean: z.boolean().optional(),
  typecheckClean: z.boolean().optional(),
  lintCleanForEditableFiles: z.boolean().optional(), // narrower than lintClean
  coverageNonDecreasing: z.boolean().optional(),
  noNewExceptionsWithoutJustification: z.boolean().optional(),

  // -- Architectural / process --
  noLaneViolations: z.boolean().optional(),
  noUntrackedScopeExpansion: z.boolean().optional(),
  noParallelSystemsAdded: z.boolean().optional(),

  // -- Spec discipline --
  specdTestNamesLandVerbatim: z.boolean().optional(),
  assertionsMatchSpec: z.boolean().optional(),
});
export type Expectations = z.infer<typeof Expectations>;

/**
 * Scope — the declaration of a piece of work.
 *
 * Required fields:
 *   - `goal`     : human-readable summary of what's being done
 *   - `editable` : glob list of files the worker may touch
 *
 * Optional fields:
 *   - `role`         : selects role-aware expectation defaults
 *   - `expectations` : explicit overrides on top of role defaults
 *   - `spec`         : reference to a spec document (for spec-conformance rules)
 *   - `deliverable`  : human-readable description of what "done" looks like
 *   - `relatedRules` : optional pinpointing of which rules apply here
 *
 * The `editable` list uses gitignore-style glob semantics with negation:
 *   ['app/**', 'lib/**', '!app/legacy/**']
 *   means: app and lib are editable, except app/legacy.
 */
export const Scope = z.object({
  /**
   * Human-readable goal. Flows into prepare()'s augmented prompt; also used
   * in finding messages for context.
   */
  goal: z.string(),

  /**
   * Glob list with gitignore-style negation. Lane rule enforces that no diff
   * touches files outside this list (or inside negated sub-globs).
   *
   * Empty array is allowed for read-only roles (reviewer) where the lane rule
   * effectively means "touch nothing." Most roles will have at least one entry.
   */
  editable: z.array(z.string()),

  /** Selects role-aware expectation defaults. Default: 'free-form'. */
  role: Role.default('free-form'),

  /**
   * Expectations override role defaults. If a key is set here, it wins over
   * the role's default for that key. Keys not set here fall through to the role.
   */
  expectations: Expectations.optional(),

  /**
   * Optional reference to a spec document (relative path from worktree root).
   * Required for spec-discipline rules to fire.
   */
  spec: z.string().optional(),

  /**
   * Optional human-readable description of what "done" looks like. Flows into
   * the augmented prompt's "deliverable" section.
   */
  deliverable: z.string().optional(),

  /**
   * Optional list of rule IDs explicitly relevant to this scope. If absent,
   * `prepare()` selects rules by category based on role + expectations.
   * Useful when a piece of work has unusual relevance to specific rules.
   */
  relatedRules: z.array(z.string()).optional(),
});
export type Scope = z.infer<typeof Scope>;

/**
 * Role defaults — what expectations a role gives you when you don't override.
 * Built-in role defaults; custom roles bring their own defaults via config.
 *
 * NOT a Zod schema — this is a value the engine uses to resolve effective
 * expectations. Listed here for clarity; lives in a separate file in actual
 * implementation.
 */
export const builtInRoleDefaults: Record<BuiltInRole, Expectations> = {
  'test-writer': {
    newTestsExist: true,
    newTestsFail: true,
    existingTestsPass: true,
    lintCleanForEditableFiles: true,
    typecheckClean: true,
    noLaneViolations: true,
    specdTestNamesLandVerbatim: true,
  },
  'code-writer': {
    allTestsPass: true,
    lintClean: true,
    typecheckClean: true,
    coverageNonDecreasing: true,
    noLaneViolations: true,
    noNewExceptionsWithoutJustification: true,
    noUntrackedScopeExpansion: true,
    noParallelSystemsAdded: true,
  },
  reviewer: {
    // Reviewers don't write; they only flag. Lane rule still applies (they
    // shouldn't touch anything), but no test/lint expectations because they
    // produce no code.
    noLaneViolations: true,
  },
  'free-form': {
    // No role-specific defaults; constitution applies in full per its own
    // rule definitions.
  },
};
