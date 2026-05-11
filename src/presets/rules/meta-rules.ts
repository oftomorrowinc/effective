import type { MetaRule, Rule } from '../../schemas.js';

/**
 * Meta-rules — self-report checks that consume the worker's build log
 * (`ctx.agentReport`) rather than the diff. When no report is supplied
 * to verify(), these rules silently skip.
 *
 * The seven entries below cover the meta-shaped catalogue rules:
 *   - 3 sub-signatures of unverified-work-accepted-as-verified
 *   - exit-bar-claims-mechanically-verified (cross-check)
 *   - retry-scope-expansion (denylist enforcement on retry attempts)
 *   - primed-shell-verification (env-isolation requirement)
 *   - sketch-contradiction-self-correction (POSITIVE SIGNAL)
 *
 * Each is registered as a MetaRule via `kind: 'meta'`. The check
 * functions live in `presets/rules/stubs.ts` alongside the catalogue-
 * rule stubs; both kinds share the customChecks registry per the
 * design in `source/types.ts`.
 */

const metaRule = (
  input: Omit<MetaRule, 'kind' | 'description'> & { description?: string },
): Rule => ({
  kind: 'meta',
  description: input.description ?? input.prompt.summary,
  ...input,
});

const exitBarClaimsMechanicallyVerified: Rule = metaRule({
  id: 'exit-bar-claims-mechanically-verified',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  checkRef: 'exitBarClaimsMechanicallyVerified',
  catalogueEntry: 'unverified-work-accepted-as-verified',
  relatedPrinciple: 'unverified-work-is-failed',
  prompt: {
    summary:
      'Every load-bearing exit-bar claim in the build log was actually exercised end-to-end.',
    guidance:
      "The post-build gate reads the task's declared exit-bar items and mechanically verifies each one before promoting the task to Success. Items the gate can't verify override Success → Failed. The check parses `## Exit bar` (or equivalent) from the task body, finds the corresponding verification commands in the build log, and confirms each ran and passed against the actual commit state.",
  },
});

const transparentUnverificationBlocks: Rule = metaRule({
  id: 'transparent-unverification-blocks',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  checkRef: 'transparentUnverificationBlocks',
  catalogueEntry: 'unverified-work-accepted-as-verified',
  relatedPrinciple: 'unverified-work-is-failed',
  prompt: {
    summary: 'A transparent-unverification log paired with `Result: Success` is BLOCKER, not LOW.',
    guidance:
      'When the build log contains phrases like "could not verify," "did not run," "CI has not exercised," or "unable to test end-to-end" paired with a load-bearing exit-bar claim, AND the status line still reads Success, the check fires. Per the unverified-is-Failed principle, the correct disposition is `Result: Failed` with the diagnostic — not Success with a transparent caveat. Honesty in the log is genuinely valuable, but the watcher\'s completion rule shouldn\'t collapse "honestly unverified" and "actually verified" into the same Success bucket.',
  },
});

const fabricatedVerificationDetected: Rule = metaRule({
  id: 'fabricated-verification-detected',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  checkRef: 'fabricatedVerificationDetected',
  catalogueEntry: 'unverified-work-accepted-as-verified',
  relatedPrinciple: 'unverified-work-is-failed',
  prompt: {
    summary: 'Build-log verification claims must be consistent with the commit state.',
    guidance:
      'A log that claims "npm test passes locally" when the commit touched only the log file (no test could have run); "CI is green" when no CI run exists for the commit SHA; "migration applied" when no migration file landed — these are fabricated verifications, not just unverified ones. The check cross-references each verification claim against the actual commit: did the cited tool produce output? Does the cited file exist? Was the run real? Discrepancies between the claim and the commit are CRITICAL findings.',
  },
});

const narrowVerificationScopeMismatch: Rule = metaRule({
  id: 'narrow-verification-scope-mismatch',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  checkRef: 'narrowVerificationScopeMismatch',
  catalogueEntry: 'unverified-work-accepted-as-verified',
  relatedPrinciple: 'unverified-work-is-failed',
  prompt: {
    summary:
      "The verification scope reported in the log must match the task's exit-criterion scope.",
    guidance:
      'A builder may verify exactly what they shipped ("the specific rule I added passes against the new test") with technical accuracy, but the task\'s exit criterion was the broader state ("`lint:ci` is green"). The narrow verification doesn\'t prove the broader claim. The check cross-references each verification command run against the corresponding exit-criterion wording; verification commands narrower than the criterion fail this rule. Distinct from transparent-unverification (not evasive) and fabricated-verification (not dishonest) — this is scope mismatch.',
  },
});

const retryAttemptsRespectTaskScope: Rule = metaRule({
  id: 'retry-attempts-respect-task-scope',
  category: 'verification',
  defaultSeverity: 'CRITICAL',
  checkRef: 'retryAttemptsRespectTaskScope',
  catalogueEntry: 'retry-scope-expansion-into-architectural-config',
  relatedPrinciple: 'blockage-is-communication',
  prompt: {
    summary:
      'On retry attempts (Attempt N ≥ 2), denylisted architectural config files require explicit task-body authorization.',
    guidance:
      "On any retry, the check cross-references the diff against the task body's `## Scope` section. Changes to denylisted files (`eslint.config.*`, `dep-cruiser.config.*`, `tsconfig*.json`, `.github/workflows/*.yml`, husky hooks) require an explicit Scope-section line naming the file and the reason. Unauthorized config changes on a retry are CRITICAL — they bypass the decision trail and use compounding pressure as a justification for changes that wouldn't have been accepted up-front.",
  },
});

const standaloneVerificationsRunInUnprimedShell: Rule = metaRule({
  id: 'standalone-verifications-run-in-unprimed-shell',
  category: 'verification',
  defaultSeverity: 'HIGH',
  checkRef: 'standaloneVerificationsRunInUnprimedShell',
  catalogueEntry: 'primed-shell-verification',
  relatedPrinciple: 'unverified-work-is-failed',
  prompt: {
    summary:
      'Standalone scripts and verifications were exercised from a guaranteed-unprimed shell.',
    guidance:
      "Long-running development sessions accumulate environment state — sourced .envrc files, exported variables, project-local PATH entries. Scripts that reach into that primed environment to succeed may fail in a fresh terminal or CI shell. The check looks at each standalone verification command in the build log and confirms it ran under an unpriming wrapper: `env -i`, a freshly-spawned subprocess, a Docker container, or an explicit clean-env harness. Verifications run naked in the author's session prove the script works in that session, not that it works generally.",
  },
});

const sketchContradictionSelfCorrectionRecorded: Rule = metaRule({
  id: 'sketch-contradiction-self-correction-recorded',
  category: 'governance',
  defaultSeverity: 'LOW',
  checkRef: 'sketchContradictionSelfCorrectionRecorded',
  catalogueEntry: 'sketch-contradiction-self-correction',
  relatedPrinciple: 'blockage-is-communication',
  positiveSignal: true,
  prompt: {
    summary:
      'POSITIVE SIGNAL — build log explicitly documents a sketch/invariant contradiction the worker resolved correctly.',
    guidance:
      'When the build log notes that the implementation sketch in the task body would have violated a governing invariant (principle, decision-record, structural commitment) AND the worker implemented the invariant-conforming version AND documented the deviation with reasoning, the check records a positive signal. This is reinforcement, not flagging — the rule emits a LOW-severity finding that the renderer treats as encouragement rather than as something to fix. The signal flows to wherever the system aggregates patterns (catalogue growth, builder-feedback channels) so future builders see the example.',
  },
});

export const metaRules: readonly Rule[] = [
  exitBarClaimsMechanicallyVerified,
  transparentUnverificationBlocks,
  fabricatedVerificationDetected,
  narrowVerificationScopeMismatch,
  retryAttemptsRespectTaskScope,
  standaloneVerificationsRunInUnprimedShell,
  sketchContradictionSelfCorrectionRecorded,
];
