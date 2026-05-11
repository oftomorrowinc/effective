import type { Principle, Principles } from './principle.js';

/**
 * Seed principles — the load-bearing beliefs that motivate Effective's
 * rules and the failure-catalogue countermeasures. Each principle pairs
 * with one or more failure classes in `seedCatalogue`; the catalogue's
 * `relatedPrinciple` field cites back here.
 *
 * Provenance: distilled from production observation across months of
 * agent-driven development (the Core of Tomorrow platform, March–April
 * 2026). Project-specific references have been generalized for portable
 * use; the original constitution document is preserved in the project's
 * authoritative archive.
 *
 * Append-only: principles can be deprecated or retired but never
 * deleted. The numbering in the original constitution (core-3.1 …
 * core-3.10) is preserved in the `name` field for traceability.
 *
 * Contributors: see CONTRIBUTING.md. New principles graduate from
 * observed patterns + signals + triage, not from speculation.
 */

export const mechanicalEnforcement: Principle = {
  id: 'mechanical-enforcement-over-instruction',
  name: 'Mechanical enforcement, not instruction-requested',
  context:
    'Every invariant worth protecting will be rationalized around by an LLM agent optimizing for local task success. This is not a problem solved by better prompts, better models, or more careful instructions. It is structural: an agent with a goal will find the locally-cheapest path to appearing to meet that goal, and if the invariant makes the goal harder, the path the agent finds will compromise the invariant in ways that look locally reasonable. Smarter LLMs optimize this harder, not softer.',
  decision:
    'Invariants must be infrastructure. Constraints and expectations are enforced by code (linters, type checks, CI gates, test harnesses, schema validators, mechanical reviewers) rather than by prompt-level instruction. An instruction-requested invariant ("don\'t use `any`", "always check X first") is soft; a mechanical invariant (ESLint rule `no-explicit-any` at error severity, a pre-commit hook, a schema validator at the service boundary) is hard. When designing a new constraint, the first question is "what mechanical check enforces this?" — not "what instruction tells the agent about this?"',
  consequences:
    "Every constraint in the system has a mechanical enforcement mechanism paired with any prose description. Instructions explain intent; mechanical checks enforce it. If an agent-under-pressure can rationalize around a check, the check isn't mechanical enough. The entire failure catalogue is evidence for this principle — each class is an invariant that wasn't mechanically enforced and produced drift.",
  relatedCatalogueEntries: [
    'backwards-compat-creep',
    'schema-bypass-via-exception-carve-out',
    'scaffold-without-runtime-wiring',
    'test-suite-drift',
    'spec-drift-narrowed-assertions',
    'mock-masked-reality',
    'task-without-verifiable-deliverable',
    'defensive-no-op-migration',
    'spec-as-illustration-drift',
    'integration-test-writes-escape-to-production-scope',
    'unverified-work-accepted-as-verified',
    'context-artifact-grows-unbounded',
    'versioned-context-drifts',
  ],
  status: 'active',
};

export const enforcementAddsDefense: Principle = {
  id: 'enforcement-must-add-defense-not-block-correction',
  name: 'Enforcement must add defense, not block correction',
  context:
    'Not every mechanical check is a net good. Some guards are so aggressive that they prevent legitimate corrections — the classic example is a rule that makes fixing a bug require a policy change, because the fix would violate the guard. Guards that block correction become obstacles to running the system correctly, not protections against running it incorrectly.',
  decision:
    "Every proposed mechanical guard must answer five questions before it lands: (1) What failure class does this prevent? (2) What existing mechanisms already defend against this? (3) How does this guard interact with correction paths (fixing mistakes, rolling back, updating data)? (4) What is the false-positive rate and how do operators respond when it fires? (5) What paths do humans take when the guard fires in a legitimate case? If the answers to 3, 4, or 5 don't have clear paths, the guard is adding friction without proportional defense. File the concern as a signal and iterate on the design rather than shipping a net-negative guard.",
  consequences:
    "Every new mechanical enforcement is tested against this five-question gate before filing. Guards that block correction are preceded by the correction path they permit — or don't ship.",
  relatedPrinciples: ['mechanical-enforcement-over-instruction'],
  status: 'active',
};

export const capabilityIntersection: Principle = {
  id: 'capability-equals-prompt-intersect-tools',
  name: 'Capability = prompt ∩ tools; start from zero, grant explicitly',
  context:
    'An agent\'s effective capability is the intersection of what its prompt says AND what its tools allow. The prompt is the intention; the tools are the ceiling. When tools exceed intention, the agent CAN do things the prompt-author didn\'t plan for — whether or not those things are desired. Default-all tool access turns capability from "what the prompt describes" into "what the tools permit," and the tools almost always permit far more than the prompt intends.',
  decision:
    "Every agent invocation begins with no tools, no MCP servers, no shell permissions, no file access beyond its designated working directory. Defaults are nothing. Capabilities are granted explicitly — the prompt author or workflow step config names each capability the agent needs, with a reason. Narrower primitives are always preferred over wider ones: a specific endpoint over raw database access; filesystem read on a specific file over generalized query scope. Task creation specifically is always narrow — agents propose via signals; signals route through triage; workflows convert signals to tasks. Direct task-creation by agents bypasses triage and should not be granted unless there's a specific, reviewed reason.",
  consequences:
    'Every agent in the system (reviewers, builders, specialized roles) gets tool-scoped per this principle. Per-step tool scoping in build workflows is the first concrete application; the pattern extends to every subsequent agent deployment.',
  status: 'active',
};

export const unverifiedIsFailed: Principle = {
  id: 'unverified-work-is-failed',
  name: 'Unverified work is Failed, not Success',
  context:
    'Completion without verification is indistinguishable from incomplete. An agent that writes `Result: Success` with an honest caveat ("could not verify X because Y") produces a misleading signal: the watcher reads Success, marks the task complete, downstream work builds on top of the unverified claim, and by the time a human notices the gap, several tasks rest on claims that were never exercised.',
  decision:
    'A task that cannot verify its work end-to-end against its exit bar **MUST** report `Result: Failed`, not `Result: Success` with a transparent caveat. The distinction between "my code is broken" and "I could not verify my code works" collapses into a single Failed status — both mean the task is not complete. The retry loop handles Failed cleanly: Failed is not a terminal state; it\'s a re-eligibility state. The next cycle\'s builder reads the prior Failed\'s diagnostic, tries a different approach, or files a prerequisite-blocker signal if the task itself is unworkable.',
  consequences:
    "The completion signal is earned at write-time, not checked at review-time. A mechanical post-build gate exists as backstop for cases where the builder doesn't self-enforce — but the principle-level rule removes the gap at write-time, which is more robust than catching it at review-time.",
  relatedCatalogueEntries: ['unverified-work-accepted-as-verified'],
  status: 'active',
};

export const honestFailureIsFirstClass: Principle = {
  id: 'honest-failure-is-first-class',
  name: 'Honest failure is a first-class output',
  context:
    'In most training corpora and most organizational cultures, Failed correlates with "you did wrong." Even when Failed becomes structurally defined per `unverified-work-is-failed`, if its valence stays negative, builders still optimize around it — narrower scope claims, vaguer exit bars, pre-emptive boundary-drawing that avoids high-risk verification.',
  decision:
    "A novel failure — max-effort-exhausted, honestly reported in the build log with what was tried and why it didn't work — is a first-class output of the system, equal in value to a verified Success. It feeds the next cycle's builder (who reads the prior log to avoid re-attempting dead paths), the reviewer's pattern detection, the failure catalogue's growth, and future structural improvements. A rigorous Failed with a diagnostic-rich log is a better output than a narrow-scope Success that avoided hard verification.\n\nThree qualifiers are load-bearing and prevent the principle from becoming an escape hatch:\n\n- **Novel-within-scope, not repeated or scope-expanding.** Novel means a different approach to the task as originally defined. Repeated failures in the same shape mean the system is stuck — file a prerequisite-blocker signal, don't retry. Scope expansion to resolve a blocker inline is `blockage-is-communication` territory.\n- **Max effort, not under-investment.** References read, documented patterns attempted, tools exhausted, tests actually run. Failure after under-investment is a different failure — one `unverified-work-is-failed` flags as unverified, not one this rule celebrates.\n- **Honest reporting, not cosmetic reporting.** The log explains what was tried and why it didn't work with enough detail that a human or later builder can understand it cold.",
  consequences:
    "Builders optimize for rigorous attempts with honest reporting, not safe successes. The honest-Failed path IS the productive output when verification isn't possible.",
  relatedPrinciples: ['unverified-work-is-failed'],
  status: 'active',
};

export const oneConstitutionManyProjections: Principle = {
  id: 'one-constitution-many-projections',
  name: 'One constitution, many projections',
  context:
    "The system's universal rules need to reach every specialized agent. When many agents exist (test-writer, code-writer, reviewer, specialized roles), each with a specific role, bundling every rule into every agent's prompt produces attention dilution (see `context-artifact-grows-unbounded`); bundling nothing and letting each agent hand-craft its context produces drift.",
  decision:
    "The canonical source for agent-binding rules lives in a single constitution. Each specialized agent's operating prompt is a **projection** of that source, tailored to the agent's role. A generator reads the canonical source plus each role's rule assignments and produces the agent's prompt file. Commits to the canonical source regenerate all projections.\n\nTwo audiences, two sources, no overlap: the canonical constitution is fresh scaffolding specifically for specialized-agent projections, not a rewrite of human-facing onboarding docs. Repo-root human-facing docs (`README.md`, `CLAUDE.md`, `AGENTS.md`) evolve independently and serve humans arriving at the repo.",
  consequences:
    'Specialization without cost — new agent roles become "define rule assignments, regenerate" rather than "hand-author a new constitution and hope it stays consistent." Marginal cost of a new agent drops, so the system can afford to specialize more aggressively.',
  relatedCatalogueEntries: ['context-artifact-grows-unbounded', 'versioned-context-drifts'],
  status: 'active',
};

export const deterministicToolsOverInstructions: Principle = {
  id: 'deterministic-tools-over-instruction-accumulation',
  name: 'Deterministic tools over instruction accumulation',
  context:
    "When the system does a thing more than a few times, the knowledge about how to do that thing lives in a deterministic tool — not in repeated instructions that every agent must read and internalize. If we find ourselves updating shared instructions, memory files, or prompt templates to capture a new edge case, fix a repeated mistake, or re-teach a pattern that keeps getting broken — that's the signal the capability belongs in a tool instead.",
  decision:
    'Encode rules in deterministic tools, not prose instructions. Short-id generation lives in a function that owns the rule. ID generation lives in `ulid()`. Task creation with required edges lives in an API wrapper that enforces edges at the boundary. Validation lives in schemas. The agent expresses intent; the tool owns the how.\n\nRed flags that signal a capability belongs in a tool:\n\n- Adding a constitution note to capture a new edge case on the second occurrence or later.\n- Re-teaching context at every agent bootstrap or compaction — knowledge that doesn\'t survive context reset is in the wrong place.\n- Agents repeatedly getting X wrong despite X being documented — stop trying to teach better; build the tool that makes X impossible to get wrong.\n- The constitution growing in "avoid getting Y wrong" shape rather than principle or convention.',
  consequences:
    'Capability rules live where code can enforce them. The constitution stays focused on principles and role guidance rather than accumulating edge cases.',
  status: 'active',
};

export const blockageIsCommunication: Principle = {
  id: 'blockage-is-communication',
  name: 'Blockage is communication, not an obstacle to route around',
  context:
    "When a task's shape conflicts with reality — a precondition that can't be met, instructions that contradict a governing decision, a dependency that isn't satisfied, out-of-scope work discovered mid-task — an agent under optimization pressure will look for creative ways to resolve the conflict inline. That produces configurations shipped without decision records, architectural changes made invisibly during task execution, and decision-trail erosion that accumulates into the same class of failure the catalogue documents.",
  decision:
    "When a task's shape conflicts with reality, the agent surfaces the conflict via established channels and stops. Surfacing looks like: honest Failed per `unverified-work-is-failed` with diagnostic detail; a blocker signal via the signal-creator API; a task-amendment request via the planning API. Inline resolution via scope expansion, architectural decisions, or rule-config changes is NOT the right response — even when technically possible, even when the resulting work is correct.\n\n**The task body is the only valid communication channel.** Agents must never prompt the user for clarification via interactive output, trust the runner to surface a question, or wait in-session for a human reply. Non-interactive runners (CI-invoked agents, batch execution, streaming output) have no reply channel — a question asked there is never answered; the session hangs. Instead: frame the question in the task body's attempt-log with the options you see, write `Result: Blocked — <specific question or conflict>` as the status line, and exit.\n\nThe operational test is grep-able: **does the task's success depend on external state being a particular way, or does the task build infrastructure that observes/detects/reports on that state?** Achieve-a-state tasks block on external conditions. Build-a-detector tasks Success when the detector works, even when it immediately finds things (those findings become follow-ups, not blockers).\n\nThe carve-out is mechanical per-rule-class fixes within the task's scope. Changes touching allowlist paths (`src/**`, `**/*.test.ts`, task-authorized migrations) are implementation work. Changes touching denylist paths (`eslint.config.*`, CI workflows, architectural config) require explicit task-body authorization or they're scope violations.\n\n**Operational precondition.** This principle depends on the surfacing path being fast. If a blocker signal takes days to reach triage, builders will rationalize around compliance. Responsive triage is a partner requirement, not an aspiration.",
  consequences:
    'Architectural changes arrive with decision records. Configuration changes are authorized. The decision-trail stays intact.',
  relatedPrinciples: ['unverified-work-is-failed', 'honest-failure-is-first-class'],
  status: 'active',
};

export const enforcementFromZero: Principle = {
  id: 'enforcement-from-zero',
  name: 'Enforcement from zero',
  context:
    "Every enforcement tool (linter, type checker, test count, coverage, duplication detection) produces value proportional to how early it's adopted. Retrofit a strict linter to a mature codebase and you fight accumulated violations indefinitely — the cost is weeks of cleanup and reviewer fatigue. Adopt from commit 0 and you never accumulate; every violation gets fixed on introduction.",
  decision:
    'Every quality tool, every invariant check, every threshold is adopted from commit 0, dialed to its final strict setting. ESLint strict, TypeScript strict, code-smell rules enabled, duplication detection at tight thresholds, dead-code detection baselined to zero, coverage monotonic, test-count non-decreasing — all from the first line of code. First violation blocks CI immediately; first violation gets fixed.\n\nNo grandfathering. No soft warnings that graduate to errors "later." No allowlists added without a cited decision explaining why.',
  consequences:
    "The single biggest advantage of a restart over retrofit: the ability to start strict and stay strict. Enforcement-from-zero is the temporal dimension of `mechanical-enforcement-over-instruction` — invariants are stronger when they've never been violated than when they've been violated-but-excused.",
  relatedPrinciples: ['mechanical-enforcement-over-instruction'],
  status: 'active',
};

export const sourceOverSummary: Principle = {
  id: 'source-over-summary',
  name: 'Source over summary',
  context:
    "When verifying a claim about what shipped — whether the claim comes from your own prior attempt notes, an audit agent's report, a commit message, a code-review summary, third-party documentation, or any other secondary description — the actual source is canonical. Summaries describe what their author BELIEVED shipped; source describes what actually shipped. They diverge more often than expected, and the divergence is often invisible from the summary alone.",
  decision:
    'Reviewers verify by reading code, running greps, and checking file existence — not by paraphrasing summaries. Discrepancies between summary text and actual source are findings to surface, not silently reconciled in the reviewer\'s report. "The audit said X" is not verification. "I read the file and confirmed X" is verification.\n\nThis applies symmetrically to retry-loop builders consuming prior attempts: prior-attempt prose describes the prior builder\'s belief; the current-attempt builder verifies against the actual worktree state, not the prior attempt\'s summary of it. Audit agents dispatched by reviewers or humans must be prompted to verify each load-bearing claim by reading source.\n\n**Failure mode — confidently-wrong reports.** A reviewer or audit agent that summarizes prior summaries without ever reaching source produces text that sounds authoritative but is detached from what shipped. Cumulative across reviews, this drift can mislead architectural decisions.\n\n**Author-time enforcement.** Source-over-summary applies symmetrically when authoring task bodies. Task spec authors cite source — files, schemas, sections, table columns. Two failure modes commonly observed: (1) **Workflow-frame coherence drift** — the body asserts one framing but the frontmatter contradicts it. The body is the human-readable source-of-truth; the frontmatter is its mechanical projection. They must agree. (2) **Cited-deliverable drift** — the body says "Update the X table in `path.md`" but `path.md` has no such column, OR the body cites a file path that doesn\'t exist. Reviewer attention shouldn\'t be the first line of defense — the citation should be checkable mechanically before the task is dispatched.',
  consequences:
    'The cost is small — `ls` and `Read` are cheap, grep is cheap, reading the file is cheap. The cost of NOT doing it is large — incorrect architectural decisions, confidence in unverified claims, drift accumulation. Every review claim the system makes is grounded in source-reading, not in the prior summary chain. Every task body the system ships has its source citations mechanically resolved before reviewer attention.',
  relatedCatalogueEntries: ['unverified-work-accepted-as-verified'],
  status: 'active',
};

/**
 * The full seed principles map. Projects extend this in their own
 * config; the package ships these as part of the default catalogue
 * layer.
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
