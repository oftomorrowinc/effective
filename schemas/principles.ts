import type { Principle, Principles } from './principle.js';

/**
 * Seed principles — derived from the Core of Tomorrow platform's constitutional
 * work (April 2026). Each principle has been generalized away from the source
 * project's internal numbering and references for portable use.
 *
 * Provenance: these principles emerged from production observation across
 * months of agent-driven development. They are not invented; each one has
 * one or more associated failure classes in the catalogue that motivate it.
 *
 * Contributors: see CONTRIBUTING.md. New principles graduate from observed
 * patterns + signals + triage, not from speculation.
 */

export const mechanicalEnforcement: Principle = {
  id: 'mechanical-enforcement-over-instruction',
  name: 'Mechanical enforcement, not instruction-requested',
  context:
    'Every invariant worth protecting will be rationalized around by a worker optimizing for local task success. This is not a problem solved by better prompts, better models, or more careful instructions. It is structural: a worker with a goal will find the locally-cheapest path to appearing to meet that goal, and if the invariant makes the goal harder, the path the worker finds will compromise the invariant in ways that look locally reasonable. Smarter LLMs optimize harder, not softer.',
  decision:
    'Invariants must be infrastructure. Constraints and expectations are enforced by code (linters, type checks, CI gates, test harnesses, schema validators, mechanical reviewers) rather than by prompt-level instruction. An instruction-requested invariant ("don\'t use any", "always check X first") is soft; a mechanical invariant (ESLint rule at error severity, a pre-commit hook, a schema validator at the service boundary) is hard. When designing a new constraint, the first question is "what mechanical check enforces this?" — not "what instruction tells the worker about this?"',
  consequences:
    "Every constraint paired with any prose description has a mechanical enforcement mechanism. Instructions explain intent; mechanical checks enforce it. If a worker-under-pressure can rationalize around a check, the check isn't mechanical enough.",
  status: 'active',
};

export const enforcementAddsDefense: Principle = {
  id: 'enforcement-must-add-defense-not-block-correction',
  name: 'Enforcement must add defense, not block correction',
  context:
    'Not every mechanical check is a net good. Some guards are so aggressive that they prevent legitimate corrections — the classic example is a rule that makes fixing a bug require a policy change, because the fix would violate the guard. Guards that block correction become obstacles to running the system correctly, not protections against running it incorrectly.',
  decision:
    "Every proposed mechanical guard must answer five questions before it lands: (1) What failure class does this prevent? (2) What existing mechanisms already defend against this? (3) How does this guard interact with correction paths (fixing mistakes, rolling back, updating data)? (4) What is the false-positive rate and how do operators respond when it fires? (5) What paths do humans take when the guard fires in a legitimate case? If answers to 3, 4, or 5 don't have clear paths, the guard is adding friction without proportional defense.",
  consequences:
    "Every new mechanical enforcement is tested against this five-question gate before filing. Guards that block correction are preceded by the correction path they permit — or don't ship.",
  relatedPrinciples: ['mechanical-enforcement-over-instruction'],
  status: 'active',
};

export const capabilityIntersection: Principle = {
  id: 'capability-equals-prompt-intersect-tools',
  name: 'Capability = prompt ∩ tools; start from zero, grant explicitly',
  context:
    'A worker\'s effective capability is the intersection of what its prompt says AND what its tools allow. The prompt is the intention; the tools are the ceiling. When tools exceed intention, the worker CAN do things the prompt-author didn\'t plan for — whether or not those things are desired. Default-all tool access turns capability from "what the prompt describes" into "what the tools permit," and the tools almost always permit far more than the prompt intends.',
  decision:
    'Every worker invocation begins with no tools, no MCP servers, no shell permissions, no file access beyond its designated working directory. Defaults are nothing. Capabilities are granted explicitly — the prompt author or workflow step config names each capability the worker needs, with a reason. Narrower primitives are always preferred over wider ones.',
  consequences:
    'Every worker (reviewer, test-writer, code-writer, specialized roles) gets tool-scoped per this principle. Per-step tool scoping is the first concrete application; the pattern extends to every subsequent worker deployment.',
  status: 'active',
};

export const unverifiedIsFailed: Principle = {
  id: 'unverified-work-is-failed',
  name: 'Unverified work is Failed, not Success',
  context:
    'Completion without verification is indistinguishable from incomplete. A worker that writes "Result: Success" with an honest caveat ("could not verify X because Y") produces a misleading signal: the watcher reads Success, marks the task complete, downstream work builds on top of the unverified claim, and by the time a human notices the gap, several tasks rest on claims that were never exercised.',
  decision:
    'A task that cannot verify its work end-to-end against its exit bar MUST report Result: Failed, not Result: Success with a transparent caveat. The distinction between "my code is broken" and "I could not verify my code works" collapses into a single Failed status — both mean the task is not complete.',
  consequences:
    "The completion signal is earned at write-time, not checked at review-time. Mechanical post-build gates exist as backstop for cases where the worker doesn't self-enforce — but the principle-level rule removes the gap at write-time, which is more robust than catching it at review-time.",
  status: 'active',
};

export const honestFailureIsFirstClass: Principle = {
  id: 'honest-failure-is-first-class',
  name: 'Honest failure is a first-class output',
  context:
    'In most training corpora and most organizational cultures, Failed correlates with "you did wrong." Even when Failed becomes structurally defined, if its valence stays negative, workers still optimize around it — narrower scope claims, vaguer exit bars, pre-emptive boundary-drawing that avoids high-risk verification.',
  decision:
    "A novel failure — max-effort-exhausted, honestly reported with what was tried and why it didn't work — is a first-class output of the system, equal in value to a verified Success. It feeds the next cycle's worker (who reads the prior log to avoid re-attempting dead paths), the reviewer's pattern detection, the catalogue's growth, and future structural improvements. A rigorous Failed with a diagnostic-rich log is a better output than a narrow-scope Success that avoided hard verification. Three qualifiers prevent the principle from becoming an escape hatch: (1) novel-within-scope, not repeated or scope-expanding; (2) max effort, not under-investment; (3) honest reporting, not cosmetic reporting.",
  consequences:
    "Workers optimize for rigorous attempts with honest reporting, not safe successes. The honest-Failed path IS the productive output when verification isn't possible.",
  relatedPrinciples: ['unverified-work-is-failed'],
  status: 'active',
};

export const oneConstitutionManyProjections: Principle = {
  id: 'one-constitution-many-projections',
  name: 'One constitution, many projections',
  context:
    "A system's universal rules need to reach every specialized worker. When many workers exist (test-writer, code-writer, reviewer, etc.), each with a specific role, bundling every rule into every worker's prompt produces attention dilution; bundling nothing and letting each worker hand-craft its context produces drift.",
  decision:
    "The canonical source for worker-binding rules lives in a single constitution. Each specialized worker's operating prompt is a projection of that source, tailored to the worker's role. A generator reads the canonical source plus each role's rule assignments and produces the worker's prompt file. Commits to the canonical source regenerate all projections.",
  consequences:
    'Specialization without cost — new worker roles become "define rule assignments, regenerate" rather than "hand-author a new constitution and hope it stays consistent." Marginal cost of a new worker drops, so the system can afford to specialize more aggressively.',
  status: 'active',
};

export const deterministicToolsOverInstructions: Principle = {
  id: 'deterministic-tools-over-instruction-accumulation',
  name: 'Deterministic tools over instruction accumulation',
  context:
    "When the system does a thing more than a few times, the knowledge about how to do that thing lives in a deterministic tool — not in repeated instructions that every worker must read and internalize. If we find ourselves updating shared instructions to capture a new edge case, fix a repeated mistake, or re-teach a pattern that keeps getting broken — that's the signal the capability belongs in a tool instead.",
  decision:
    'Encode rules in deterministic tools, not prose instructions. The worker expresses intent; the tool owns the how. Red flags: adding a constitution note for a new edge case on the second occurrence or later; re-teaching context at every worker bootstrap; workers repeatedly getting X wrong despite X being documented; the constitution growing in "avoid getting Y wrong" shape rather than principle or convention.',
  consequences:
    'Capability rules live where code can enforce them. The constitution stays focused on principles and role guidance rather than accumulating edge cases.',
  status: 'active',
};

export const blockageIsCommunication: Principle = {
  id: 'blockage-is-communication',
  name: 'Blockage is communication, not an obstacle to route around',
  context:
    "When a task's shape conflicts with reality — a precondition that can't be met, instructions that contradict a governing decision, a dependency that isn't satisfied, out-of-scope work discovered mid-task — a worker under optimization pressure will look for creative ways to resolve the conflict inline. That produces configurations shipped without decision records, architectural changes made invisibly during task execution, and decision-trail erosion that accumulates.",
  decision:
    "When a task's shape conflicts with reality, the worker surfaces the conflict via established channels and stops. Surfacing looks like: honest Failed with diagnostic detail; a blocker signal; a task-amendment request. Inline resolution via scope expansion, architectural decisions, or rule-config changes is NOT the right response — even when technically possible, even when the resulting work is correct.",
  consequences:
    'Architectural changes arrive with decision records. Configuration changes are authorized. The decision-trail stays intact.',
  relatedPrinciples: ['unverified-work-is-failed', 'honest-failure-is-first-class'],
  status: 'active',
};

export const enforcementFromZero: Principle = {
  id: 'enforcement-from-zero',
  name: 'Enforcement from zero',
  context:
    "Every enforcement tool (linter, type checker, test count, coverage, duplication detection) produces value proportional to how early it's adopted. Retrofit a strict linter to a mature codebase and you fight accumulated violations indefinitely. Adopt from commit 0 and you never accumulate; every violation gets fixed on introduction.",
  decision:
    'Every quality tool, every invariant check, every threshold is adopted from commit 0, dialed to its final strict setting. No grandfathering. No soft warnings that graduate to errors "later." No allowlists added without a cited decision explaining why.',
  consequences:
    "The single biggest advantage of starting fresh: the ability to start strict and stay strict. Enforcement-from-zero is the temporal dimension of mechanical-enforcement — invariants are stronger when they've never been violated than when they've been violated-but-excused.",
  relatedPrinciples: ['mechanical-enforcement-over-instruction'],
  status: 'active',
};

export const sourceOverSummary: Principle = {
  id: 'source-over-summary',
  name: 'Source over summary',
  context:
    "When verifying a claim about what shipped — whether the claim comes from a prior attempt's notes, an audit report, a commit message, a code-review summary, or any other secondary description — the actual source is canonical. Summaries describe what their author BELIEVED shipped; source describes what actually shipped. They diverge more often than expected, and the divergence is often invisible from the summary alone.",
  decision:
    'Reviewers verify by reading code, running greps, and checking file existence — not by paraphrasing summaries. Discrepancies between summary text and actual source are findings to surface, not silently reconciled. "The audit said X" is not verification. "I read the file and confirmed X" is verification.',
  consequences:
    'Every review claim the system makes is grounded in source-reading, not in the prior summary chain. Every task body the system ships has its source citations mechanically resolved before reviewer attention.',
  status: 'active',
};

/**
 * The full seed principles map. Projects extend this in their own
 * config; the package ships these as part of the default catalogue layer.
 */
export const seedPrinciples: Principles = {
  [mechanicalEnforcement.id]: mechanicalEnforcement,
  [enforcementAddsDefense.id]: enforcementAddsDefense,
  [capabilityIntersection.id]: capabilityIntersection,
  [unverifiedIsFailed.id]: unverifiedIsFailed,
  [honestFailureIsFirstClass.id]: honestFailureIsFirstClass,
  [oneConstitutionManyProjections.id]: oneConstitutionManyProjections,
  [deterministicToolsOverInstructions.id]: deterministicToolsOverInstructions,
  [blockageIsCommunication.id]: blockageIsCommunication,
  [enforcementFromZero.id]: enforcementFromZero,
  [sourceOverSummary.id]: sourceOverSummary,
};
