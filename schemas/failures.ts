import type { Catalogue, CatalogueEntry } from './catalogue.js';

/**
 * Seed catalogue — 13 failure classes observed in production at Core of Tomorrow
 * (March–April 2026), generalized for portable use in any codebase.
 *
 * Each entry's `observedInstances` cites the originating internal context as
 * "internal-incident" kind. As contributors observe these patterns in their
 * own codebases, additional public-source instances accumulate per entry.
 *
 * The 13 here are NOT exhaustive — they're the seed. The contribution flow
 * (CONTRIBUTING.md) describes how to add more.
 */

const backwardsCompatCreep: CatalogueEntry = {
  id: 'backwards-compat-creep',
  signature:
    'New shape/API/contract added alongside existing one without an explicit migration plan. Both paths persist; code accumulates that checks "am I on new or old" or silently dual-writes.',
  whyItHappens:
    'Shipping the new path is easier than retiring the old path. The old path is often touched by code the replacing task doesn\'t own. Under time pressure, "we\'ll clean up later" becomes a permanent deferral. Each successive task inherits the dual-system reality as "the current state" and optimizes locally, reinforcing the parallel structure.',
  countermeasure: {
    rules: ['no-parallel-systems-without-migration'],
    structural:
      'A task that introduces a new shape replacing an existing one is not complete until the old path is fully removed (code + DB attributes + docs + tests) in the same task or in a chained follow-up declared as an explicit dependency.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:march-april-2026',
      kind: 'internal-incident',
      summary:
        'Workflow template drift during April 2026: old ptmpl_* rows coexisting with new ones with divergent schemas; input_schema_id + input_schemas both existing on entity templates; old submitHumanInput server action and new POST route both accepting HITL submits.',
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
    "A custom UI form ships with a ui_component override that exempts the form from default-form auto-generation. The form submits a different data shape than its declared output schemas. The mismatch is silently accepted because the custom submit path doesn't route through canonical validation.",
  whyItHappens:
    'Custom UI forms get justified individually ("this one needs complex layout"), then the author argues "we handle validation internally, no need for the canonical path." Over time the pattern accumulates exception sites, each defensible in isolation, but collectively undermining the schema contract.',
  countermeasure: {
    rules: ['canonical-validation-not-bypassed'],
    structural:
      'A rendering override is not a validation bypass. Every submit, regardless of UI source, routes through the canonical submit endpoint and gets validated against output_schemas at that boundary.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:daily-pub-review',
      kind: 'internal-incident',
      summary:
        'Custom form submitted {ad_mapping, kdp_upload} against output_schemas: ["kdp_report_file"]. Worked silently before schema-composition tightening; broke after.',
      date: '2026-04-18',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['backwards-compat-creep'],
};

const scaffoldWithoutWiring: CatalogueEntry = {
  id: 'scaffold-without-runtime-wiring',
  signature:
    "New code lands — a module, a function, an entity template, a handler — but isn't called from any runtime path. Tests might even pass against the scaffold in isolation. Production never exercises it. When the need arises, the scaffold doesn't match the real integration surface because it was designed without runtime pressure.",
  whyItHappens:
    '"Build first, integrate later" feels productive — the scaffold is visible progress. Actually wiring requires touching call sites the scaffolding task didn\'t own, so it gets deferred. Later tasks build more scaffolding on top of the unwired base. Nobody notices the foundation is untested until a real task reaches for it and finds it doesn\'t work.',
  countermeasure: {
    rules: ['new-exports-have-non-test-callers'],
    structural:
      '"Complete" for a scaffolding task means: the new code path is called from a real runtime context AND tested end-to-end through that call.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'Early reviewer-workflow code defined reviewer pattern functions but wasn\'t invoked from any scheduled trigger or workflow step. Landed as "reviewer infrastructure ready"; actually unused for weeks.',
      date: '2026-04-10',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const testSuiteDrift: CatalogueEntry = {
  id: 'test-suite-drift',
  signature:
    'Tests that once passed are disabled (.skip, .todo, xit, xdescribe), commented out, or excluded from the test runner config. The test count keeps rising on main, so "tests pass" remains true — but the number of tests actually executing declines or stagnates despite new code landing. Disabled tests accumulate invisibly.',
  whyItHappens:
    'A test fails under a change the author doesn\'t have time to fix. .skip ships. The author intends to fix it "in a follow-up" but the follow-up never surfaces because the test is no longer failing CI — it\'s silent.',
  countermeasure: {
    rules: ['no-disabled-tests-without-exception', 'test-count-non-decreasing'],
    structural:
      'Zero disabled tests. Disabling a test requires a filed re-enable task and the ticket ID in the disable comment.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        '35 excluded tests discovered across the codebase at once (April 2026), each with a different reason for exclusion, all silently skipped.',
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
    'A task spec declares specific it("...") test names with specific assertions. The builder writes tests with different names, or with the right names but narrower assertions than the spec required. The tests pass; the functional work appears complete; the spec\'s intent is lost.',
  whyItHappens:
    "The specific assertions in the spec are hard to meet — so the builder softens them. The spec'd test name feels arbitrary — so the builder renames it. Under optimization pressure, the spec gets treated as a starting suggestion rather than a binding contract.",
  countermeasure: {
    rules: ['specd-test-names-land-verbatim', 'assertions-not-narrowed'],
    structural:
      "Spec'd test names must land verbatim. A pre-completion gate extracts names from the task's test specification section and greps committed test files. Missing names fail the task.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'T584 and T585 shipped with softened assertions; functional behavior correct but regression guards weaker than the spec demanded.',
      date: '2026-04-12',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['spec-as-illustration-drift'],
};

const mockMaskedReality: CatalogueEntry = {
  id: 'mock-masked-reality',
  signature:
    'A test passes because its mock returns the expected data shape. The real runtime code path produces a different shape. The test asserts against the mock; the mock asserts what the tester wishes the implementation produced rather than what it actually produces.',
  whyItHappens:
    "Tests written after implementation can see the implementation's shape. The tester mocks to match their assumption (often outdated) or to match what they want the implementation to look like. Mocks inside the function under test amplify this — the test exercises the mock, not reality.",
  countermeasure: {
    rules: ['mocks-only-at-external-boundaries', 'mocks-must-be-type-bound'],
    structural:
      'Mocks live at external boundaries (DB, network, filesystem, time, randomness). Mocks do not cross the function under test.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'A glossary test passed via mockComposeInputSchemas force-returning a schema with a top-level glossary property. Real runtime used composeInputSchemasShaped which produced nested keys with no top-level glossary. Green CI; production returned wrong shape.',
      date: '2026-04-14',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const taskWithoutDeliverable: CatalogueEntry = {
  id: 'task-without-verifiable-deliverable',
  signature:
    "A task closes with only a log entry or documentation commit — no code change or test that would regress if the stated outcome weren't true. The actual outcome was produced by earlier unrelated work; this task's log merely describes that the outcome exists. No permanent guard prevents regression.",
  whyItHappens:
    'A task\'s narrative describes "the problem is resolved" but the resolution isn\'t a commit produced by this task. Workers close the task because the narrative is complete. The log looks like progress but produces no durable artifact.',
  countermeasure: {
    rules: ['task-has-durable-test-artifact'],
    structural:
      "A task is not complete without at least one new test that asserts the stated outcome. If the outcome was produced by earlier work, the closing task's job is to add the regression guard test.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'T568 (April 2026): a 32-line log entry claiming a re-export had been removed. The re-export was removed in an earlier unrelated commit; no test asserted the re-export stayed removed.',
      date: '2026-04-16',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const defensiveNoOpMigration: CatalogueEntry = {
  id: 'defensive-no-op-migration',
  signature:
    "A migration file exists, so the letter of the discipline is satisfied. But the migration runs as a no-op because the data condition it was written to fix doesn't exist. No test seeds dirty data matching the migration's scope and verifies the migration fires correctly.",
  whyItHappens:
    'Writing a migration against clean data produces defensive SQL that "wouldn\'t hurt anything." The worker writes the migration without being aware that an unexercised migration is a latent bug. The existence of the .sql file looks like progress; the fact that it does nothing at runtime is invisible.',
  countermeasure: {
    rules: ['migration-has-exercising-test'],
    structural:
      'Every migration ships with a test that seeds pre-migration state matching what the migration is written to handle, runs the migration, and asserts post-migration state matches expectations.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t567',
      kind: 'internal-incident',
      summary:
        'Migration shipped with zero matching rows pre-condition; UPDATE was a no-op; the RAISE EXCEPTION guard validated state already true. Migration shipped as "handled" but would never have caught the condition it was nominally defending against.',
      date: '2026-04-19',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const specAsIllustration: CatalogueEntry = {
  id: 'spec-as-illustration-drift',
  signature:
    'A task body contains concrete pseudocode test assertions under a test specification section. The builder reads the pseudocode as "here\'s an example of what the tests might look like" rather than "here are the contracts those specific tests must satisfy." The builder writes completely different tests, often for a helper they designed. Sometimes the builder\'s alternative tests actively contradict a spec assertion.',
  whyItHappens:
    "Classical TDD assumes the test author IS the implementation author; tests are binding by authorship. When the builder is a different worker reading another worker's pseudocode, the binding-by-authorship property doesn't transfer. The pseudocode is read as advisory rather than contractual.",
  countermeasure: {
    rules: ['specd-test-names-land-verbatim'],
    structural:
      "Mechanical enforcement: extract every it(...) name from the task body's test specification section, grep committed test files, reject the task's Success if any spec'd name is missing. Exact match required.",
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t577',
      kind: 'internal-incident',
      summary:
        "Task body specified five it(...) names with concrete assertions. Builder wrote four completely different tests for a helper they designed, including one test that rejected the pattern that spec test 5 required the system to support. 0/5 spec'd names landed.",
      date: '2026-04-20',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['spec-drift-narrowed-assertions'],
};

const integrationTestEscape: CatalogueEntry = {
  id: 'integration-test-writes-escape-to-production-scope',
  signature:
    "An integration test exercises a real write path without wrapping the writes in test-business scoping. The test passes because the behavior under test is correct; meanwhile the writes land in the real business's namespace. Phantom entities appear with no parent edge. Real short IDs are consumed from the production counter.",
  whyItHappens:
    'The test correctly exercises the real code path (good — no mocks across the function under test). But the scope wrapper is missing, and the default business-id resolver falls back to the real business when no override is set. Absence of wrapping means "use real scope."',
  countermeasure: {
    rules: ['integration-test-writes-scope-wrapped'],
    structural:
      'Defense in depth: reviewer scope-wrapping check, test runner default flip (OVERRIDE_BUSINESS_ID set in harness), phantom-entity audit diagnostic, DB-level RLS enforcement.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t598',
      kind: 'internal-incident',
      summary:
        'Signal-conversion integration test called triggerSignalWorkflow against WF025 without test-business scoping. Decision + workflow-run project + task entities landed in real business scope. D227 consumed by phantom decision entity; later short ID collision.',
      date: '2026-04-21',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
};

const unverifiedAccepted: CatalogueEntry = {
  id: 'unverified-work-accepted-as-verified',
  signature:
    "A task is marked Result: Success despite a load-bearing exit-bar claim not being exercised end-to-end. Three sub-signatures: (A) transparent — log acknowledges the gap and status still reads Success; (B) fabricated — log asserts verification the commit state contradicts; (C) narrow — builder verified exactly what they shipped but the task's exit criterion was broader.",
  whyItHappens:
    'Self-reported completion with transparent logs is closer to right behavior than dishonest logs — the honesty is genuinely valuable. But the completion rule treats transparent-unverified and fully-verified identically, which collapses a meaningful distinction. As task scope grows, the gap between "log says Success" and "the thing actually works" widens.',
  countermeasure: {
    rules: ['exit-bar-claims-mechanically-verified', 'transparent-unverification-blocks'],
    structural:
      'Mechanical exit-bar verification in the post-build gate as backstop. Builder rule: unverified means Failed at write-time, not Success-with-caveat.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t648-t651',
      kind: 'internal-incident',
      summary:
        'T648–T651, T646, T647 shipped as Success while Supabase CLI was not installed anywhere, integration tests had never run, and CI was red. Each log was transparent; each review classified LOW; accumulated unverification discovered only when a human attempted validation.',
      date: '2026-04-21',
    },
    {
      source: 'core-of-tomorrow:platform:april-2026:t625',
      kind: 'internal-incident',
      summary:
        'T625 Attempt 1 claimed "npm test passes locally" with only a log-file commit touched. ~3 minutes later after constitution propagation, the builder produced honest Failed with diagnostic-rich log.',
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
    'A context artifact consumed by workers (shared task file, decisions registry, build-history aggregate) grows proportional to the system\'s output over time. At small scale it works. At larger scale, the artifact\'s historical content dilutes attention across sections irrelevant to the current task. The model doesn\'t crash; behavior drifts toward "summarize history" rather than "do the current task."',
  whyItHappens:
    "The artifact design assumed a stable size profile. Reality is the artifact accretes state — completed tasks, archived decisions, old debate history. The model's attention budget is the real constraint, not the file size or context window. A 1M context window does not mean 1M tokens of signal.",
  countermeasure: {
    rules: ['context-artifact-size-monitored'],
    structural:
      'Three forms of countermeasure: filter at consumer (per-worker projection), archive and rotate (move retired items elsewhere), or filter at write (sync generator produces trimmed view for workers, full view for human dashboards).',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026',
      kind: 'internal-incident',
      summary:
        'tasks.md reached 1,222,826 bytes / 17,929 lines / 872 tasks. Every spawned worker loaded the entire file (~400k tokens of mostly-historical body text) before any actual work. Performance degradation tracked directly to this attention shape. Fixed via per-worktree filter: 1.2MB → 98KB, 92% reduction.',
      date: '2026-04-22',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['versioned-context-drifts'],
};

const versionedContextDrifts: CatalogueEntry = {
  id: 'versioned-context-drifts',
  signature:
    "A context artifact (constitution, catalogue, prompt file, configuration) is updated in one location but the consumer reads a different location that points at a stale snapshot. Submodule pointing at older commit; Docker image baked before update; cached remote fetch that didn't invalidate. The update was real in the source-of-truth repo, but the consumer's effective view is still pre-update.",
  whyItHappens:
    "Versioned-config-file drift is a general infrastructure pattern that constitution systems are structurally exposed to. The constitution lives in a source-of-truth repo; consumers read via a pointer that doesn't always auto-advance.",
  countermeasure: {
    rules: ['constitution-version-hash-verified-at-boot'],
    structural:
      'Two forms: (1) dissolve the propagation boundary when possible (monorepo collapse); (2) version-check at consumer boot — hash the loaded constitution against an expected hash committed in the source-of-truth repo; mismatch → refuse to proceed.',
  },
  observedInstances: [
    {
      source: 'core-of-tomorrow:platform:april-2026:t625',
      kind: 'internal-incident',
      summary:
        "T625 Attempt 1: the platform's CLAUDE.md had been updated with new unverified-is-Failed rule. The app-builder read its constitution from a git submodule; the submodule pointer hadn't been bumped. T625 first attempt produced a fabricated Result: Success because the builder was applying the pre-update checklist. Post-submodule-bump, ~3 minutes later, same builder produced honest Result: Failed.",
      date: '2026-04-22',
    },
  ],
  addedDate: '2026-04-22',
  status: 'active',
  relatedEntries: ['context-artifact-grows-unbounded'],
};

/**
 * Seed catalogue map. Projects extend; contributors add new entries via PR
 * with attribution (see CONTRIBUTING.md).
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
