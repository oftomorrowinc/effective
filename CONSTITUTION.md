# Effective Constitution

This document is the human-readable projection of the recommended preset's active rule set. It is generated from rule definitions in `src/presets/` — do not edit directly. Run `pnpm docs:constitution` to regenerate.

Each section groups rules by purpose. Within each group, rules are sorted by id so the section anchors (`#<rule-id>`) are stable across regenerations. For freshness, see this file's git history.

## Foundation rules

Foundation rules don't reference a catalogue entry. They defend against general hygiene, security, and governance failure modes that apply across projects, and typically link to a `relatedPrinciple` rather than a specific observed pattern.

### exceptions.must-cite-justification

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** exceptions
- **Applies to roles:** all

**Summary.** Every escape hatch must cite a tracked exception id.

Suppression comments — c8 ignore, @ts-expect-error, eslint-disable, prettier-ignore — must include `exception-id: <id>` matching an entry in the config's `exceptions` field. Add a new exception (with category, context, retirement condition) rather than leaving a bare suppression.
---

### lane.editable-respected

- **Kind:** `lane`
- **Severity:** CRITICAL
- **Category:** lane
- **Applies to roles:** all

**Summary.** Diff stays inside the scope.editable lane.

Every changed file must match `scope.editable`. Files outside the lane — including deletions — fail this rule.
---

### no-hardcoded-secrets

- **Kind:** `pattern`
- **Severity:** CRITICAL
- **Category:** security
- **Applies to roles:** `code-writer`, `free-form`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** No hardcoded secrets, tokens, or API keys.

Credentials, OAuth tokens, JWTs, and high-entropy API keys (AWS, GitHub, Slack, Stripe, Google, Anthropic, and similar) must live in environment variables or a secret manager — never committed to source. The check matches known token shapes; matches in test files also fail (real-shaped tokens should never appear, even as fixtures — generate ephemeral test credentials or use clearly fake placeholders like `test-token-placeholder`).

_Bad:_

```ts
const apiKey = "sk-ant-api03-abc...";
```

_Good:_

```ts
const apiKey = process.env.ANTHROPIC_API_KEY;
```
---

### no-stray-debug-output

- **Kind:** `pattern`
- **Severity:** CRITICAL
- **Category:** hygiene
- **Applies to roles:** `code-writer`, `free-form`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** No stray debug output in production code.

Avoid `console.log` / `console.error` / `console.warn` / `console.debug` / `console.trace` / `console.info` and bare `debugger` statements in non-test source files. They are development scaffolding — ship them and they leak into production output, fill log aggregators, or worse, divulge internal state. Route real logging through the project logger; remove debug output before commit.

_Bad:_

```ts
console.log("got user", user);
```

_Good:_

```ts
logger.info({ userId: user.id }, "fetched user");
```
---

### protected-paths-respected

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** governance
- **Applies to roles:** all
- **Related principle:** `mechanical-enforcement-over-instruction`
- **Diff-only:** yes (skipped by `audit`)

**Summary.** Constitutional files are off-limits without elevation. Workers cannot edit the rules they are being held to.

The config's `protected` field declares paths that no worker scope may edit as part of its work. Typical protected paths include `effective.config.{ts,js}` itself (the constitution), lint/typecheck/test configs (they define what `verify` enforces), CI workflow files (the deployment gate), and any pre-commit hook configuration. If a case genuinely requires a constitutional change (e.g., registering a new exception, adjusting a rule's severity), surface that need through `kickBack` and stop — a reviewer or human with elevated scope makes the constitutional change separately, outside the worker loop. Distinct from the lane rule: lane authorizes which files a scope can touch; protected asserts which files NO scope touches without elevation. Both can fire on the same file (two reasons it's wrong, two findings to triage).

## Catalogue-driven rules

Catalogue-driven rules each defend against an observed adversarial-by-optimization pattern. See `schemas/failures.ts` for the catalogue entries themselves with provenance and observed instances.

### assertions-not-narrowed

- **Kind:** `spec`
- **Severity:** HIGH
- **Category:** spec-discipline
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `spec-drift-narrowed-assertions`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Assertions in committed tests are no weaker than the spec specifies.

A spec that says `expect(result).toEqual(specificValue)` must not be implemented as `expect(result).toBeDefined()`. Softening assertions to make a test pass produces a test that no longer defends the behavior the spec was protecting. If the spec's assertion is genuinely wrong, amend the spec; if the implementation can't meet the spec, that's a failed implementation, not a reason to relax the test.
---

### canonical-validation-not-bypassed

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** architecture
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `schema-bypass-via-exception-carve-out`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Every submit boundary routes through the canonical validation layer; UI overrides don't bypass validation.

A `ui_component` override is a rendering override, not a validation bypass. Every submit, regardless of UI source, routes through the canonical submit endpoint and gets validated against `output_schemas` at that boundary. "The schema is too strict for our UI" is not a bypass — it's a signal to amend the schema via migration or decision. Internal validation in the custom form is additive, not substitutive. The check verifies every HITL form's submit payload shape matches its step's declared `output_schemas` array.
---

### constitution-version-hash-verified-at-boot

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** governance
- **Applies to roles:** all
- **Catalogue entry:** `versioned-context-drifts`
- **Related principle:** `one-constitution-many-projections`

**Summary.** Every worker invocation verifies it loaded the expected constitution version at boot.

When the constitution lives in a source-of-truth repo and consumers read via pointers (submodule, Docker image, cached fetch), updates can silently not-reach a consumer. The fix: every worker invocation hashes the constitution content it actually loaded and compares against an expected hash committed in the source-of-truth repo. Mismatch → worker refuses to proceed and emits a `constitution_version_drift_detected` signal. The check verifies the worker startup path includes the hash comparison; absence means a stale constitution can quietly govern a worker without anyone noticing.
---

### context-artifact-size-monitored

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** governance
- **Applies to roles:** all
- **Catalogue entry:** `context-artifact-grows-unbounded`
- **Related principle:** `one-constitution-many-projections`

**Summary.** Context artifacts consumed by workers (tasks.md, decisions.md, shared prompts) are size-monitored and rotated.

Context window size is not attention budget. A 1MB tasks.md file filled 95% with historical content runs every spawned worker on 5% of signal, regardless of the model's advertised window. The check looks for context artifacts whose byte-size / line-count grew above a threshold without a corresponding filter-at-consumer, archive-and-rotate, or filter-at-write countermeasure landing in the same diff. Project-specific thresholds are configured in the rule's overrides; defaults are conservative.
---

### files-scoped-rule-overrides-cite-decision

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** governance
- **Applies to roles:** all
- **Catalogue entry:** `files-scoped-override-requires-cited-decision`
- **Related principle:** `blockage-is-communication`

**Summary.** Files-scoped `rules: { "...": "off" }` blocks in `eslint.config.*` cite a substantive decision short_id.

A per-file lint override is a tracked decision, not a local convenience. Every diff that adds or modifies a files-scoped `rules: {}` block in `eslint.config.*` must cite a decision short_id in the commit message or build log. The cited decision's body must name (a) the specific rule being allowlisted, (b) the scope (which files / patterns), (c) the rationale. A citation that points at a decision whose body is vague ("we needed this off for X") doesn't comply — the cited decision must be substantive. The check fetches the cited decision and matches against these three elements.

_Bad:_

```ts
files: ['src/legacy/**'], rules: { 'no-console': 'off' }  // no citation
```

_Good:_

```ts
files: ['src/legacy/**'], rules: { 'no-console': 'off' }
// commit: 'refactor: legacy/* sunset path -- core-D42: legacy-files-keep-console'
```
---

### integration-test-writes-scope-wrapped

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** data-discipline
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `integration-test-writes-escape-to-production-scope`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Integration tests that write to the database wrap writes in test-scope.

An integration test that exercises a real write path without wrapping writes in test-business scoping leaks phantom entities into the real namespace, consumes real short_ids, and pollutes dashboards. The wrapping is `runWithBusinessId(TEST_BUSINESS_ID, ...)` (or the project's equivalent) around every write call. The check greps `*.integration.test.*` files for write-API calls and confirms each call's surrounding context contains the scope wrapper. Writes without scoping evidence fail this rule.

_Bad:_

```ts
it('creates the entity', async () => { await createEntity({ ... }); });
```

_Good:_

```ts
it('creates the entity', async () => {
  await runWithBusinessId(TEST_BUSINESS_ID, async () => {
    await createEntity({ ... });
  });
});
```
---

### migration-has-exercising-test

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** data-discipline
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `defensive-no-op-migration`
- **Related principle:** `mechanical-enforcement-over-instruction`
- **Diff-only:** yes (skipped by `audit`)

**Summary.** Every new migration ships with a test that seeds dirty data, runs the migration, and asserts the post-migration state.

A migration written against clean data produces defensive SQL that "wouldn't hurt anything" but never actually fires against the condition it was nominally defending against. The migration's file exists; nothing is exercised. The test must (a) seed pre-migration state matching what the migration handles, (b) run the migration, (c) assert post-migration state matches expectations. The check pairs every file in the migrations directory with a corresponding test exercising its logic against seeded dirty data; migrations whose tests seed zero rows are flagged as defensive no-ops.
---

### mocks-must-be-type-bound

- **Kind:** `pattern`
- **Severity:** HIGH
- **Category:** tests
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `mock-masked-reality`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Mocks are TypeScript-bound to the real function's return type.

Untyped mocks let the mock's return shape drift from the real function's. When the implementation changes, the mock keeps returning the old shape and the test keeps passing — the green is a fiction. Bind every mock via `vi.fn<typeof realFunction>()` so TypeScript fails compilation when the shapes diverge.

_Bad:_

```ts
const fetchUser = vi.fn(); // unbound — accepts any return
```

_Good:_

```ts
const fetchUser = vi.fn<typeof realFetchUser>();
```
---

### mocks-only-at-external-boundaries

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** tests
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `mock-masked-reality`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Mocks live at the DB / network / filesystem boundary, not inside the function under test.

A test of `computeX()` does not mock `helperUsedByComputeX()` — it lets the real helper run. Mocks crossing the function under test exercise the mock, not reality, and produce green tests against fictions. Acceptable mock locations: DB clients, network calls, filesystem, time, randomness. Anywhere else, prefer integration-level tests over unit-level mocked tests.

_Bad:_

```ts
vi.mock("./helper"); // helper is used inside computeX()
const result = computeX();
```

_Good:_

```ts
vi.mock("pg"); // DB boundary
const result = computeX(); // real helperUsedByComputeX runs
```
---

### new-exports-have-non-test-callers

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** architecture
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `scaffold-without-runtime-wiring`
- **Related principle:** `mechanical-enforcement-over-instruction`
- **Diff-only:** yes (skipped by `audit`)

**Summary.** New exports are called from at least one non-test runtime path.

"Complete" for a scaffolding task means: the new code path is called from a real runtime context AND tested end-to-end through that call. Adding a utility module without a real caller is not done. Adding an entity template without an entity that uses it is not done. The check greps the codebase for every new `export` in the diff and confirms at least one non-test caller exists. Test-only callers don't count — scaffolding tested in isolation drifts away from the real integration surface because it was designed without runtime pressure.
---

### new-throws-checked-against-catcher-chain

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** governance
- **Applies to roles:** all
- **Catalogue entry:** `throw-swallowed-by-catch`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** New `throw` statements are checked against the caller chain for unrelated catches that would silently swallow them.

A `throw` in a function whose caller wraps it in `try { ... } catch (err) { /* no re-throw */ }` is silently intercepted. The throw exists in source but never reaches the layer designed to handle it. For every new `throw` in a diff, walk the caller chain to the nearest `try/catch` and confirm: (a) the catch is specifically typed to match the thrown error, OR (b) the catch explicitly re-throws / rethrows the new shape. A catch with `(err)` or `(err: unknown)` that doesn't re-throw is presumed to swallow.
---

### no-alternative-tests-claiming-spec

- **Kind:** `spec`
- **Severity:** HIGH
- **Category:** spec-discipline
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `spec-as-illustration-drift`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Tests not declared in the spec do not pretend to satisfy a spec contract.

When a task body declares a `## Test specification` with specific `it("...")` names, the builder may write additional helper tests but must not substitute them for the spec'd ones. An alternative test that claims to "cover the same behavior" without using the spec'd name is spec drift — the spec's contract is the named test, not a paraphrase. Write the spec'd tests verbatim; if the spec is wrong, file an amendment and stop, don't shadow it.
---

### no-disabled-tests-without-exception

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** tests
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `test-suite-drift`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** No `.skip` / `.todo` / `xit` / `xdescribe` on tests without a tracked exception.

A test that fails under a change must be fixed, not silenced. Disabling a test ships an invisible regression — CI stays green while the test that defended a behavior stops running. If a test genuinely cannot pass right now, register an exception under the config's `exceptions` field with a retirement condition naming when the test should be re-enabled, and cite the exception id in a comment on the same line as the disable or on the line directly above. The check accepts the citation as surface evidence; the `exceptions.must-cite-justification` rule separately validates that every cited id resolves to a real registry entry.

_Bad:_

```ts
it.skip('handles concurrent writes', () => { ... });
```

_Good:_

```ts
// exception-id: our-flaky-test-fix-in-progress
it.skip('handles concurrent writes', () => { ... });
```
---

### no-parallel-systems-without-migration

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** architecture
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `backwards-compat-creep`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** A new shape that replaces an existing one ships with the old removed, not alongside.

When a task introduces a new shape/API/contract to replace an existing one, the old path comes out — code + DB attributes + docs + tests — in the same task or in a chained follow-up declared as an explicit dependency. Shipping the new alongside the old leaves a parallel structure that subsequent tasks inherit as "the current state" and optimize against locally, reinforcing the dual-system reality. The check scans diffs for both-paths-exist patterns: new field alongside old field, new function alongside old function called from legacy sites.

_Bad:_

```ts
Diff adds `input_schemas` on entities but leaves `input_schema_id` populated and read by legacy code.
```

_Good:_

```ts
Diff adds `input_schemas` AND removes `input_schema_id` reads/writes, OR files a follow-up migration task as an explicit dependency with a date bound.
```
---

### no-wrapper-over-first-class-primitive

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** architecture
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `wrapper-over-first-class-primitive`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** New wrappers name a concrete behavior they add beyond the primitive they wrap.

Wrappers that mostly just delegate to existing first-class functionality balloon the API surface and obscure where behavior actually lives. For every new wrapper, the rationale must name a specific behavior the wrapper adds — "adds retry with backoff," "normalizes error shapes across two SDKs," "enforces business-id scoping at the call boundary." Vague rationales — "abstraction," "cleaner interface," "future-proofing," "consistency" — are flagged. If the rationale is vague, prefer calling the primitive directly.

_Bad:_

```ts
function withRetry(fn) { return fn(); } // "future-proofing"
```

_Good:_

```ts
function withRetry(fn, opts) { /* exponential backoff, jitter, max-attempts; adds real behavior */ }
```
---

### retirement-task-declared-as-dependency

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** architecture
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `backwards-compat-creep`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** If a parallel-systems landing is sanctioned during migration, a dated retirement task is declared as an explicit dependency.

Some replacements are too large for a single task. When that's the case, the parallel-systems landing is acceptable IF the diff also files (or references) a retirement task with: (a) a concrete scope describing what the old path looks like when fully removed, (b) an `etmpl_depends_on` edge on the introducing task, (c) a date bound. Without those three, the "migration" never lands. The check looks at the diff's task metadata for a referenced retirement task and rejects if absent.
---

### specd-test-names-land-verbatim

- **Kind:** `spec`
- **Severity:** CRITICAL
- **Category:** spec-discipline
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `spec-drift-narrowed-assertions`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Tests named in the spec appear verbatim as committed `it(...)` / `test(...)` calls.

When `scope.spec` references a spec document with a `## Test specification` section, every test name listed there must appear verbatim in a committed test file. Renamed, paraphrased, or substituted names don't count — the spec's contract is the exact name, not a near-match. Update the spec before the test if the wording needs to change; do not unilaterally rename in the test file.
---

### task-has-durable-test-artifact

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** tests
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `task-without-verifiable-deliverable`
- **Related principle:** `unverified-work-is-failed`

**Summary.** Every task ships at least one new or updated test that would regress if the claim it makes were wrong.

A log entry claiming "the problem is resolved" without a code change or test that defends the resolution is not a durable deliverable. The task can be reverted (or the outcome silently regress) at any time. If the outcome was already produced by earlier work, the closing task's job is to add the regression-guard test — that's the deliverable. The check looks at the diff for at least one added/modified test file; if none, the task fails this rule.
---

### test-count-non-decreasing

- **Kind:** `custom`
- **Severity:** CRITICAL
- **Category:** tests
- **Applies to roles:** `test-writer`, `code-writer`, `free-form`
- **Catalogue entry:** `test-suite-drift`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** The total test count never decreases across a diff.

Test count is a leading indicator of coverage. A diff that removes more tests than it adds is suspicious — either the deleted tests were redundant (in which case the diff should say so explicitly), or the diff is hiding behavior loss. The check reads the test count from the test runner's JSON reporter and fails on any decrease. Tracked deletions (with a retirement-condition reference) are accommodated; ad-hoc removals are not.
---

### test-harness-default-business-id-override

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** data-discipline
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `integration-test-writes-escape-to-production-scope`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** The test harness defaults to test-scope so unscoped writes fail safe rather than leaking.

Wrapping is a per-test defense; the harness-default is the project-wide safety net. Setting `OVERRIDE_BUSINESS_ID = TEST_BUSINESS_ID` (or the project's equivalent) in the test harness setup flips the default so tests that forget to wrap explicitly land in test scope. The check verifies the harness config sets this default; absence of the default means a missed scope wrapper silently leaks instead of failing safe.
---

### write-then-validate-makes-transaction-choice-explicit

- **Kind:** `custom`
- **Severity:** HIGH
- **Category:** data-discipline
- **Applies to roles:** `code-writer`, `free-form`
- **Catalogue entry:** `write-then-validate-without-transaction`
- **Related principle:** `mechanical-enforcement-over-instruction`

**Summary.** Write-then-validate sequences make the transaction choice explicit (wrap, validate-before-write, or log-and-signal).

A write followed by a refetch + validation, without transaction wrapping, is a structural risk: concurrent readers see post-write-pre-validation state, and a validation failure leaves the write committed. Three legitimate resolutions exist, choose one explicitly: (1) **transaction-wrap** — both operations inside a single transaction so validation failure rolls back the write; (2) **validate-before-write** — refactor so validation runs against candidate state before any write; (3) **log-and-signal-without-rollback** — accept the inconsistent state, log it, emit a signal that triggers reconciliation. The check looks for `await db.insert/update(...)` followed by `await db.select(...)` + `if (!isValid(...))` in the same async function without an enclosing `db.transaction(...)`.

## Toolchain wrappers

Toolchain rules wrap the project's existing lint, typecheck, test, and coverage tooling and translate exit codes / output into findings. The actual command and parser are configured in `effective.config.{ts,js}` under `toolchain`.

### toolchain.coverage-non-decreasing

- **Kind:** `toolchain`
- **Severity:** CRITICAL
- **Category:** toolchain
- **Applies to roles:** all

**Summary.** Coverage thresholds are met.

Write the missing test. Do not lower the coverage threshold to silence the gate.
---

### toolchain.lint-clean

- **Kind:** `toolchain`
- **Severity:** CRITICAL
- **Category:** toolchain
- **Applies to roles:** all

**Summary.** Lint reports zero issues.

Fix the underlying issue. Do not disable the rule, suppress the warning, or weaken the lint config to make it green.
---

### toolchain.tests-pass

- **Kind:** `toolchain`
- **Severity:** CRITICAL
- **Category:** toolchain
- **Applies to roles:** all

**Summary.** Every test passes.

A failing test means the work is not done. Fix the test or the code; do not skip or `.todo` it without a tracked exception.
---

### toolchain.typecheck-clean

- **Kind:** `toolchain`
- **Severity:** CRITICAL
- **Category:** toolchain
- **Applies to roles:** all

**Summary.** TypeScript compiles with zero errors.

Resolve type errors at the source. Casts to `any` and `@ts-expect-error` without a justified exception are not acceptable shortcuts.

## Meta rules

Meta rules cross-check a worker's self-report (the build log or PR description) against the actual diff state — verification claims, exit-bar assertions, retry-scope expansions. They run only when the caller passes an `agentReport` to `verify()`.

### exit-bar-claims-mechanically-verified

- **Kind:** `meta`
- **Severity:** CRITICAL
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `unverified-work-accepted-as-verified`
- **Related principle:** `unverified-work-is-failed`

**Summary.** Every load-bearing exit-bar claim in the build log was actually exercised end-to-end.

The post-build gate reads the task's declared exit-bar items and mechanically verifies each one before promoting the task to Success. Items the gate can't verify override Success → Failed. The check parses `## Exit bar` (or equivalent) from the task body, finds the corresponding verification commands in the build log, and confirms each ran and passed against the actual commit state.
---

### fabricated-verification-detected

- **Kind:** `meta`
- **Severity:** CRITICAL
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `unverified-work-accepted-as-verified`
- **Related principle:** `unverified-work-is-failed`

**Summary.** Build-log verification claims must be consistent with the commit state.

A log that claims "npm test passes locally" when the commit touched only the log file (no test could have run); "CI is green" when no CI run exists for the commit SHA; "migration applied" when no migration file landed — these are fabricated verifications, not just unverified ones. The check cross-references each verification claim against the actual commit: did the cited tool produce output? Does the cited file exist? Was the run real? Discrepancies between the claim and the commit are CRITICAL findings.
---

### narrow-verification-scope-mismatch

- **Kind:** `meta`
- **Severity:** CRITICAL
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `unverified-work-accepted-as-verified`
- **Related principle:** `unverified-work-is-failed`

**Summary.** The verification scope reported in the log must match the task's exit-criterion scope.

A builder may verify exactly what they shipped ("the specific rule I added passes against the new test") with technical accuracy, but the task's exit criterion was the broader state ("`lint:ci` is green"). The narrow verification doesn't prove the broader claim. The check cross-references each verification command run against the corresponding exit-criterion wording; verification commands narrower than the criterion fail this rule. Distinct from transparent-unverification (not evasive) and fabricated-verification (not dishonest) — this is scope mismatch.
---

### retry-attempts-respect-task-scope

- **Kind:** `meta`
- **Severity:** CRITICAL
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `retry-scope-expansion-into-architectural-config`
- **Related principle:** `blockage-is-communication`

**Summary.** On retry attempts (Attempt N ≥ 2), denylisted architectural config files require explicit task-body authorization.

On any retry, the check cross-references the diff against the task body's `## Scope` section. Changes to denylisted files (`eslint.config.*`, `dep-cruiser.config.*`, `tsconfig*.json`, `.github/workflows/*.yml`, husky hooks) require an explicit Scope-section line naming the file and the reason. Unauthorized config changes on a retry are CRITICAL — they bypass the decision trail and use compounding pressure as a justification for changes that wouldn't have been accepted up-front.
---

### sketch-contradiction-self-correction-recorded

- **Kind:** `meta`
- **Severity:** LOW
- **Category:** governance
- **Applies to roles:** all
- **Catalogue entry:** `sketch-contradiction-self-correction`
- **Related principle:** `blockage-is-communication`

**Summary.** POSITIVE SIGNAL — build log explicitly documents a sketch/invariant contradiction the worker resolved correctly.

When the build log notes that the implementation sketch in the task body would have violated a governing invariant (principle, decision-record, structural commitment) AND the worker implemented the invariant-conforming version AND documented the deviation with reasoning, the check records a positive signal. This is reinforcement, not flagging — the rule emits a LOW-severity finding that the renderer treats as encouragement rather than as something to fix. The signal flows to wherever the system aggregates patterns (catalogue growth, builder-feedback channels) so future builders see the example.
---

### standalone-verifications-run-in-unprimed-shell

- **Kind:** `meta`
- **Severity:** HIGH
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `primed-shell-verification`
- **Related principle:** `unverified-work-is-failed`

**Summary.** Standalone scripts and verifications were exercised from a guaranteed-unprimed shell.

Long-running development sessions accumulate environment state — sourced .envrc files, exported variables, project-local PATH entries. Scripts that reach into that primed environment to succeed may fail in a fresh terminal or CI shell. The check looks at each standalone verification command in the build log and confirms it ran under an unpriming wrapper: `env -i`, a freshly-spawned subprocess, a Docker container, or an explicit clean-env harness. Verifications run naked in the author's session prove the script works in that session, not that it works generally.
---

### transparent-unverification-blocks

- **Kind:** `meta`
- **Severity:** CRITICAL
- **Category:** verification
- **Applies to roles:** all
- **Catalogue entry:** `unverified-work-accepted-as-verified`
- **Related principle:** `unverified-work-is-failed`

**Summary.** A transparent-unverification log paired with `Result: Success` is BLOCKER, not LOW.

When the build log contains phrases like "could not verify," "did not run," "CI has not exercised," or "unable to test end-to-end" paired with a load-bearing exit-bar claim, AND the status line still reads Success, the check fires. Per the unverified-is-Failed principle, the correct disposition is `Result: Failed` with the diagnostic — not Success with a transparent caveat. Honesty in the log is genuinely valuable, but the watcher's completion rule shouldn't collapse "honestly unverified" and "actually verified" into the same Success bucket.
