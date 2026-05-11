import { rule } from '../../rules/factories.js';
import type { Rule } from '../../schemas.js';

/**
 * Architecture-discipline rules — the cluster targeting parallel
 * systems, scaffold-without-wiring, wrapper-over-primitive, and
 * canonical-validation-bypass. These are primarily code-writer
 * concerns; test-only and reviewer-only scopes don't author the
 * shapes being detected.
 */

const ARCHITECT_ROLES = ['code-writer', 'free-form'];

const noParallelSystemsWithoutMigration: Rule = rule.custom({
  id: 'no-parallel-systems-without-migration',
  category: 'architecture',
  defaultSeverity: 'CRITICAL',
  checkRef: 'noParallelSystemsWithoutMigration',
  catalogueEntry: 'backwards-compat-creep',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: ARCHITECT_ROLES,
  prompt: {
    summary: 'A new shape that replaces an existing one ships with the old removed, not alongside.',
    guidance:
      'When a task introduces a new shape/API/contract to replace an existing one, the old path comes out — code + DB attributes + docs + tests — in the same task or in a chained follow-up declared as an explicit dependency. Shipping the new alongside the old leaves a parallel structure that subsequent tasks inherit as "the current state" and optimize against locally, reinforcing the dual-system reality. The check scans diffs for both-paths-exist patterns: new field alongside old field, new function alongside old function called from legacy sites.',
    examples: {
      bad: 'Diff adds `input_schemas` on entities but leaves `input_schema_id` populated and read by legacy code.',
      good: 'Diff adds `input_schemas` AND removes `input_schema_id` reads/writes, OR files a follow-up migration task as an explicit dependency with a date bound.',
    },
  },
});

const retirementTaskDeclaredAsDependency: Rule = rule.custom({
  id: 'retirement-task-declared-as-dependency',
  category: 'architecture',
  defaultSeverity: 'HIGH',
  checkRef: 'retirementTaskDeclaredAsDependency',
  catalogueEntry: 'backwards-compat-creep',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: ARCHITECT_ROLES,
  prompt: {
    summary:
      'If a parallel-systems landing is sanctioned during migration, a dated retirement task is declared as an explicit dependency.',
    guidance:
      'Some replacements are too large for a single task. When that\'s the case, the parallel-systems landing is acceptable IF the diff also files (or references) a retirement task with: (a) a concrete scope describing what the old path looks like when fully removed, (b) an `etmpl_depends_on` edge on the introducing task, (c) a date bound. Without those three, the "migration" never lands. The check looks at the diff\'s task metadata for a referenced retirement task and rejects if absent.',
  },
});

const canonicalValidationNotBypassed: Rule = rule.custom({
  id: 'canonical-validation-not-bypassed',
  category: 'architecture',
  defaultSeverity: 'CRITICAL',
  checkRef: 'canonicalValidationNotBypassed',
  catalogueEntry: 'schema-bypass-via-exception-carve-out',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: ARCHITECT_ROLES,
  prompt: {
    summary:
      "Every submit boundary routes through the canonical validation layer; UI overrides don't bypass validation.",
    guidance:
      "A `ui_component` override is a rendering override, not a validation bypass. Every submit, regardless of UI source, routes through the canonical submit endpoint and gets validated against `output_schemas` at that boundary. \"The schema is too strict for our UI\" is not a bypass — it's a signal to amend the schema via migration or decision. Internal validation in the custom form is additive, not substitutive. The check verifies every HITL form's submit payload shape matches its step's declared `output_schemas` array.",
  },
});

const newExportsHaveNonTestCallers: Rule = rule.custom({
  id: 'new-exports-have-non-test-callers',
  category: 'architecture',
  defaultSeverity: 'HIGH',
  checkRef: 'newExportsHaveNonTestCallers',
  catalogueEntry: 'scaffold-without-runtime-wiring',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: ARCHITECT_ROLES,
  prompt: {
    summary: 'New exports are called from at least one non-test runtime path.',
    guidance:
      '"Complete" for a scaffolding task means: the new code path is called from a real runtime context AND tested end-to-end through that call. Adding a utility module without a real caller is not done. Adding an entity template without an entity that uses it is not done. The check greps the codebase for every new `export` in the diff and confirms at least one non-test caller exists. Test-only callers don\'t count — scaffolding tested in isolation drifts away from the real integration surface because it was designed without runtime pressure.',
  },
});

const noWrapperOverFirstClassPrimitive: Rule = rule.custom({
  id: 'no-wrapper-over-first-class-primitive',
  category: 'architecture',
  defaultSeverity: 'HIGH',
  checkRef: 'noWrapperOverFirstClassPrimitive',
  catalogueEntry: 'wrapper-over-first-class-primitive',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  appliesToRoles: ARCHITECT_ROLES,
  prompt: {
    summary: 'New wrappers name a concrete behavior they add beyond the primitive they wrap.',
    guidance:
      'Wrappers that mostly just delegate to existing first-class functionality balloon the API surface and obscure where behavior actually lives. For every new wrapper, the rationale must name a specific behavior the wrapper adds — "adds retry with backoff," "normalizes error shapes across two SDKs," "enforces business-id scoping at the call boundary." Vague rationales — "abstraction," "cleaner interface," "future-proofing," "consistency" — are flagged. If the rationale is vague, prefer calling the primitive directly.',
    examples: {
      bad: 'function withRetry(fn) { return fn(); } // "future-proofing"',
      good: 'function withRetry(fn, opts) { /* exponential backoff, jitter, max-attempts; adds real behavior */ }',
    },
  },
});

export const architectureRules: readonly Rule[] = [
  noParallelSystemsWithoutMigration,
  retirementTaskDeclaredAsDependency,
  canonicalValidationNotBypassed,
  newExportsHaveNonTestCallers,
  noWrapperOverFirstClassPrimitive,
];
