import { rule } from '../../rules/factories.js';
import type { Rule } from '../../schemas.js';

/**
 * Governance-discipline rules — context-artifact monitoring,
 * constitution-version verification, files-scoped overrides, throw
 * propagation. These apply broadly; they're project-hygiene patterns
 * not bound to one role.
 */

const contextArtifactSizeMonitored: Rule = rule.custom({
  id: 'context-artifact-size-monitored',
  category: 'governance',
  defaultSeverity: 'HIGH',
  checkRef: 'contextArtifactSizeMonitored',
  catalogueEntry: 'context-artifact-grows-unbounded',
  relatedPrinciple: 'one-constitution-many-projections',
  prompt: {
    summary:
      'Context artifacts consumed by workers (tasks.md, decisions.md, shared prompts) are size-monitored and rotated.',
    guidance:
      "Context window size is not attention budget. A 1MB tasks.md file filled 95% with historical content runs every spawned worker on 5% of signal, regardless of the model's advertised window. The check looks for context artifacts whose byte-size / line-count grew above a threshold without a corresponding filter-at-consumer, archive-and-rotate, or filter-at-write countermeasure landing in the same diff. Project-specific thresholds are configured in the rule's overrides; defaults are conservative.",
  },
});

const constitutionVersionHashVerifiedAtBoot: Rule = rule.custom({
  id: 'constitution-version-hash-verified-at-boot',
  category: 'governance',
  defaultSeverity: 'HIGH',
  checkRef: 'constitutionVersionHashVerifiedAtBoot',
  catalogueEntry: 'versioned-context-drifts',
  relatedPrinciple: 'one-constitution-many-projections',
  prompt: {
    summary:
      'Every worker invocation verifies it loaded the expected constitution version at boot.',
    guidance:
      'When the constitution lives in a source-of-truth repo and consumers read via pointers (submodule, Docker image, cached fetch), updates can silently not-reach a consumer. The fix: every worker invocation hashes the constitution content it actually loaded and compares against an expected hash committed in the source-of-truth repo. Mismatch → worker refuses to proceed and emits a `constitution_version_drift_detected` signal. The check verifies the worker startup path includes the hash comparison; absence means a stale constitution can quietly govern a worker without anyone noticing.',
  },
});

const newThrowsCheckedAgainstCatcherChain: Rule = rule.custom({
  id: 'new-throws-checked-against-catcher-chain',
  category: 'governance',
  defaultSeverity: 'HIGH',
  checkRef: 'newThrowsCheckedAgainstCatcherChain',
  catalogueEntry: 'throw-swallowed-by-catch',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  prompt: {
    summary:
      'New `throw` statements are checked against the caller chain for unrelated catches that would silently swallow them.',
    guidance:
      "A `throw` in a function whose caller wraps it in `try { ... } catch (err) { /* no re-throw */ }` is silently intercepted. The throw exists in source but never reaches the layer designed to handle it. For every new `throw` in a diff, walk the caller chain to the nearest `try/catch` and confirm: (a) the catch is specifically typed to match the thrown error, OR (b) the catch explicitly re-throws / rethrows the new shape. A catch with `(err)` or `(err: unknown)` that doesn't re-throw is presumed to swallow.",
  },
});

const filesScopedRuleOverridesCiteDecision: Rule = rule.custom({
  id: 'files-scoped-rule-overrides-cite-decision',
  category: 'governance',
  defaultSeverity: 'CRITICAL',
  checkRef: 'filesScopedRuleOverridesCiteDecision',
  catalogueEntry: 'files-scoped-override-requires-cited-decision',
  relatedPrinciple: 'blockage-is-communication',
  prompt: {
    summary:
      'Files-scoped `rules: { "...": "off" }` blocks in `eslint.config.*` cite a substantive decision short_id.',
    guidance:
      'A per-file lint override is a tracked decision, not a local convenience. Every diff that adds or modifies a files-scoped `rules: {}` block in `eslint.config.*` must cite a decision short_id in the commit message or build log. The cited decision\'s body must name (a) the specific rule being allowlisted, (b) the scope (which files / patterns), (c) the rationale. A citation that points at a decision whose body is vague ("we needed this off for X") doesn\'t comply — the cited decision must be substantive. The check fetches the cited decision and matches against these three elements.',
    examples: {
      bad: "files: ['src/legacy/**'], rules: { 'no-console': 'off' }  // no citation",
      good:
        "files: ['src/legacy/**'], rules: { 'no-console': 'off' }\n" +
        "// commit: 'refactor: legacy/* sunset path -- core-D42: legacy-files-keep-console'",
    },
  },
});

export const governanceRules: readonly Rule[] = [
  contextArtifactSizeMonitored,
  constitutionVersionHashVerifiedAtBoot,
  newThrowsCheckedAgainstCatcherChain,
  filesScopedRuleOverridesCiteDecision,
];
