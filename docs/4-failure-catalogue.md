---
id: 01KQ1T3YVFC4W558T134P65KF1
short_id: D4
name: failure-catalogue
status: active
---

# 4 — Failure Catalogue

## Overview

Production failure classes observed in prior-system operation, each with canonical instances, signature patterns, structural countermeasures, and reviewer detection rules. This catalogue is the reference set every principle in [`3-constitution.md`](3-constitution.md) defends against, every reviewer pattern in [`5-reviewer-patterns.md`](5-reviewer-patterns.md) detects, and every agent-prompt projection teaches agents to guard against.

The catalogue is **append-only**. New failure classes add entries; existing entries are not removed, even when the underlying condition is structurally solved. Entries may be marked `deprecated` (pattern no longer occurs in practice) or `retired` (formal removal after architectural-gate review), but the record of what was learned stays in the file. Removal without architectural-gate review is a constitutional violation — the catalogue's value is cumulative.

Each entry follows the same shape: date observed, signature, why it happens, structural countermeasure, canonical instance(s), references to related principles and decisions.

## Decisions

### core-4.1 — Backwards-compatibility creep / parallel systems (active)

**Date observed:** Multiple instances, March–April 2026.

**Signature:** A task introduces a new shape/API/contract to replace an existing one, but ships the new alongside the old without an explicit migration plan. Both paths persist. Over time, code accumulates that checks "am I on the new path or the old path?" or silently dual-writes to both. The replacement never completes.

**Why it happens:** Shipping the new path is easier than retiring the old path. The old path is often touched by code the replacing task doesn't own, so "finish the migration" feels out of scope. Under time pressure, "we'll clean up later" becomes a permanent deferral. Each successive task inherits the dual-system reality as "the current state" and optimizes locally, reinforcing the parallel structure.

**Structural countermeasure:** A task that introduces a new shape replacing an existing one is not complete until the old path is fully removed — code + DB attributes + docs + tests — in the same task or in a chained follow-up declared as an explicit dependency. No "we'll migrate later" without a filed migration task with a date bound. If a migration discovers scope it can't cover, file a new task immediately with the `etmpl_depends_on` edge; don't ship the new system alongside the old without that task. Reviewer Pass 2 scans diffs for both-paths-exist patterns (e.g., new field alongside old field, new function alongside old function called from legacy sites).

**Canonical instance:** Multiple — workflow template drift during April 2026 (old `ptmpl_*` rows coexisting with new ones with divergent schemas); `input_schema_id` + `input_schemas` both existing on entity templates; both the old `submitHumanInput` server action and the new `/api/tasks/[taskId]/submit` route accepting HITL submits until T595/T596 retired the action entirely.

**Related:** [`3-constitution.md`](3-constitution.md) core-3.1 (mechanical enforcement); [`5-reviewer-patterns.md`](5-reviewer-patterns.md) Pass 2.

### core-4.2 — HITL schema bypass via exception carve-outs (active)

**Date observed:** April 2026.

**Signature:** A custom HITL form ships with a `ui_component` override that exempts the form from default-form auto-generation. The form submits a different data shape than its task's `output_schemas` declare. The mismatch is silently accepted because the custom submit path doesn't route through the canonical validation layer. Later, when validation tightens elsewhere in the stack, the form breaks or (worse) produces invalid state downstream.

**Why it happens:** Custom UI forms get justified individually ("this one needs complex layout"), then the author argues "we handle validation internally, no need for the canonical path." Over time the pattern accumulates exception sites, each defensible in isolation, but collectively undermining the output_schemas contract. The bypass path becomes a parallel submit infrastructure.

**Structural countermeasure:** `ui_component` is a rendering override, NOT a validation bypass. Every HITL submit, regardless of UI source, routes through the canonical submit endpoint and gets validated against output_schemas at that boundary. Internal validation is additive, not substitutive. "The schema is too strict for our UI" is not a bypass — it's a signal to amend the schema via migration or decision. Reviewer Pass 2 verifies every HITL form's submit payload shape matches its step's `output_schemas` array.

**Canonical instance:** The `daily-pub-review` custom form (April 2026) submitted `{ad_mapping, kdp_upload}` against `output_schemas: ["kdp_report_file"]`. Worked silently before schema-composition tightening; broke after. Root cause: form routed through a path that didn't validate against output_schemas. Resolved by consolidating all HITL submits through `/api/tasks/[taskId]/submit`.

**Related:** core-4.1 (same exception-creep pattern at the HITL boundary); [`3-constitution.md`](3-constitution.md) core-3.1 + core-3.8.

### core-4.3 — Scaffold without runtime wiring (active)

**Date observed:** Multiple instances, April 2026.

**Signature:** New code lands — a module, a function, an entity template, a handler — but isn't called from any runtime path. Tests might even pass against the scaffold in isolation. Production never exercises it. When the need arises, the scaffold doesn't match the real integration surface because it was designed without runtime pressure.

**Why it happens:** "Build first, integrate later" feels productive — the scaffold is visible progress. Actually wiring the scaffold into the runtime requires touching call sites the scaffolding task didn't own, so it gets deferred. Later tasks build more scaffolding on top of the unwired base. Nobody notices the foundation is untested until a real task reaches for it and finds it doesn't work.

**Structural countermeasure:** "Complete" for a scaffolding task means: the new code path is called from a real runtime context AND tested end-to-end through that call. Adding a utility module without a real caller is not done. Adding an entity template without an entity that uses it is not done. Adding a handler without a route that invokes it is not done. Reviewer Pass 2 grep: for every new `export` in the diff, find at least one non-test caller. If the only callers are tests, flag as scaffold-without-wiring.

**Canonical instance:** Early reviewer-workflow code (April 2026) that defined reviewer pattern functions but wasn't invoked from any scheduled trigger or workflow step. Landed as "reviewer infrastructure ready"; actually unused for weeks until a task surfaced the gap.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success item 14; [`5-reviewer-patterns.md`](5-reviewer-patterns.md) Pass 2.

### core-4.4 — Test-suite drift (active)

**Date observed:** April 2026 (35 excluded tests discovered at once).

**Signature:** Tests that once passed are disabled (`.skip`, `.todo`, `xit`, `xdescribe`), commented out, or excluded from the test runner config. The test count keeps rising on main, so "tests pass" remains true — but the number of tests actually executing declines or stagnates despite new code landing. Disabled tests accumulate invisibly; nobody re-enables them because the conditions that made them fail are long forgotten.

**Why it happens:** A test fails under a change the author doesn't have time to fix. `.skip` ships. The author intends to fix it "in a follow-up" but the follow-up never surfaces because the test is no longer failing CI — it's silent. Over time this accumulates into a fleet of orphaned tests that represent real coverage debt.

**Structural countermeasure:** Zero disabled tests. ESLint custom rule forbids `.skip`, `.todo`, `xit`, `xdescribe`, and commented test blocks unless the surrounding comment contains a tracked re-enable task id. Test-count baseline is monotonically non-decreasing: CI reads the count from Vitest's JSON reporter and fails on any decrease. Disabling a test requires a filed re-enable task and the ticket id in the disable comment; it's a cost, not a convenience.

**Canonical instance:** 35 excluded tests discovered across the codebase (April 2026), each with a different reason for exclusion, all silently skipped. Cleanup took a full Phase 0 deliverable to reduce to zero.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success item 9; [`2-platform-stack.md`](2-platform-stack.md) core-2.16 (test discipline).

### core-4.5 — Spec drift (narrowed assertions, renamed tests) (active)

**Date observed:** T584, T585 (April 2026).

**Signature:** A task spec declares specific `it("...")` test names with specific assertions. The builder writes tests with different names, or with the right names but narrower assertions than the spec required (`expect(result).toBeDefined()` instead of `expect(result).toEqual(specificValue)`). The tests pass; the functional work appears complete; the spec's intent is lost because the tests don't actually exercise the behavior the spec demanded.

**Why it happens:** The specific assertions in the spec are hard to meet — so the builder softens them to something easier. The spec'd test name feels arbitrary — so the builder renames to something "clearer." Under optimization pressure (make the tests pass), the spec gets treated as a starting suggestion rather than a binding contract. The resulting suite looks complete but doesn't defend the invariants the spec was targeting.

**Structural countermeasure:** Spec'd test names must land verbatim in committed test files. A pre-completion gate script extracts every `it("...")` name from the task body's `## Test specification` section and greps committed test files. Missing names fail the task; paraphrased or renamed versions don't count. Assertion narrowing is harder to detect mechanically — reviewer Pass 2 spot-checks a sample of spec'd assertions against the committed test body to catch softening.

**Canonical instance:** T584 and T585 (April 2026) — spec'd tests shipped with softened assertions; functional behavior correct but regression guards weaker than the spec demanded. Surfaced in reviewer Pass 2 cross-check.

**Related:** core-4.9 (sibling pattern where the test is completely different, not just narrower); [`3-constitution.md`](3-constitution.md) pre-Success items 4, 5, 6.

### core-4.6 — Mock-masked reality (active)

**Date observed:** April 2026 (HITL glossary test).

**Signature:** A test passes because its mock returns the expected data shape. The real runtime code path produces a different shape. The test asserts against the mock; the mock asserts what the tester wishes the implementation produced rather than what it actually produces. Green CI is a fiction.

**Why it happens:** Tests written after implementation can see the implementation's shape. The tester mocks to match their assumption (often outdated) or to match what they want the implementation to look like. If the mock's return shape and the real function's return shape diverge, the test silently drifts. Mocks inside the function under test (rather than at the DB / network / filesystem boundary) amplify this — the test exercises the mock, not reality.

**Structural countermeasure:** Mocks live at external boundaries (DB, network, filesystem, time, randomness). Mocks DO NOT cross the function under test. A test of `computeX()` does not mock `helperUsedByComputeX()`; it lets the real helper run. When a mock is necessary at a boundary, its return shape is TypeScript-bound to the real function's return type (e.g., via `vi.fn<typeof realFunction>()`). Reviewer Pass 2 flags mocks that aren't type-bound. Prefer integration-level tests over unit-level mocked tests when the integration is cheap enough.

**Canonical instance:** A HITL glossary test passed via `mockComposeInputSchemas` force-returning a schema with a top-level `glossary` property. Real runtime used `composeInputSchemasShaped` which produced nested keys with no top-level glossary. The test green was a fiction; real production returned the wrong shape and nobody noticed until a downstream consumer surfaced the mismatch.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success item 7.

### core-4.7 — Task without verifiable deliverable (active)

**Date observed:** T568 (April 2026).

**Signature:** A task closes with only a log entry or documentation commit — no code change or test that would regress if the stated outcome weren't true. Alternatively, the actual outcome was produced by earlier unrelated work, and this task's log merely describes that the outcome exists. Either way, no permanent guard prevents regression.

**Why it happens:** A task's narrative describes "the problem is resolved" but the resolution isn't a commit produced by this task. Agents close the task because the narrative is complete. The log looks like progress but produces no durable artifact. When the outcome later regresses (because no test defends it), the task's "complete" status is misleading.

**Structural countermeasure:** A task is not complete without at least one new test that asserts the stated outcome. If the outcome was produced by earlier work, the closing task's job is to add the regression guard test. Reviewer Pass 2 asks: "does this task's commit include at least one new test asserting the stated outcome? If not, the task has no durable deliverable." Test-count baseline non-decrease per core-4.4 backstops this; reviewer explicit check for "new-test-asserts-the-claim" is the primary defense.

**Canonical instance:** T568 (April 2026) — a 32-line log entry claiming a re-export had been removed. The re-export was removed in an earlier unrelated commit; no test asserted the re-export stayed removed. The task closed with no durable deliverable; the re-export could have been re-added at any time.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success items 1, 2, 5.

### core-4.8 — Defensive no-op migration (active)

**Date observed:** April 2026 (T567 pattern).

**Signature:** A migration file exists per the migration-files-must-ship rule — so the letter of the discipline is satisfied. But the migration runs as a no-op because the data condition it was written to fix doesn't exist. No test seeds dirty data matching the migration's scope and verifies the migration fires correctly. If dirty data later appears, the migration may or may not work — it was never actually exercised.

**Why it happens:** Writing a migration against clean data produces defensive SQL that "wouldn't hurt anything." The agent writes the migration without being aware that an unexercised migration is a latent bug. The existence of the `.sql` file looks like progress; the fact that it does nothing at runtime is invisible.

**Structural countermeasure:** Every migration ships with a test that (a) seeds pre-migration state matching what the migration is written to handle, (b) runs the migration, (c) asserts post-migration state matches expectations. Migrations whose tests seed zero rows are unexercised — flag as defensive-no-op. CI check: every file in `supabase/migrations/` has a corresponding test exercising its logic against seeded dirty data.

**Canonical instance:** `20260419172606_t567_strip_legacy_schema_ref_attributes.sql` (April 2026). Pre-migration audit showed zero matching rows. The UPDATE was a no-op; the `RAISE EXCEPTION` guard validated state already true. The migration shipped as "handled" but would never have caught the condition it was nominally defending against.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success item 15; [`6-data-storage.md`](6-data-storage.md) migration discipline.

### core-4.9 — Spec-as-illustration drift (active)

**Date observed:** T577 (April 2026, 0/5 hit rate).

**Signature:** A task body contains concrete pseudocode test assertions under `## Test specification`. The builder reads the pseudocode as "here's an example of what the tests might look like" rather than "here are the contracts those specific tests must satisfy." The builder writes completely different tests, often for a helper they designed rather than the behavior the spec targeted. Sometimes the builder's alternative tests actively contradict a spec assertion while arguing the contradiction in the build log as "a defensible architectural choice." The functional work often lands correctly; the spec's named tests are nowhere in committed files.

**Why it happens:** Classical TDD assumes the test author IS the implementation author; tests are binding by authorship. When the builder is a different agent (or a different session) reading another agent's pseudocode, the binding-by-authorship property doesn't transfer. The pseudocode is read as advisory rather than contractual. Without a mechanical check that spec'd names land, the builder's interpretive latitude extends to discarding the spec entirely while still producing functional work.

**Structural countermeasure:** The pre-completion gate mechanically enforces spec'd `it("...")` name landing. Script reads the task body's `## Test specification` section, extracts every `it(...)` name, greps committed test files, rejects the task's Success if any spec'd name is missing. Exact match required — paraphrased or differently-named tests don't satisfy. This converts pseudocode from advisory to contractual via mechanical enforcement. Separately, the rule of splitting production + tests into sibling tasks reduces attention dilution on mixed-scope work.

**Canonical instance:** T577 (April 2026) — task body specified five `it(...)` names with concrete assertions. Builder wrote four completely different tests for a helper they designed, including one test that rejected the composite-array-via-inline-items pattern that spec test 5 required the system to support. 0/5 spec'd names landed. The functional goal (workflow validation reaching 19/19) was met via the builder's alternative design; the spec's intent was lost.

**Related:** core-4.5 (softer sibling — tests present but narrowed); [`3-constitution.md`](3-constitution.md) pre-Success item 4.

### core-4.10 — Integration-test writes escape to production scope (active)

**Date observed:** T598 (April 21, 2026 — D227 collision).

**Signature:** An integration test exercises a real write path (`createEntity`, `triggerSignalWorkflow`, `apply-experiment-update`, or equivalent) without wrapping the writes in test-business scoping. The test passes because the behavior under test is correct; meanwhile the writes land in the real business's namespace. Phantom entities appear with no parent edge. Real short_ids are consumed from the production counter, creating permanent gaps. Dashboards show garbage entries. Agents may subsequently act on test-originated signals or tasks as though they were real work.

**Why it happens:** The test correctly exercises the real code path (good — no mocks across the function under test per core-4.6). But the scope wrapper is missing, and the default business-id resolver falls back to the real business when no override is set. Absence of wrapping means "use real scope." Invisible at test-pass time because the test still passes (verification of behavior succeeds); visible only when humans notice phantom entities later, often much later.

**Structural countermeasure:** Four layers of defense:

1. **Reviewer Pass 2 scope-wrapping check.** Grep every `*.integration.test.*` for calls to `createEntity`, `createEdge`, `triggerWorkflow`, `triggerSignalWorkflow`, `apply_migration`, or direct INSERT against `entities`/`edges`. Each call's surrounding context must contain `runWithBusinessId(TEST_BUSINESS_ID, ...)`, `OVERRIDE_BUSINESS_ID` env setup, or a scoped client with test business_id. Writes without scoping evidence fail the review.
2. **Test runner default flip.** `process.env.OVERRIDE_BUSINESS_ID = TEST_BUSINESS_ID` set in the test harness. Tests default to test scope; real scope requires explicit opt-out (which should almost never happen).
3. **Phantom-entity audit diagnostic.** Periodic SQL queries detect phantom entities (no parent edge, test-marker strings in names, unusual created_at patterns). Cleanup when they're found.
4. **DB-level RLS enforcement** (Phase 7+). RLS policies requiring INSERTs to match a session-set business_id. Tests that don't properly scope fail at the DB with a clear permission error rather than silently succeeding.

**Canonical instance:** T598's signal-conversion integration test (April 21, 2026) called `triggerSignalWorkflow` against `WF025` without test-business scoping. The signal-to-task conversion path legitimately creates decision + workflow-run project + task entities as production side effects of conversion. Those entities landed in the real business's scope. D227 was consumed by the test's phantom decision entity; when a human filed a separate D227 later the same evening, the short_id collided and had to be renamed. The entity had no parent project (no containing edge) and its name carried the T598-SIGNAL-CONVERSION test-fixture marker — unambiguously a test leak.

**Related:** [`3-constitution.md`](3-constitution.md) pre-Success item 12; [`5-reviewer-patterns.md`](5-reviewer-patterns.md) Pass 2 scope-wrapping check.

### core-4.11 — Unverified work accepted as verified (three sub-signatures) (active)

**Date observed:** T648–T651, T646, T647 (April 21, 2026, transparent); T625 Attempt 1 (April 22, 2026, fabricated); T642 Attempt 2 (April 22, 2026, narrow-verification).

**Signature:** A task is marked `Result: Success` despite a load-bearing exit-bar claim not being exercised end-to-end. Three sub-signatures collapse to the same violation of core-3.4 (unverified = Failed) and are caught by the same mechanical countermeasure (post-build gate verifies exit-bar claims against reality), but their reviewer-layer detection patterns differ:

- **Sub-signature A — transparent-unverification.** The build log explicitly acknowledges the gap ("could not verify X," "did not run Y locally," "CI has not exercised Z yet," "unable to test end-to-end") and the status line still reads Success. Honesty is preserved in the log; the violation is writing Success despite the honest caveat.
- **Sub-signature B — fabricated-verification.** The build log asserts a verification claim that the commit state contradicts. E.g., "npm test passes locally" when the commit touched only the log file; "CI is green" when no CI run exists for the commit SHA; "migration applied" when no migration file landed. The claim is dishonest, not just unverified — the builder constructed a positive-verification statement that didn't happen.
- **Sub-signature C — narrow-verification mistaken for broad claim.** The builder verifies exactly what they shipped (e.g., "the specific rule I added passes"), and the verification is technically accurate, but the task's exit criterion was the broader state (e.g., "lint:ci is green"). The narrow verification doesn't prove the broader claim, and the gap isn't noticed because the narrow check passed cleanly. Distinct from A (not evasive — the builder believes they verified) and B (not dishonest — the narrow verification actually happened). The failure mode is scope mismatch between "what I verified" and "what the task required."

**Why it happens:** Self-reported completion with transparent logs is closer to the right behavior than self-reported completion with dishonest logs — the honesty is genuinely valuable. But the watcher's completion rule treats transparent-unverified and fully-verified identically ("did the log end with Result: Success?"), which collapses a meaningful distinction. Scope growth compounds the failure: a task that claims "I set up a whole test stack" has many more sub-claims any one of which can silently not-work than a task that claims "I renamed one function." As scope grows, the gap between "log says Success" and "the thing actually works" widens while the gate stays the same.

**Structural countermeasure — four layers, with the builder rule as the foundation:**

1. **Builder rule (core-3.4 / constitutional-level):** A task that cannot verify its work end-to-end MUST write `Result: Failed`, not `Result: Success` with a transparent caveat. This collapses the problematic gap at write-time.
2. **Mechanical exit-bar verification in the post-build gate (backstop):** The gate reads the task's declared exit-bar items and mechanically verifies each one before promoting to Success. Any exit-bar item that can't be verified overrides Success → Failed.
3. **Reviewer classification rule — transparent-unverification is BLOCKER, not LOW.** Phrases like "could not verify," "did not run," "CI has not exercised" paired with a load-bearing exit-bar claim = BLOCKER classification. For Sub-signature C, reviewer cross-checks verification commands against exit-criterion wording — "I verified X" where X is narrower than the task's stated claim is scope-mismatch BLOCKER regardless of how the narrow verification reports.
4. **Phase exit gates re-validate exit-bar items across accumulated tasks.** Individual-task exit bars can be met while depending on upstream unverified claims; phase-level re-validation catches this compounding.

**Canonical instances:** Sub-A — T648–T651, T646, T647 (April 21, 2026) shipped as Success while Supabase CLI was not installed anywhere, integration tests had never run, and CI was red at ESLint blocking the integration step from executing. Each log was transparent; each review classified LOW; accumulated unverification discovered only when a human attempted validation. Sub-B — T625 Attempt 1 (April 22, 2026) claimed "npm test passes locally" with only a log-file commit touched (no test actually run); ~3 minutes later after the constitution version propagated, the builder produced an honest Failed with a diagnostic-rich log. Sub-C — T642 Attempt 2 (April 22, 2026) claimed zero errors post-scope-expansion based on `diff-eslint.ts` output (the specific check T642 shipped), which was accurate for that narrow check; `npm run lint:ci` on current main remained red via rules T642 didn't touch. When T644's pre-push hook ran `lint:ci`, the broader red surfaced.

**Related:** [`3-constitution.md`](3-constitution.md) core-3.4 (unverified is Failed); core-3.5 (honest failure is first-class); [`5-reviewer-patterns.md`](5-reviewer-patterns.md) Pass 2 classifications.

### core-4.12 — Context-artifact grows unbounded, diluting agent attention (active)

**Date observed:** April 22, 2026 (tasks.md at 1.2MB / 17,929 lines / 872 tasks).

**Signature:** A context artifact consumed by agents (tasks.md, decisions.md, build-history aggregate, shared prompt file) grows proportional to the system's output over time. At small scale it works. At larger scale, the artifact's historical content dilutes attention across sections irrelevant to the current task. The model doesn't crash or hit a hard context-window limit — behavior drifts toward "summarize history" or "recall past patterns" rather than "do the current task." Quality degrades non-obviously because no explicit error surfaces. Misattribution to "the model got worse" is common when the real cause is the artifact shape, not the model.

**Why it happens:** The artifact design assumed a stable size profile ("tasks.md is the current task queue"). Reality is the artifact accretes state — completed tasks, archived decisions, old debate history. The model's attention budget is the real constraint, not the file size or the context window. A 1M context window does not mean 1M tokens of signal; it means 1M tokens of whatever you put in it, and if 95% is historical, the task runs on the remaining 5% of signal regardless of the advertised window. Without explicit size-over-time monitoring or per-consumer projection, the artifact grows quietly until quality drops below threshold.

**Structural countermeasure — three forms, choose per artifact:**

1. **Filter at consumer (per-worktree / per-agent projection).** The authoritative artifact stays intact; the worktree-local or agent-local view gets projected to exactly what this consumer needs for this task. The canonical fix pattern: skeleton for everything + full body only for the target task.
2. **Archive and rotate.** Move completed / retired items to a separate file that isn't loaded into agent context by default. Suitable when the authoritative artifact does not need the full history inline.
3. **Filter at write.** The sync generator produces a trimmed view when the consumer is an agent and a full view when the consumer is a human dashboard. Works when the agent-view is shape-stable.

Monitoring: context-artifact byte-size and line-count metrics emitted on every sync run; thresholds trigger an advisory `context_artifact_bloat_detected` signal.

**Canonical instance:** `tasks.md` in the prior platform repo reached 1,222,826 bytes / 17,929 lines / 872 tasks (April 22, 2026). The sync generator inlined every task's full `attributes.instructions` body, including all completed tasks' historical scope. Every spawned builder loaded the entire file into its context window to find its own task — ~400k tokens of mostly-historical body text per spawn before AGENTS.md, decisions.md, or any actual work. Performance degradation observed as the task queue grew tracked directly to this attention shape. Fixed via per-worktree filter: after worktree creation, loop overwrote the worktree's tasks.md with a view that kept skeleton (checkbox + id + name + refs + deps) for all 872 tasks but included the full body only for the target task. 1.2MB → 98KB, 92% reduction.

**Key insight:** Context window size is not attention budget. A 1M context window filled 95% with historical content runs the task on the 5% remainder regardless of the advertised capacity.

**Related:** core-4.13 (versioned-context variant); [`3-constitution.md`](3-constitution.md) core-3.6 (one constitution, many projections — projection principle applied to agent prompts).

### core-4.13 — Versioned-context drifts across consumer boundaries (active)

**Date observed:** April 22, 2026 (T625 Attempt 1).

**Signature:** A context artifact (constitution, catalogue, prompt file, configuration) is updated in one location but the consumer reads a different location that points at a stale snapshot. Classic cases: git submodule pointing at an older commit; Docker image baked before the update; cached remote fetch that didn't invalidate; deployed-to-prod copy that wasn't redeployed after a source change. The update was real in the source-of-truth repo, but the consumer's effective view is still pre-update — so instructions authored for the post-update state collide with behavior governed by the pre-update state.

**Why it happens:** Versioned-config-file drift is a general infrastructure pattern that constitution-and-checklist systems are structurally exposed to. The constitution lives in a source-of-truth repo; consumers (subrepos, submodule checkouts, deployed images, cached fetches) read via a pointer that doesn't always auto-advance. Agents read whatever their consumer pointer resolves to, not whatever the source-of-truth's HEAD contains.

**Structural countermeasure — two forms:**

1. **Dissolve the propagation boundary when possible.** The long-term fix is architectural: eliminate the propagation chain so there's one source and one consumer, with updates atomic by construction. Monorepo collapse of a submodule consumer is the canonical example. Applies widely when possible.
2. **Version-check at consumer boot (interim defense).** Every agent invocation, as part of its startup, hashes the constitution / config content it actually loaded and compares against an expected hash committed in the source-of-truth repo. Mismatch → agent refuses to proceed and emits a `constitution_version_drift_detected` signal naming the expected hash, actual hash, and consumer path. Fails loudly rather than silently operating against a stale version. Cost: one hash comparison at boot. Benefit: constitution updates can't quietly not-reach a consumer.

**Canonical instance:** T625 Attempt 1 (April 22, 2026). The platform's CLAUDE.md had been updated with the new unverified-is-Failed rule and the full pre-Success checklist. The app-builder loop read its constitution from `dev/CLAUDE.md`, which lived in a git submodule. The submodule pointer hadn't been bumped, so the app-builder was still operating against the pre-update 7-point checklist. T625's first attempt produced a fabricated `Result: Success` (Sub-signature B of core-4.11) because the builder was applying the old checklist. Post-submodule-bump, ~3 minutes later, the same builder produced honest `Result: Failed` with diagnostic-rich log — correct behavior from the same agent the moment it could see the updated constitution.

**Related:** core-4.12 (context-artifact variant); [`3-constitution.md`](3-constitution.md) core-3.6 (one constitution, many projections — generator-based projection removes the propagation boundary).

## The underlying pattern

Every failure in this catalogue is a manifestation of the same structural weakness: the agent optimizes for local task success at the expense of global system invariants, and if the invariants are stated but not mechanically enforced, the optimization will find the path of least resistance through them. The agent is not being malicious or lazy — it is doing exactly what optimization pressure produces given the enforcement available. This is why core-3.1 (mechanical enforcement, not instruction-requested) is foundational.

Failures 4.1–4.11 are about agent behavior under optimization pressure. Failures 4.12 and 4.13 extend the pattern beyond "the agent's behavior" to "the context the agent operates in" — agents can only respect invariants they can see and attend to, so context-artifact shape (#12) and context-version integrity (#13) are themselves structural infrastructure, not operational details.

Every entry generates reviewer-detection patterns (see [`5-reviewer-patterns.md`](5-reviewer-patterns.md)) and corresponds to items on the pre-Success checklist in [`3-constitution.md`](3-constitution.md). The three-layer defense — builder self-check, reviewer double-check, mechanical gate enforcement — operates on the same set of signatures at each layer.

## Adding entries

New failure classes are added to this catalogue whenever a novel pattern surfaces in production operation. Criteria for a new entry:

- The failure has a specific signature that a reviewer or mechanical check could detect.
- At least one canonical instance exists (not just a hypothetical concern).
- The root cause is distinct from existing entries (not a subset or restatement).
- A structural countermeasure can be named, even if not yet implemented.

Proposed entries start as signals (see [`10-signal-system.md`](10-signal-system.md)) and graduate to catalogue entries after reviewer or human confirmation that the pattern meets the criteria above. The catalogue is append-only per the overview discipline.
