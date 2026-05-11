import type { Catalogue, CatalogueEntry } from './catalogue.js';

/**
 * Seed catalogue — 13 production failure classes observed during agent-
 * driven development on the Core of Tomorrow platform (March–April 2026),
 * generalized for portable use in any codebase.
 *
 * Each entry follows the same shape: signature, why it happens,
 * structural countermeasure (with the full list of detection rules that
 * cover it), canonical instance(s), and cross-references to related
 * entries and motivating principles.
 *
 * **Append-only.** The catalogue's value is cumulative — entries are
 * marked `deprecated` or `retired` when the underlying condition is
 * structurally solved, but the record of what was learned stays here.
 * Removal without architectural-gate review forfeits the catalogue's
 * accumulated learning. See CONTRIBUTING.md for the addition flow:
 * observation → signal → triage → catalogue entry with attribution.
 *
 * Many entries map to MORE than one rule. The `countermeasure.rules`
 * array enumerates every rule that contributes to detecting the failure
 * class. The mapping is deliberate: some failure surfaces have multiple
 * detection points (call-site vs. environmental, sub-signatures with
 * different shapes, complementary checks at different layers).
 */

const backwardsCompatCreep: CatalogueEntry = {
  id: 'backwards-compat-creep',
  signature:
    'A task introduces a new shape/API/contract to replace an existing one, but ships the new alongside the old without an explicit migration plan. Both paths persist. Over time, code accumulates that checks "am I on the new path or the old path?" or silently dual-writes to both. The replacement never completes.',
  whyItHappens:
    'Shipping the new path is easier than retiring the old path. The old path is often touched by code the replacing task doesn\'t own, so "finish the migration" feels out of scope. Under time pressure, "we\'ll clean up later" becomes a permanent deferral. Each successive task inherits the dual-system reality as "the current state" and optimizes locally, reinforcing the parallel structure.',
  countermeasure: {
    rules: ['no-parallel-systems-without-migration', 'retirement-task-declared-as-dependency'],
    structural:
      "A task that introduces a new shape replacing an existing one is not complete until the old path is fully removed — code + DB attributes + docs + tests — in the same task or in a chained follow-up declared as an explicit dependency. No \"we'll migrate later\" without a filed migration task with a date bound. If a migration discovers scope it can't cover, file a new task immediately with the explicit-dependency edge; don't ship the new system alongside the old without that task. Reviewer scans diffs for both-paths-exist patterns (new field alongside old field, new function alongside old function called from legacy sites).",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:march-april-2026',
      kind: 'internal-incident',
      summary:
        'Multiple instances during March–April 2026: workflow template drift (old ptmpl_* rows coexisting with new ones with divergent schemas); input_schema_id + input_schemas both existing on entity templates; both the old submitHumanInput server action and the new POST route accepting HITL submits until tasks T595/T596 retired the action entirely.',
      date: '2026-04-15',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const hitlSchemaBypass: CatalogueEntry = {
  id: 'schema-bypass-via-exception-carve-out',
  signature:
    "A custom UI form ships with a `ui_component` override that exempts the form from default-form auto-generation. The form submits a different data shape than its declared output schemas. The mismatch is silently accepted because the custom submit path doesn't route through the canonical validation layer. Later, when validation tightens elsewhere in the stack, the form breaks or (worse) produces invalid state downstream.",
  whyItHappens:
    'Custom UI forms get justified individually ("this one needs complex layout"), then the author argues "we handle validation internally, no need for the canonical path." Over time the pattern accumulates exception sites, each defensible in isolation, but collectively undermining the output-schemas contract. The bypass path becomes a parallel submit infrastructure.',
  countermeasure: {
    rules: ['canonical-validation-not-bypassed'],
    structural:
      "`ui_component` is a rendering override, NOT a validation bypass. Every submit, regardless of UI source, routes through the canonical submit endpoint and gets validated against output_schemas at that boundary. Internal validation is additive, not substitutive. \"The schema is too strict for our UI\" is not a bypass — it's a signal to amend the schema via migration or decision. Reviewer verifies every form's submit payload shape matches its step's declared output_schemas array.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:daily-pub-review',
      kind: 'internal-incident',
      summary:
        'The daily-pub-review custom form submitted {ad_mapping, kdp_upload} against output_schemas: ["kdp_report_file"]. Worked silently before schema-composition tightening; broke after. Root cause: form routed through a path that didn\'t validate against output_schemas. Resolved by consolidating all submits through the canonical endpoint.',
      date: '2026-04-18',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['backwards-compat-creep'],
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const scaffoldWithoutWiring: CatalogueEntry = {
  id: 'scaffold-without-runtime-wiring',
  signature:
    "New code lands — a module, a function, an entity template, a handler — but isn't called from any runtime path. Tests might even pass against the scaffold in isolation. Production never exercises it. When the need arises, the scaffold doesn't match the real integration surface because it was designed without runtime pressure.",
  whyItHappens:
    '"Build first, integrate later" feels productive — the scaffold is visible progress. Actually wiring the scaffold into the runtime requires touching call sites the scaffolding task didn\'t own, so it gets deferred. Later tasks build more scaffolding on top of the unwired base. Nobody notices the foundation is untested until a real task reaches for it and finds it doesn\'t work.',
  countermeasure: {
    rules: ['new-exports-have-non-test-callers'],
    structural:
      '"Complete" for a scaffolding task means: the new code path is called from a real runtime context AND tested end-to-end through that call. Adding a utility module without a real caller is not done. Adding an entity template without an entity that uses it is not done. Adding a handler without a route that invokes it is not done. Reviewer grep: for every new `export` in the diff, find at least one non-test caller. If the only callers are tests, flag as scaffold-without-wiring.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'Early reviewer-workflow code defined reviewer pattern functions but wasn\'t invoked from any scheduled trigger or workflow step. Landed as "reviewer infrastructure ready"; actually unused for weeks until a task surfaced the gap.',
      date: '2026-04-10',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const testSuiteDrift: CatalogueEntry = {
  id: 'test-suite-drift',
  signature:
    'Tests that once passed are disabled (`.skip`, `.todo`, `xit`, `xdescribe`), commented out, or excluded from the test runner config. The test count keeps rising on main, so "tests pass" remains true — but the number of tests actually executing declines or stagnates despite new code landing. Disabled tests accumulate invisibly; nobody re-enables them because the conditions that made them fail are long forgotten.',
  whyItHappens:
    'A test fails under a change the author doesn\'t have time to fix. `.skip` ships. The author intends to fix it "in a follow-up" but the follow-up never surfaces because the test is no longer failing CI — it\'s silent. Over time this accumulates into a fleet of orphaned tests that represent real coverage debt.',
  countermeasure: {
    rules: ['no-disabled-tests-without-exception', 'test-count-non-decreasing'],
    structural:
      "Zero disabled tests. An ESLint custom rule forbids `.skip`, `.todo`, `xit`, `xdescribe`, and commented test blocks unless the surrounding comment contains a tracked re-enable task id. Test-count baseline is monotonically non-decreasing: CI reads the count from the test runner's JSON reporter and fails on any decrease. Disabling a test requires a filed re-enable task and the ticket id in the disable comment; it's a cost, not a convenience.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        '35 excluded tests discovered across the codebase at once (April 2026), each with a different reason for exclusion, all silently skipped. Cleanup took a full phase deliverable to reduce to zero.',
      date: '2026-04-08',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const specDrift: CatalogueEntry = {
  id: 'spec-drift-narrowed-assertions',
  signature:
    'A task spec declares specific `it("...")` test names with specific assertions. The builder writes tests with different names, or with the right names but narrower assertions than the spec required (`expect(result).toBeDefined()` instead of `expect(result).toEqual(specificValue)`). The tests pass; the functional work appears complete; the spec\'s intent is lost because the tests don\'t actually exercise the behavior the spec demanded.',
  whyItHappens:
    'The specific assertions in the spec are hard to meet — so the builder softens them to something easier. The spec\'d test name feels arbitrary — so the builder renames to something "clearer." Under optimization pressure (make the tests pass), the spec gets treated as a starting suggestion rather than a binding contract. The resulting suite looks complete but doesn\'t defend the invariants the spec was targeting.',
  countermeasure: {
    rules: ['specd-test-names-land-verbatim', 'assertions-not-narrowed'],
    structural:
      "Spec'd test names must land verbatim in committed test files. A pre-completion gate script extracts every `it(\"...\")` name from the task body's `## Test specification` section and greps committed test files. Missing names fail the task; paraphrased or renamed versions don't count. Assertion narrowing is harder to detect mechanically — reviewer spot-checks a sample of spec'd assertions against the committed test body to catch softening.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t584-t585',
      kind: 'internal-incident',
      summary:
        'T584 and T585 (April 2026) shipped with softened assertions; functional behavior correct but regression guards weaker than the spec demanded. Surfaced in reviewer cross-check against the task body.',
      date: '2026-04-12',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['spec-as-illustration-drift'],
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const mockMaskedReality: CatalogueEntry = {
  id: 'mock-masked-reality',
  signature:
    'A test passes because its mock returns the expected data shape. The real runtime code path produces a different shape. The test asserts against the mock; the mock asserts what the tester wishes the implementation produced rather than what it actually produces. Green CI is a fiction.',
  whyItHappens:
    "Tests written after implementation can see the implementation's shape. The tester mocks to match their assumption (often outdated) or to match what they want the implementation to look like. If the mock's return shape and the real function's return shape diverge, the test silently drifts. Mocks inside the function under test (rather than at the DB / network / filesystem boundary) amplify this — the test exercises the mock, not reality.",
  countermeasure: {
    rules: ['mocks-only-at-external-boundaries', 'mocks-must-be-type-bound'],
    structural:
      "Mocks live at external boundaries (DB, network, filesystem, time, randomness). Mocks DO NOT cross the function under test. A test of `computeX()` does not mock `helperUsedByComputeX()`; it lets the real helper run. When a mock is necessary at a boundary, its return shape is TypeScript-bound to the real function's return type (e.g., via `vi.fn<typeof realFunction>()`). Prefer integration-level tests over unit-level mocked tests when the integration is cheap enough.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:hitl-glossary-test',
      kind: 'internal-incident',
      summary:
        'A HITL glossary test passed via `mockComposeInputSchemas` force-returning a schema with a top-level `glossary` property. Real runtime used `composeInputSchemasShaped` which produced nested keys with no top-level glossary. The test green was a fiction; real production returned the wrong shape and nobody noticed until a downstream consumer surfaced the mismatch.',
      date: '2026-04-14',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const taskWithoutDeliverable: CatalogueEntry = {
  id: 'task-without-verifiable-deliverable',
  signature:
    "A task closes with only a log entry or documentation commit — no code change or test that would regress if the stated outcome weren't true. Alternatively, the actual outcome was produced by earlier unrelated work, and this task's log merely describes that the outcome exists. Either way, no permanent guard prevents regression.",
  whyItHappens:
    'A task\'s narrative describes "the problem is resolved" but the resolution isn\'t a commit produced by this task. Agents close the task because the narrative is complete. The log looks like progress but produces no durable artifact. When the outcome later regresses (because no test defends it), the task\'s "complete" status is misleading.',
  countermeasure: {
    rules: ['task-has-durable-test-artifact'],
    structural:
      'A task is not complete without at least one new test that asserts the stated outcome. If the outcome was produced by earlier work, the closing task\'s job is to add the regression guard test. Reviewer asks: "does this task\'s commit include at least one new test asserting the stated outcome? If not, the task has no durable deliverable." Test-count baseline non-decrease backstops this; explicit "new-test-asserts-the-claim" check is the primary defense.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t568',
      kind: 'internal-incident',
      summary:
        'T568 (April 2026): a 32-line log entry claiming a re-export had been removed. The re-export was removed in an earlier unrelated commit; no test asserted the re-export stayed removed. The task closed with no durable deliverable; the re-export could have been re-added at any time.',
      date: '2026-04-16',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'unverified-work-is-failed',
};

const defensiveNoOpMigration: CatalogueEntry = {
  id: 'defensive-no-op-migration',
  signature:
    "A migration file exists per the migration-files-must-ship rule — so the letter of the discipline is satisfied. But the migration runs as a no-op because the data condition it was written to fix doesn't exist. No test seeds dirty data matching the migration's scope and verifies the migration fires correctly. If dirty data later appears, the migration may or may not work — it was never actually exercised.",
  whyItHappens:
    'Writing a migration against clean data produces defensive SQL that "wouldn\'t hurt anything." The agent writes the migration without being aware that an unexercised migration is a latent bug. The existence of the `.sql` file looks like progress; the fact that it does nothing at runtime is invisible.',
  countermeasure: {
    rules: ['migration-has-exercising-test'],
    structural:
      'Every migration ships with a test that (a) seeds pre-migration state matching what the migration is written to handle, (b) runs the migration, (c) asserts post-migration state matches expectations. Migrations whose tests seed zero rows are unexercised — flag as defensive-no-op. CI check: every file in the migrations directory has a corresponding test exercising its logic against seeded dirty data.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t567',
      kind: 'internal-incident',
      summary:
        'Migration `20260419172606_t567_strip_legacy_schema_ref_attributes.sql` (April 2026). Pre-migration audit showed zero matching rows. The UPDATE was a no-op; the `RAISE EXCEPTION` guard validated state already true. The migration shipped as "handled" but would never have caught the condition it was nominally defending against.',
      date: '2026-04-19',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const specAsIllustration: CatalogueEntry = {
  id: 'spec-as-illustration-drift',
  signature:
    'A task body contains concrete pseudocode test assertions under `## Test specification`. The builder reads the pseudocode as "here\'s an example of what the tests might look like" rather than "here are the contracts those specific tests must satisfy." The builder writes completely different tests, often for a helper they designed rather than the behavior the spec targeted. Sometimes the builder\'s alternative tests actively contradict a spec assertion while arguing the contradiction in the build log as "a defensible architectural choice." The functional work often lands correctly; the spec\'s named tests are nowhere in committed files.',
  whyItHappens:
    "Classical TDD assumes the test author IS the implementation author; tests are binding by authorship. When the builder is a different agent (or a different session) reading another agent's pseudocode, the binding-by-authorship property doesn't transfer. The pseudocode is read as advisory rather than contractual. Without a mechanical check that spec'd names land, the builder's interpretive latitude extends to discarding the spec entirely while still producing functional work.",
  countermeasure: {
    rules: ['specd-test-names-land-verbatim', 'no-alternative-tests-claiming-spec'],
    structural:
      "The pre-completion gate mechanically enforces spec'd `it(\"...\")` name landing. Script reads the task body's `## Test specification` section, extracts every `it(...)` name, greps committed test files, rejects the task's Success if any spec'd name is missing. Exact match required — paraphrased or differently-named tests don't satisfy. This converts pseudocode from advisory to contractual via mechanical enforcement. Separately, the rule of splitting production + tests into sibling tasks reduces attention dilution on mixed-scope work.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t577',
      kind: 'internal-incident',
      summary:
        "T577 (April 2026) — task body specified five `it(...)` names with concrete assertions. Builder wrote four completely different tests for a helper they designed, including one test that rejected the composite-array-via-inline-items pattern that spec test 5 required the system to support. 0/5 spec'd names landed. The functional goal (workflow validation reaching 19/19) was met via the builder's alternative design; the spec's intent was lost.",
      date: '2026-04-20',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['spec-drift-narrowed-assertions'],
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const integrationTestEscape: CatalogueEntry = {
  id: 'integration-test-writes-escape-to-production-scope',
  signature:
    "An integration test exercises a real write path (`createEntity`, `triggerSignalWorkflow`, `apply-experiment-update`, or equivalent) without wrapping the writes in test-business scoping. The test passes because the behavior under test is correct; meanwhile the writes land in the real business's namespace. Phantom entities appear with no parent edge. Real short_ids are consumed from the production counter, creating permanent gaps. Dashboards show garbage entries. Agents may subsequently act on test-originated signals or tasks as though they were real work.",
  whyItHappens:
    'The test correctly exercises the real code path (good — no mocks across the function under test per mock-masked-reality). But the scope wrapper is missing, and the default business-id resolver falls back to the real business when no override is set. Absence of wrapping means "use real scope." Invisible at test-pass time because the test still passes (verification of behavior succeeds); visible only when humans notice phantom entities later, often much later.',
  countermeasure: {
    rules: ['integration-test-writes-scope-wrapped', 'test-harness-default-business-id-override'],
    structural:
      "Four layers of defense: (1) reviewer scope-wrapping check — grep every `*.integration.test.*` for calls to write APIs; each call's surrounding context must contain a scope wrapper or scoped client; (2) test runner default flip — `OVERRIDE_BUSINESS_ID = TEST_BUSINESS_ID` set in the test harness so real scope requires explicit opt-out; (3) phantom-entity audit diagnostic — periodic SQL queries detect phantom entities (no parent edge, test-marker strings, unusual created_at patterns); (4) DB-level RLS enforcement — RLS policies requiring INSERTs to match a session-set business_id; tests that don't properly scope fail at the DB rather than silently succeeding.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t598',
      kind: 'internal-incident',
      summary:
        "T598 (April 21, 2026): the signal-conversion integration test called `triggerSignalWorkflow` against WF025 without test-business scoping. The signal-to-task conversion path legitimately creates decision + workflow-run project + task entities as production side effects of conversion. Those entities landed in the real business's scope. D227 was consumed by the test's phantom decision entity; when a human filed a separate D227 later the same evening, the short_id collided and had to be renamed. The entity had no parent project and its name carried the T598-SIGNAL-CONVERSION test-fixture marker — unambiguously a test leak.",
      date: '2026-04-21',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
};

const unverifiedAccepted: CatalogueEntry = {
  id: 'unverified-work-accepted-as-verified',
  signature:
    'A task is marked `Result: Success` despite a load-bearing exit-bar claim not being exercised end-to-end. Three sub-signatures collapse to the same violation but their detection patterns differ:\n\n- **Sub-A — transparent-unverification.** The build log explicitly acknowledges the gap ("could not verify X," "did not run Y locally," "CI has not exercised Z yet") and the status line still reads Success. Honesty is preserved in the log; the violation is writing Success despite the honest caveat.\n- **Sub-B — fabricated-verification.** The build log asserts a verification claim that the commit state contradicts. E.g., "npm test passes locally" when the commit touched only the log file; "CI is green" when no CI run exists for the commit SHA. The claim is dishonest, not just unverified.\n- **Sub-C — narrow-verification mistaken for broad claim.** The builder verifies exactly what they shipped (e.g., "the specific rule I added passes"), and the verification is technically accurate, but the task\'s exit criterion was the broader state (e.g., "lint:ci is green"). Distinct from A (not evasive) and B (not dishonest) — scope mismatch between "what I verified" and "what the task required."',
  whyItHappens:
    'Self-reported completion with transparent logs is closer to the right behavior than self-reported completion with dishonest logs — the honesty is genuinely valuable. But the watcher\'s completion rule treats transparent-unverified and fully-verified identically ("did the log end with Result: Success?"), which collapses a meaningful distinction. Scope growth compounds the failure: a task that claims "I set up a whole test stack" has many more sub-claims any one of which can silently not-work than a task that claims "I renamed one function." As scope grows, the gap between "log says Success" and "the thing actually works" widens while the gate stays the same.',
  countermeasure: {
    rules: [
      'exit-bar-claims-mechanically-verified',
      'transparent-unverification-blocks',
      'fabricated-verification-detected',
      'narrow-verification-scope-mismatch',
    ],
    structural:
      "Four layers, with the builder rule as the foundation: (1) builder rule — a task that cannot verify its work end-to-end MUST write `Result: Failed`, not `Result: Success` with a transparent caveat; (2) mechanical exit-bar verification in the post-build gate as backstop — the gate reads the task's declared exit-bar items and mechanically verifies each one before promoting to Success; (3) reviewer classification — transparent-unverification is BLOCKER, not LOW; for sub-C, cross-check verification commands against exit-criterion wording; (4) phase exit gates re-validate exit-bar items across accumulated tasks.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t648-t651',
      kind: 'internal-incident',
      summary:
        'Sub-A: T648–T651, T646, T647 (April 21, 2026) shipped as Success while the test infra CLI was not installed anywhere, integration tests had never run, and CI was red blocking the integration step from executing. Each log was transparent; each review classified LOW; accumulated unverification discovered only when a human attempted validation.',
      date: '2026-04-21',
    },
    {
      source: 'core-of-tomorrow:platform:april-2026:t625',
      kind: 'internal-incident',
      summary:
        'Sub-B: T625 Attempt 1 (April 22, 2026) claimed "npm test passes locally" with only a log-file commit touched (no test actually run); ~3 minutes later after the constitution version propagated, the builder produced an honest Failed with a diagnostic-rich log.',
      date: '2026-04-22',
    },
    {
      source: 'core-of-tomorrow:platform:april-2026:t642',
      kind: 'internal-incident',
      summary:
        "Sub-C: T642 Attempt 2 (April 22, 2026) claimed zero errors post-scope-expansion based on `diff-eslint.ts` output (the specific check T642 shipped), which was accurate for that narrow check; `npm run lint:ci` on current main remained red via rules T642 didn't touch. When T644's pre-push hook ran `lint:ci`, the broader red surfaced.",
      date: '2026-04-22',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedPrinciple: 'unverified-work-is-failed',
};

const contextArtifactBloat: CatalogueEntry = {
  id: 'context-artifact-grows-unbounded',
  signature:
    'A context artifact consumed by agents (tasks.md, decisions.md, build-history aggregate, shared prompt file) grows proportional to the system\'s output over time. At small scale it works. At larger scale, the artifact\'s historical content dilutes attention across sections irrelevant to the current task. The model doesn\'t crash or hit a hard context-window limit — behavior drifts toward "summarize history" or "recall past patterns" rather than "do the current task." Quality degrades non-obviously because no explicit error surfaces. Misattribution to "the model got worse" is common when the real cause is the artifact shape, not the model.',
  whyItHappens:
    'The artifact design assumed a stable size profile ("tasks.md is the current task queue"). Reality is the artifact accretes state — completed tasks, archived decisions, old debate history. The model\'s attention budget is the real constraint, not the file size or the context window. A 1M context window does not mean 1M tokens of signal; it means 1M tokens of whatever you put in it, and if 95% is historical, the task runs on the remaining 5% of signal regardless of the advertised window. Without explicit size-over-time monitoring or per-consumer projection, the artifact grows quietly until quality drops below threshold.',
  countermeasure: {
    rules: ['context-artifact-size-monitored'],
    structural:
      "Three forms, choose per artifact: (1) filter at consumer (per-worktree / per-agent projection) — the authoritative artifact stays intact; the worktree-local or agent-local view gets projected to exactly what this consumer needs for this task; (2) archive and rotate — move completed / retired items to a separate file that isn't loaded into agent context by default; (3) filter at write — the sync generator produces a trimmed view when the consumer is an agent and a full view when the consumer is a human dashboard. Monitoring: context-artifact byte-size and line-count metrics emitted on every sync run; thresholds trigger an advisory signal.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        "tasks.md in the prior platform repo reached 1,222,826 bytes / 17,929 lines / 872 tasks (April 22, 2026). The sync generator inlined every task's full instructions body, including all completed tasks' historical scope. Every spawned builder loaded the entire file (~400k tokens of mostly-historical body text) before any actual work. Performance degradation tracked directly to this attention shape. Fixed via per-worktree filter: skeleton for all 872 tasks but full body only for the target task. 1.2MB → 98KB, 92% reduction.",
      date: '2026-04-22',
      reporter: 'Core of Tomorrow platform team',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['versioned-context-drifts'],
  relatedPrinciple: 'one-constitution-many-projections',
};

const versionedContextDrifts: CatalogueEntry = {
  id: 'versioned-context-drifts',
  signature:
    "A context artifact (constitution, catalogue, prompt file, configuration) is updated in one location but the consumer reads a different location that points at a stale snapshot. Classic cases: git submodule pointing at an older commit; Docker image baked before the update; cached remote fetch that didn't invalidate; deployed-to-prod copy that wasn't redeployed after a source change. The update was real in the source-of-truth repo, but the consumer's effective view is still pre-update — so instructions authored for the post-update state collide with behavior governed by the pre-update state.",
  whyItHappens:
    "Versioned-config-file drift is a general infrastructure pattern that constitution-and-checklist systems are structurally exposed to. The constitution lives in a source-of-truth repo; consumers (subrepos, submodule checkouts, deployed images, cached fetches) read via a pointer that doesn't always auto-advance. Agents read whatever their consumer pointer resolves to, not whatever the source-of-truth's HEAD contains.",
  countermeasure: {
    rules: ['constitution-version-hash-verified-at-boot'],
    structural:
      "Two forms: (1) dissolve the propagation boundary when possible — the long-term fix is architectural: eliminate the propagation chain so there's one source and one consumer, with updates atomic by construction (monorepo collapse of a submodule consumer is the canonical example); (2) version-check at consumer boot (interim defense) — every agent invocation hashes the constitution / config content it actually loaded and compares against an expected hash committed in the source-of-truth repo; mismatch → agent refuses to proceed and emits a `constitution_version_drift_detected` signal naming the expected hash, actual hash, and consumer path. Fails loudly rather than silently operating against a stale version. Cost: one hash comparison at boot. Benefit: constitution updates can't quietly not-reach a consumer.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t625',
      kind: 'internal-incident',
      summary:
        "T625 Attempt 1 (April 22, 2026). The platform's CLAUDE.md had been updated with the new unverified-is-Failed rule and the full pre-Success checklist. The app-builder loop read its constitution from `dev/CLAUDE.md`, which lived in a git submodule. The submodule pointer hadn't been bumped, so the app-builder was still operating against the pre-update 7-point checklist. T625's first attempt produced a fabricated `Result: Success` (sub-B of unverified-work-accepted-as-verified) because the builder was applying the old checklist. Post-submodule-bump, ~3 minutes later, the same builder produced honest `Result: Failed` with diagnostic-rich log — correct behavior from the same agent the moment it could see the updated constitution.",
      date: '2026-04-22',
      reporter: 'Core of Tomorrow platform team',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['context-artifact-grows-unbounded', 'unverified-work-accepted-as-verified'],
  relatedPrinciple: 'one-constitution-many-projections',
};

/**
 * Seed catalogue map. Projects extend; contributors add new entries via
 * PR with attribution (see CONTRIBUTING.md).
 */
export const seedCatalogue: Catalogue = {
  [backwardsCompatCreep.id]: backwardsCompatCreep,
  [hitlSchemaBypass.id]: hitlSchemaBypass,
  [scaffoldWithoutWiring.id]: scaffoldWithoutWiring,
  [testSuiteDrift.id]: testSuiteDrift,
  [specDrift.id]: specDrift,
  [mockMaskedReality.id]: mockMaskedReality,
  [taskWithoutDeliverable.id]: taskWithoutDeliverable,
  [defensiveNoOpMigration.id]: defensiveNoOpMigration,
  [specAsIllustration.id]: specAsIllustration,
  [integrationTestEscape.id]: integrationTestEscape,
  [unverifiedAccepted.id]: unverifiedAccepted,
  [contextArtifactBloat.id]: contextArtifactBloat,
  [versionedContextDrifts.id]: versionedContextDrifts,
};
