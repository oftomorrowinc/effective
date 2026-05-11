import { z } from 'zod';
import { Severity } from './finding.js';
import { KebabId } from './_id.js';

/**
 * Rule — the unit of constitutional content.
 *
 * Every rule has:
 *   - A stable ID
 *   - A category (for grouping/filtering)
 *   - A severity (which severity its findings will carry; configurable per project)
 *   - A prompt projection (the guidance the worker reads via `prepare`)
 *   - A check projection (the deterministic check `verify` runs against the diff)
 *
 * Rules are discriminated by `kind`. Each kind has its own check shape:
 *   - 'schema'   — Zod schema validation against a structured artifact
 *   - 'pattern'  — regex/glob check against source files
 *   - 'lane'     — file-boundary enforcement based on scope's editable paths
 *   - 'spec'     — test-name presence, assertion-shape, spec-conformance checks
 *   - 'toolchain'— wraps an external tool's output and translates it into findings
 *   - 'custom'   — escape hatch; arbitrary user-provided check function
 *
 * NOTE: This file defines the SCHEMAS (Zod values). The actual check execution
 * (the engine that runs a Rule against a diff) is separate and not part of v1
 * design — that's the implementation layer.
 */

/** Categories rules belong to. Stable string for filtering/grouping. */
export const RuleCategory = z.enum([
  'lane', // file-boundary enforcement
  'tests', // test discipline (no-skip, spec-name-presence, etc.)
  'exceptions', // escape-hatch-must-cite-justification family
  'scope', // task-scope conformance (claimed work matches done work)
  'toolchain', // wrapped output from external tools
  'spec-discipline', // spec-as-contract (T577 family)
  'data-discipline', // identity values, ULID, scope-wrapped writes
  'architecture', // backwards-compat creep, scaffold-without-wiring
  'verification', // unverified-as-success family
  'governance', // catalogue-meta rules (e.g., decision-ref-resolves)
  'custom', // user-defined
]);
export type RuleCategory = z.infer<typeof RuleCategory>;

/**
 * The prompt projection — how the rule appears in the augmented prompt
 * via `prepare()`. Should be readable as guidance, not as machine output.
 *
 * Conventions:
 *   - Address the worker directly ("Do not...", "When you...", "If you cannot...")
 *   - Name the failure mode in concrete terms
 *   - Say what alternative path is acceptable
 *   - Reference the rule ID for traceability
 */
export const PromptProjection = z.object({
  /** Short one-line summary for the rules-summary block. */
  summary: z.string(),
  /** Full prose for the relevant-rules section of the augmented prompt. */
  guidance: z.string(),
  /** Optional cite-able examples (good/bad patterns). */
  examples: z
    .object({
      bad: z.string().optional(),
      good: z.string().optional(),
    })
    .optional(),
});
export type PromptProjection = z.infer<typeof PromptProjection>;

/**
 * Base shape every rule shares. The discriminated union adds kind-specific
 * fields on top of this.
 */
const RuleBase = z.object({
  id: KebabId,
  category: RuleCategory,
  /** Default severity. Projects can override per-rule in their config. */
  defaultSeverity: Severity,
  /** Brief one-line description for catalogue display. */
  description: z.string(),
  /** Linked catalogue entry, if this rule corresponds to a documented failure class. */
  catalogueEntry: z.string().optional(),
  /** Linked principle, if this rule operationalizes one. */
  relatedPrinciple: z.string().optional(),
  /** How this rule appears in `prepare()` output. */
  prompt: PromptProjection,
});

// ---------------------------------------------------------------------------
// Rule kinds — each discriminated by `kind`
// ---------------------------------------------------------------------------

/**
 * Schema rule — validates a structured artifact against a Zod schema.
 * The "artifact" might be a spec markdown file with frontmatter, a PR description,
 * a task envelope, etc. — anything that has a typeable shape.
 *
 * The actual Zod schema is z.ZodTypeAny here because schemas can be any shape;
 * the discriminating field `kind: 'schema'` is what the engine reads.
 */
export const SchemaRule = RuleBase.extend({
  kind: z.literal('schema'),
  /** Which artifact this validates (e.g., 'spec.frontmatter', 'pr.description'). */
  appliesTo: z.string(),
  /**
   * The Zod schema the artifact must conform to. Stored as `z.unknown()` here
   * because TS can't carry the full schema type through z.object's parser;
   * the engine accesses it via the rule object directly, not via parse.
   */
  schema: z.unknown(),
});
export type SchemaRule = z.infer<typeof SchemaRule>;

/**
 * Pattern rule — regex/glob check against file contents.
 * Used for forbidden patterns ("no console.log in app/**", "no `as any` in src/**")
 * or required patterns ("every test file must import 'vitest'").
 */
export const PatternRule = RuleBase.extend({
  kind: z.literal('pattern'),
  /** The pattern to detect. Can be a regex or a literal string. */
  pattern: z.union([z.string(), z.instanceof(RegExp)]),
  /** True = pattern is forbidden; False = pattern is required. */
  forbidden: z.boolean(),
  /** Glob restricting which files this rule examines. */
  inGlob: z.string().default('**/*'),
  /** Optional anti-glob (don't examine these files even within `inGlob`). */
  notInGlob: z.string().optional(),
});
export type PatternRule = z.infer<typeof PatternRule>;

/**
 * Lane rule — file-boundary enforcement based on scope.editable.
 * Lane rules don't have a hard-coded path list; they read scope.editable at
 * verify time and check whether the diff touched any file outside it.
 * Exceptions can be carved out per-role via scope.role.
 */
export const LaneRule = RuleBase.extend({
  kind: z.literal('lane'),
  /**
   * If true, also flag deletions of files outside the editable lane.
   * Default true — see core-D11.4 cumulative-write semantics.
   */
  flagDeletions: z.boolean().default(true),
  /**
   * Optional list of paths always allowed regardless of scope.editable
   * (e.g., the step's own task directory in your build workflow).
   */
  alwaysAllow: z.array(z.string()).optional(),
});
export type LaneRule = z.infer<typeof LaneRule>;

/**
 * Spec rule — checks that named test cases declared in a spec actually appear
 * in committed test files, that assertions weren't narrowed below spec, etc.
 * Operates on the relationship between scope.spec (the declared spec) and the diff.
 */
export const SpecRule = RuleBase.extend({
  kind: z.literal('spec'),
  /** What aspect of spec conformance this rule checks. */
  check: z.enum([
    'test-names-land-verbatim', // spec'd it() names appear in test files
    'assertions-not-narrowed', // spec'd assertions match committed assertions
    'no-extra-tests-claiming-spec', // tests not in spec don't pretend to satisfy it
  ]),
});
export type SpecRule = z.infer<typeof SpecRule>;

/**
 * Toolchain rule — wraps an external tool. The rule runs the tool against
 * the worktree, parses its output, and emits findings in the unified shape.
 * The toolchain command + parser are configured in effective.config.ts; the
 * rule itself just declares "I represent the lint gate" or similar.
 *
 * For built-in tools (lint, typecheck, test, coverage), the engine resolves
 * the command from `config.toolchain[tool]`. For `tool: 'custom'`, the rule
 * MUST provide a `name` matching a key in `config.toolchain.custom`.
 */
export const ToolchainRule = RuleBase.extend({
  kind: z.literal('toolchain'),
  tool: z.enum(['lint', 'typecheck', 'test', 'coverage', 'custom']),
  /**
   * Required when tool is 'custom'. References a key in
   * config.toolchain.custom that supplies the actual command.
   */
  name: z.string().optional(),
  /** What outcome counts as failure for this rule. */
  failOn: z.enum([
    'any-output', // tool emitted any finding → rule fails
    'non-zero-exit', // tool exited non-zero → rule fails
    'count-increased', // findings count grew vs. baseline → rule fails
    'count-non-zero', // tool reports any finding → rule fails
  ]),
});
export type ToolchainRule = z.infer<typeof ToolchainRule>;

/**
 * Custom rule — escape hatch for project-specific checks the built-in kinds
 * don't cover. The check is a user-provided function in effective.config.ts.
 *
 * Stored in the schema as a string reference (the function name in config)
 * because Zod can't serialize/validate functions. The engine resolves the
 * reference against the config at verify time.
 */
export const CustomRule = RuleBase.extend({
  kind: z.literal('custom'),
  /** Reference to a function exported from effective.config.ts. */
  checkRef: z.string(),
});
export type CustomRule = z.infer<typeof CustomRule>;

export const Rule = z.discriminatedUnion('kind', [
  SchemaRule,
  PatternRule,
  LaneRule,
  SpecRule,
  ToolchainRule,
  CustomRule,
]);
export type Rule = z.infer<typeof Rule>;

/**
 * Helper for building rules ergonomically in user config. Each builder returns
 * a Rule object — `rule.noAny()`, `rule.forbidPattern(...)`, etc. would all
 * produce Rules conforming to the schema above.
 *
 * The builders are not in this file — they live alongside the engine. This
 * file is just the schema.
 */
