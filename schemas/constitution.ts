import { z } from 'zod';
import { Rule } from './rule.js';
import { Expectations } from './scope.js';
import { ExceptionRegistry } from './exception.js';
import { Severity } from './finding.js';

/**
 * Constitution — the top-level container that a project authors in
 * effective.config.ts.
 *
 * A Constitution composes:
 *   - Rules (the actual checks)
 *   - Role definitions (custom roles with their default expectations)
 *   - Toolchain config (how to run lint/typecheck/test/coverage)
 *   - Overrides (severity downgrades for gradual adoption)
 *   - Extensions (compose from presets)
 *
 * Multiple constitutions can be composed via `extends`. The resolution order is:
 *   1. Start with the leftmost preset in `extends`
 *   2. Merge each subsequent preset, with later wins
 *   3. Apply the current constitution's own rules, roles, toolchain
 *   4. Apply overrides last (so they win over everything)
 *   5. Apply disables last-last (so they win over overrides)
 */

/**
 * Toolchain config — tells Effective how to run external tools.
 *
 * Each entry is a shell command (string) OR a callback. The shell command form
 * is the default ergonomic path; the callback is the escape hatch for users
 * who want full control.
 *
 * The schema represents only the string form because Zod can't serialize
 * functions. The engine accepts both at the API layer.
 */
export const ToolchainConfig = z.object({
  lint: z.string().optional(),
  typecheck: z.string().optional(),
  test: z.string().optional(),
  coverage: z.string().optional(),
  /**
   * Custom tool entries beyond the built-in four. Each gets a name and a
   * command; rules of `kind: 'toolchain'` with `tool: 'custom'` reference
   * these by name.
   */
  custom: z.record(z.string(), z.string()).optional(),

  /**
   * Per-tool parser hint. If omitted, the engine auto-detects from the tool's
   * output format. Useful when the command is wrapping a non-standard tool.
   */
  parsers: z
    .object({
      lint: z.enum(['eslint', 'biome', 'oxlint', 'custom']).optional(),
      typecheck: z.enum(['tsc', 'custom']).optional(),
      test: z.enum(['vitest', 'jest', 'node-test', 'custom']).optional(),
      coverage: z.enum(['v8', 'istanbul', 'custom']).optional(),
    })
    .optional(),
});
export type ToolchainConfig = z.infer<typeof ToolchainConfig>;

/**
 * Per-rule override — used in `effective.config.ts` to downgrade a rule's
 * severity for gradual adoption.
 *
 * Note: this is distinct from `disable`. Disable turns the rule OFF entirely
 * (no findings emitted). Override keeps the rule active but changes its severity
 * (typically CRITICAL → HIGH/MED/LOW so the rule's findings appear but don't
 * fail the verdict).
 */
export const RuleOverride = z.object({
  severity: Severity,
  /**
   * Rationale REQUIRED. Same discipline as exception registrations: every
   * deviation from the standard must say why.
   */
  rationale: z.string().min(1, 'Override rationale required'),
});
export type RuleOverride = z.infer<typeof RuleOverride>;

/**
 * Custom role definition — declared in effective.config.ts to add project-specific
 * roles beyond the built-in four. Custom roles can also override the default
 * editable patterns associated with their role for ergonomic scope authoring.
 */
export const RoleDefinition = z.object({
  /**
   * Default editable globs for this role. Used if scope doesn't specify
   * `editable` explicitly. Optional — scope can always override.
   */
  defaultEditable: z.array(z.string()).optional(),
  /** Default expectations for this role. */
  expectations: Expectations,
});
export type RoleDefinition = z.infer<typeof RoleDefinition>;

/**
 * Constitution — the root config shape.
 *
 * Required: at least one of `rules` or `extends` must be present (otherwise
 * the constitution is empty). The schema validates this with .refine() below.
 */
export const Constitution = z
  .object({
    /**
     * Compose from presets. Each entry references a Constitution by import
     * (in the actual config) or by name (in serialized form). The schema
     * stores them as strings because Constitutions can't reference themselves
     * recursively at the type level without infinite expansion.
     */
    extends: z.array(z.string()).optional(),

    /** Project-specific rules. Merged with rules from `extends`. */
    rules: z.array(Rule).optional(),

    /**
     * Disable rules entirely by ID. Rationale required.
     * Format: { 'rule-id': 'reason this rule is disabled here' }
     */
    disable: z.record(z.string(), z.string()).optional(),

    /**
     * Override rule severities. Use for gradual adoption — downgrade CRITICAL
     * to HIGH/MED/LOW so findings appear but don't fail the verdict.
     */
    override: z.record(z.string(), RuleOverride).optional(),

    /**
     * Define custom roles. Keys are role names (used in scope.role).
     */
    roles: z.record(z.string(), RoleDefinition).optional(),

    toolchain: ToolchainConfig.optional(),

    /**
     * Exception registry — built-in templates spread with project-specific
     * instances. Lives inline on the Constitution so the full picture
     * (rules, overrides, exceptions, roles) is reviewable in a single
     * file. `defineExceptions()` is still exported for users who want to
     * factor the registry into a separate file and spread it back in here.
     */
    exceptions: ExceptionRegistry.optional(),

    /**
     * Optional metadata. Lets a project tag its constitution with versioning,
     * authorship, etc. Surfaced in findings as additional context.
     */
    meta: z
      .object({
        name: z.string().optional(),
        version: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
  })
  .refine((c) => (c.rules?.length ?? 0) > 0 || (c.extends?.length ?? 0) > 0, {
    message: 'Constitution must define rules or extend at least one preset',
  });

export type Constitution = z.infer<typeof Constitution>;
