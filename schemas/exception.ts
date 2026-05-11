import { z } from 'zod';
import { KebabId } from './_id.js';

/**
 * Exception — a sanctioned carve-out from a strict invariant, with attached
 * justification and retirement condition.
 *
 * Every escape hatch comment in the codebase (c8 ignore, ts-expect-error,
 * eslint-disable, prettier-ignore) must cite a resolvable Exception ID. The
 * exceptionsMustCiteJustification rule validates each escape hatch against
 * the registry at verify time.
 *
 * Exceptions are NOT drift, NOT debt, NOT "we'll fix it later." They are
 * sanctioned, tracked, retire-able deviations from strict invariants. The
 * registry IS the value proposition — turning the fleet of unjustified
 * escape-hatch comments most codebases accumulate into a tracked, queryable,
 * audit-able list.
 */

/**
 * Built-in exception categories. These describe RECURRING shapes of
 * legitimate exception across TypeScript projects.
 *
 * Projects add specific exception INSTANCES that fall into these categories;
 * the categories themselves are portable.
 */
export const BuiltInExceptionCategory = z.enum([
  // CLI fatal-exit branches — `if (argv[1] === ...) main().then(rc => process.exit(rc))`
  // patterns that fire only when the file is invoked as a script. Coverage
  // tooling can't reach them under unit tests.
  'cli-fatal-exit',

  // Defensive narrowing against external library API drift. SDK declares
  // `arguments: object` but TS says optional; wrapper has `?? {}` for safety.
  // Branches are structurally unreachable under correct SDK behavior but
  // exist to fail loudly under contract drift.
  'external-library-drift-defense',

  // Type-narrowing of caller-pre-filtered impossibilities. TS flow analysis
  // can't see a non-null guarantee from a different function; the narrowing
  // branch (`if (foo === undefined) return;`) exists for the type system
  // but is structurally unreachable.
  'type-narrowing-of-impossible',

  // Race conditions in concurrent reads of mutable file system / debounce
  // windows. Defensive branches that catch partial-write states. Not
  // exercised by deterministic test fixtures.
  'race-condition-defense',

  // TTY-bound code paths — pretty-print / interactive paths that only run
  // when stdout is a TTY. Test runners run non-TTY; the branch is
  // structurally unreachable in tests.
  'tty-bound',

  // Zod-internal `_def` introspection. Zod's public types hide `_def`; some
  // schema-registry code needs to walk it via `as unknown as <internal>`
  // casts. Stable across Zod 3.x but not a public contract.
  'zod-internal-introspection',

  // Loose-generic-to-typed-shape bridges on canonical write boundaries.
  // gray-matter and similar libraries return loose record shapes; the
  // codebase's typed shapes are stricter. Cast bridges the two.
  'loose-generic-bridge',

  // Sequential-by-design await loops. `no-await-in-loop` would force
  // parallelization that breaks ordering invariants. Per-iteration side
  // effects feed the next iteration; sequential is correct.
  'sequential-by-design-await',

  // Typed-private dot-notation access. TS index signatures require bracket
  // notation; ESLint's dot-notation rule wants dots. Disable on the
  // legitimate bracket form.
  'typed-private-dot-notation',

  // Canonical underscore-prefixed discriminators. `_kind`, `_version`,
  // `_schema` mark canonical-frame metadata. `no-underscore-dangle` fires on
  // the leading underscore.
  'canonical-underscore-discriminator',

  // Mutually-recursive tree-walker forward references. Walker dispatch fn
  // calls each kind-walker; each kind-walker calls back into dispatch.
  // `no-use-before-define` fires on the forward reference; reordering
  // would inline the walkers and lose readability.
  'mutually-recursive-walker',

  // Early-exit `continue` in filter loops. `no-continue` fires; refactoring
  // to nested ifs deepens cyclomatic complexity. The continue enforces a
  // legitimate filter.
  'early-exit-continue',

  // Shadowed-binding mutation that prefer-destructuring would worsen.
  'mutated-binding-no-destructure',

  // Migration files using a bootstrap timestamp prefix instead of a real
  // UTC timestamp. Only the first/bootstrap migration; all subsequent ones
  // use real timestamps.
  'migration-bootstrap-timestamp',

  // Project-specific catch-all. Use when the exception doesn't fit a
  // built-in category. Should be rare; prefer extending the built-in list
  // upstream if a project hits the same shape repeatedly.
  'project-specific',
]);
export type BuiltInExceptionCategory = z.infer<typeof BuiltInExceptionCategory>;

/**
 * An exception category — either a built-in (string-typed) or a custom
 * project-specific category (any string).
 */
export const ExceptionCategory = z.union([BuiltInExceptionCategory, z.string()]);
export type ExceptionCategory = z.infer<typeof ExceptionCategory>;

/**
 * Status of an exception. Append-only registry: entries are deprecated or
 * retired, never deleted.
 */
export const ExceptionStatus = z.enum(['active', 'deprecated', 'retired']);
export type ExceptionStatus = z.infer<typeof ExceptionStatus>;

export const Exception = z.object({
  /** Unique ID within the registry. Format: lowercase, kebab-case. */
  id: KebabId,

  /** Which category of exception this is. */
  category: ExceptionCategory,

  /**
   * Why this exception exists. Required and non-empty. The justification is
   * what makes the exception sanctioned vs. an undocumented escape hatch.
   */
  context: z.string().min(1),

  /**
   * What condition would retire this exception. Required because exceptions
   * should be retire-able — they aren't permanent commitments. May be a
   * concrete event ("when we upgrade to pg@9") or a structural change
   * ("when our test harness can simulate TTY mode").
   */
  retirementCondition: z.string().min(1),

  /** ISO date when this exception was registered. */
  addedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),

  status: ExceptionStatus.default('active'),

  /**
   * Optional retirement note — when status is 'retired', the human-readable
   * explanation of how/when retirement happened.
   */
  retiredNote: z.string().optional(),

  /**
   * Optional issue/PR/discussion link that justified this exception's
   * creation. Same provenance idea as catalogue entries.
   */
  reference: z.string().url().optional(),
});
export type Exception = z.infer<typeof Exception>;

/**
 * Exception registry — a map of ID → Exception. Projects compose this from
 * `builtin.exceptions` plus their own additions in .effective/exceptions.ts.
 */
export const ExceptionRegistry = z.record(z.string(), Exception);
export type ExceptionRegistry = z.infer<typeof ExceptionRegistry>;

/**
 * Escape-hatch comment shape — what the verify pass extracts from source
 * code when scanning for `c8 ignore`, `ts-expect-error`, `eslint-disable`,
 * `prettier-ignore` comments.
 *
 * The format expected in source:
 *   /* c8 ignore next -- <exception-id>: <inline justification> *\/
 *   // @ts-expect-error -- <exception-id>: <inline justification>
 *   // eslint-disable-next-line <rule> -- <exception-id>: <inline justification>
 *   <!-- prettier-ignore -->
 *   <!-- <exception-id>: <inline justification> -->
 *
 * The parser extracts the exception-id and the inline justification text; the
 * exception-id must resolve to an entry in the active ExceptionRegistry.
 */
export const EscapeHatch = z.object({
  /** Where the hatch appears. */
  location: z.object({
    file: z.string(),
    line: z.number().int().positive(),
  }),

  /** Which escape mechanism. */
  kind: z.enum(['c8-ignore', 'ts-expect-error', 'eslint-disable', 'prettier-ignore']),

  /** Exception ID cited in the comment. May be undefined if missing. */
  exceptionId: z.string().optional(),

  /** Inline justification text from the comment. May be empty if missing. */
  inlineJustification: z.string().optional(),

  /** For eslint-disable: which rule(s) are disabled. */
  rules: z.array(z.string()).optional(),
});
export type EscapeHatch = z.infer<typeof EscapeHatch>;
