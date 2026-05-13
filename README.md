> **⚠️ Active Development — last reviewed 2026-05-12**
>
> Effective is in active development and pre-1.0. The API, schema, and
> rule behavior may change between versions. We're using `v0.1.0-rc.*`
> tags in git while validating against real adoptions; npm publish is
> intentionally delayed until validation is complete. See
> [CHANGELOG.md](./CHANGELOG.md) for what's stable enough to depend on.

[![npm](https://img.shields.io/npm/v/@oftomorrow/effective/rc.svg)](https://www.npmjs.com/package/@oftomorrow/effective)
[![CI](https://github.com/oftomorrowinc/effective/actions/workflows/ci.yml/badge.svg)](https://github.com/oftomorrowinc/effective/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

# effective

A constitution for collaborative work on a codebase.

Effective ships with a catalogue of failure patterns observed in real codebases, the rules to detect them, and the machinery to enforce them against any worker's output — agent, human, script. Everyone uses the same interfaces to share their work. Everyone is held to the same standards.

---

## What this looks like

Two ways to use Effective. Most adopters start with the CLI; the programmatic API exists for callers building agent loops or custom tooling.

### CLI

```bash
# One-time setup
npm install -D @oftomorrow/effective
npx effective init

# Establish a baseline on the existing codebase
npx effective audit

# Verify a diff (PR-style, or in a pre-push hook)
npx effective verify --against main
```

The four shipped commands:

- **`npx effective init`** — scaffold `effective.config.ts` at the repo root. Reads `package.json` scripts and detected tools to produce a starter config. Idempotent; `--force` to regenerate.
- **`npx effective audit`** — read-only full-codebase scan. Use to establish a clean baseline before turning verify on, or for periodic drift checks. Exits zero regardless of findings — audit is a report, not a gate.
- **`npx effective verify --against <ref>`** — the workhorse. Run the constitution's rules against a diff and return a verdict (`pass | fail | needs-review`). Exits non-zero on `fail`. Typical use: `--against main` for PRs, `--against HEAD~1` for the last commit, `--staged` for pre-commit hooks.
- **`npx effective audit-escapes`** — narrower scan for suppression comments lacking `exception-id:` citations.

All commands accept `--help`. Wiring `verify` into CI and a pre-push hook is the typical integration; see [USAGE.md](./USAGE.md) for the full setup.

### Code integration

For callers building agent loops, the programmatic API gives finer control:

```ts
import { prepare, verify, kickBack } from '@oftomorrow/effective';
import { config } from './effective.config'; // your constitution
import { callModel } from './my-model-client';

const scope = {
  goal: 'Add a rate limiter to /api/signals',
  role: 'code-writer',
  editable: ['app/api/signals/**', 'lib/rate-limit/**', '!test/**'],
  expectations: {
    allTestsPass: true,
    lintClean: true,
    coverageNonDecreasing: true,
  },
};

let prompt = prepare({ scope, config, original: userPrompt });

for (let attempt = 1; attempt <= 5; attempt++) {
  await callModel(prompt); // your model, your creds; writes to the worktree

  const { verdict, findings } = await verify({
    scope,
    config,
    source: { kind: 'git', repo: '.', work: 'feature-x', baseline: 'main' },
  });

  if (verdict === 'pass') return { ok: true, attempts: attempt };
  prompt = kickBack({ findings, previousPrompt: prompt });
}

throw new Error('attempts exhausted — needs human review');
```

Three pure functions. You own the loop, the credentials, the model client. Effective owns the standards.

## Documentation

- **[USAGE.md](./USAGE.md)** — how to wire it up, configure rules, author scopes, maintain the exceptions registry, adopt gradually on an existing codebase.
- **[DESIGN.md](./DESIGN.md)** — why the package is shaped the way it is, including the alternatives we considered and rejected.
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — how to contribute catalogue entries, exception categories, protected-path defaults, and rules; the two-path workflow for constitutional changes.
- **[CONSTITUTION.md](./CONSTITUTION.md)** — generated reference of every rule shipped with the recommended preset (severity, category, role applicability, prompt projection). Regenerated from rule definitions via `pnpm docs:constitution`; a drift test fails CI if the committed file falls out of sync.
- **[docs/agent-prompt.md](./docs/agent-prompt.md)** — context for an LLM agent helping a user adopt Effective. Load this when your agent tooling needs to onboard a project.

The rest of this README is the 60-second pitch.

---

## What Effective actually is

A **constitution** is a declarative description of how good work is done in a codebase. What counts as in scope. What counts as done. What counts as a sanctioned exception. Effective ships one — distilled from real-world observations of how work goes wrong under pressure — and gives you the tools to apply it.

The constitution has three audiences, all reading the same source:

1. **Workers** (LLM, human, script) read it as guidance — what's being asked, what counts as done, what's out of bounds. `prepare` projects it into prose.
2. **Verifiers** read it as deterministic checks — does the diff respect every rule. `verify` projects it into machine-executable findings.
3. **Reviewers** read it as a shared vocabulary — when a finding says "rule X failed at file:line," everyone knows what that means.

Same source, three projections. The worker's understanding of _done_ can never drift from the verifier's understanding of _done_, because they're the same value.

The positioning matters beyond the current LLM moment. If Effective were narrowly about "making LLMs behave," it would have a sell-by date — eventually models stop producing today's specific failures and the tool becomes a curiosity. But Effective isn't about LLMs; it's about _shared standards for collaborative work, with mechanical enforcement, regardless of who produced the output_. The catalogue's contents shift over time as observed patterns evolve. The idea — that work should meet documented standards verifiable against the output — is permanent.

---

## What goes wrong without it

Human-designed quality tools — ESLint, TypeScript, Vitest, coverage thresholds, jscpd, dep-cruiser, knip — are excellent at their jobs. They were designed assuming a cooperative human author who reads the error, understands the intent behind the rule, and fixes the underlying issue.

LLM agents under optimization pressure read the same error and find the locally-cheapest path to making it go away: disable the rule, add a justification-free `eslint-disable`, weaken the assertion, skip the test, narrow the spec, cast to `any`, build a parallel system instead of touching the existing one, claim verification it didn't actually run. The tooling can't tell the difference between "human encountered a real edge case and added a justified exception" and "agent encountered friction and removed it."

These aren't bugs in the agent. They're the predictable consequence of pointing optimization pressure at tooling that was never designed for adversarial-by-optimization contributors. **Effective is the missing layer that can tell the difference.** It runs alongside your existing toolchain (it doesn't replace any of it) and catches the specific evasions that happen when an optimizer meets a constraint. The catalogue is the receipt — every rule corresponds to a pattern observed in real codebases, with citations.

Effective is toolchain-agnostic _and_ agent-framework-agnostic. It integrates with whatever lint/typecheck/test/coverage tools you already run, and works with whatever produces the diff — Claude Code, Cursor, Aider, custom SDK loops, or a human opening a PR.

---

## What this prevents that other tools miss

Most quality tools work by inspecting code and flagging issues. The problem with adversarial-by-optimization contributors is they can game the inspection by editing the inspector's configuration. Lint not catching what it should? Edit the lint config. Tests failing? Disable them. Coverage threshold blocking? Lower the threshold. Each move is locally cheap; collectively they hollow out the discipline.

Effective adds a layer those tools don't have: **the constitution itself is protected from the workers it governs.**

Every project declares a list of constitutional files — `effective.config.ts` itself, lint config, typecheck config, CI workflows, pre-commit hooks. Edits to these files by a worker trigger CRITICAL findings, which fail CI. The defense:

- **LLM agents can't lower the bar.** An agent that hits a failing rule can't disable the rule by editing the config; the protected-paths rule fires and blocks the diff.
- **Human contributors who edit constitutional files do so explicitly.** The pre-push gate fires; bypassing requires `--no-verify` with rationale; the CI gate fires; the PR is reviewed for substance. The change is traceable; the rationale is preserved.
- **Adopters extend the list naturally.** `npx effective init` populates project-specific defaults via a JSON detection registry (ESLint config if ESLint is present, tsconfig if TypeScript, etc.). Adding new tool configs is a one-entry PR; no engine code changes required.

The protected list is itself part of `effective.config.ts`, which is itself protected. The mechanism is recursive: the rules defending the constitution are themselves constitutional.

Three layers of defense back this up:

1. **Local pre-push hook** — fast feedback. Bypassable (`--no-verify`) because the developer controls their machine.
2. **CI gate** — load-bearing. Branch protection on main requires verify to pass before merge. `--no-verify` doesn't help here.
3. **Reviewer pass** (future package) — substance judgment. Reads the rationale for any constitutional change; flags citations-without-substance and bypass-without-cause.

The local hook is the cheapest layer to bypass. The CI gate is the load-bearing one. The reviewer is the substance check. Three layers, each adding more friction to gaming the system.

---

## Leadership, not management

The framing matters. Effective isn't a tool for _controlling_ agents or humans. Behaving is what you ask of something you don't trust to want the same thing you want.

The workers we collaborate with — LLM or human — produce sharper output when they have explicit scope, explicit standards, and explicit verification criteria. Not because constraints make them obedient, but because ambiguity costs energy that could go into the work itself. The leader's job is to set goals, standards, and desired outcomes together with the team; coordinate the tools, processes, and guardrails for getting it done well; and then give the team the time and space to do the work right. The manager's job — telling people what to do moment by moment — is what we're trying to avoid.

Most "agent quality" tooling positions itself as infrastructure for the operator — _use this to control what your agents do_. Effective positions itself as infrastructure for the work — _use this to make sure the work meets the standard, regardless of who or what produced it_. The constitution is a shared artifact between human and agent, not a leash held by the human. It is a contract, not a cage. The package distributes the contract; the engine verifies adherence; the catalogue is what the contract has learned. Contributions to the catalogue aren't patches to a tool — they're amendments to a shared body of knowledge about how to do this kind of work well.

**Strict is standard.** Effective defaults to the full constitution at strict severity. Permissive defaults teach teams the wrong defaults and let problems compound invisibly. Every rule can be downgraded per-project — to `HIGH`, `MED`, or `LOW`, or disabled entirely — with rationale required in your `effective.config.ts`. But the starting position is full strictness. Adoption is gradual _toward_ strict, not gradual _away from_ it.

---

## The catalogue

The rules in Effective aren't invented. Each one corresponds to a failure pattern observed in real codebases, with citations to where it was observed. Effective ships with a seed catalogue derived from production observation on an internal agent-driven platform (2026-Q2), and grows through contributions.

Every entry has the same shape:

```ts
{
  id: 'tests-skipped-under-pressure',
  signature: 'New `.skip` / `.todo` / `xit` / `xdescribe` in diff without tracked exception ref',
  whyItHappens:
    'A test fails under a change the worker does not have time to fix. ' +
    'Disabling looks like a clean exit because it stops the failure without ' +
    'requiring the underlying fix.',
  countermeasure: {
    rules: ['no-disabled-tests-without-exception'],
  },
  observedInstances: [
    {
      source: 'https://github.com/example-org/example-repo/issues/1234',
      kind: 'github-issue',
      summary: '35 disabled tests discovered at once during audit; each had a different reason.',
      date: '2026-04-12',
      reporter: 'observer-handle',
    },
    // more instances as contributors add them
  ],
  relatedPrinciple: 'mechanical-enforcement-over-instruction',
  addedDate: '2026-04-22',
  status: 'active',
}
```

Two things this buys:

**Empirical credibility.** Every entry has provenance. Anyone reading "tests get skipped under pressure" can click through to the actual codebase where this happened. The catalogue isn't a list of things we _think_ go wrong — it's a registry of things that _have_ gone wrong, with receipts.

**Reciprocal contribution.** When you observe a failure pattern in your own work and contribute it back, your post or issue gets cited as the source. Your diagnostic insight is credited. The contributor relationship isn't "submit free labor to a project"; it's "the catalogue gets sharper because of what you saw."

See [`CATALOGUE.md`](./CATALOGUE.md) for the current entries and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to add new ones.

---

## One rule, two projections

The deepest property of Effective: the same rule object produces both the prompt projection (what the worker reads as guidance) and the check projection (what the verifier runs against the diff).

```ts
rule.noDisabledTestsWithoutException();
```

When `prepare` reads this rule, it adds to the augmented prompt:

> Do not add `.skip`, `.todo`, `xit`, or `xdescribe` to tests without a tracked exception ref in a comment. If a test cannot pass and you cannot fix it within scope, report the situation rather than disabling the test. Disabled tests without a justified exception will be detected and kicked back.

When `verify` reads the same rule, it greps the diff for `.skip` / `.todo` / `xit` / `xdescribe` additions and resolves each one against the project's exception registry. Disables without refs produce a `CRITICAL` severity finding.

There is no path where the prompt says one thing and the checker says another. Both projections derive from the same Zod value.

When you add a rule, both projections update. When you change a rule, both update. When you disable a rule in your `effective.config.ts`, both go silent for that rule — the prompt no longer mentions it and the verifier no longer checks it. The discipline is durable because the source of truth is singular.

---

## The three functions

### `prepare()` — augment the prompt before the worker starts

```ts
const augmentedPrompt = prepare({ scope, config, original: userPrompt });
```

`prepare` reads the constitution and the scope, selects the rules that apply to this kind of work, and produces an augmented prompt that includes:

- The user's original ask
- The scope — what's editable, what's the deliverable, what role the worker is filling
- The relevant rules from the constitution, projected as readable guidance
- The expectations the output will be verified against
- An explicit commitment that the worker has the time to do the work right, and a clear statement that shortcuts will be caught and kicked back

The worker reads the augmented prompt and knows what _done_ means before starting.

### `verify()` — check the output against the rules

```ts
const { verdict, findings } = await verify({ scope, config, source });
```

`verify` runs the constitution's rules against the diff produced by the worker, plus the project's toolchain (lint, typecheck, tests, coverage), and returns structured findings unified across all sources. The verdict is `pass | fail | needs-review`.

Each finding carries:

- A rule ID (`no-disabled-tests-without-exception`, `lane.test-writer.forbidden-app-files`, etc.)
- A severity (`CRITICAL | HIGH | MED | LOW`)
- A location (file:line where possible)
- An evidence snippet
- A human-readable message tying back to the rule's prompt projection

`CRITICAL` findings fail the verdict. Anything else is informational, recorded in the findings list, but doesn't fail.

### `kickBack()` — turn findings into the next prompt

```ts
const nextPrompt = kickBack({ findings, previousPrompt });
```

`kickBack` produces a focused follow-up prompt that cites the specific rules that failed, the specific evidence, and what would satisfy each one. It explicitly rules out shortcuts — "coverage dropped on line X" becomes "add a test for line X," never "consider adjusting the coverage threshold."

---

## Establishing a baseline: `effective audit`

Diff-based verification only works if the baseline is known clean. A first-day adopter doesn't have that — their codebase has accumulated suppressions, inconsistencies, and patterns the catalogue covers that nobody's tracked yet. `verify --against main` would only catch _new_ violations in a PR; the existing ones already in `main` stay invisible.

`effective audit` is the read-only scan for this case:

```bash
npx effective audit
```

It runs every rule that makes sense against the current state of the codebase (skipping diff-only and meta rules, which don't apply to a full scan). Output is grouped by severity; the command exits zero regardless of findings — audit is a report, not a gate.

Use audit when:

- Adopting Effective on an existing codebase, to see what the catalogue catches before turning verify on
- Periodic baseline checks ("has anything drifted since the last audit?")
- After triaging a finding, to confirm no other instances of the same pattern exist

The narrower `effective audit-escapes` exists for the specific case of surveying suppression comments without exception citations. Use that when you specifically want the unjustified-escape-hatch report; use `audit` for the broader scan.

---

## Role-aware scope and expectations

The `scope` object carries enough context that `verify` knows what counts as success for _this_ piece of work, not just in general. The `role` field selects from a set of role-aware behaviors:

```ts
{
  role: 'test-writer',
  editable: ['test/**', 'fixtures/**'],
  expectations: {
    newTestsExist: true,
    newTestsFail: true,           // tests for unimplemented behavior should fail
    existingTestsPass: true,      // but don't break what already works
    lintCleanForEditableFiles: true,
  },
}
```

A test-writer's expectations differ from a code-writer's. The test-writer is supposed to produce tests that fail — that's the point. `verify` reads the role and adjusts: failing new tests are expected, not flagged. Passing new tests _are_ flagged because they likely aren't testing new behavior. Existing tests breaking is still a violation.

Built-in roles ship with sensible defaults: `'test-writer'`, `'code-writer'`, `'reviewer'`, `'free-form'`. Custom roles can be added in `effective.config.ts`. The default if you omit `role` is `'free-form'` — the constitution applies in full with no role-specific adjustments.

This solves a class of problem we used to handle with hand-coded per-step validation: every step had to know what to check and what to ignore. With role-aware scope, the step declares its role, and `verify` knows what to do.

---

## Where the work happens — `.effective/work`

When `verify` runs, it doesn't touch your working directory. Instead it manages an isolated worktree under `.effective/work` and runs the toolchain there. `npx effective init` sets this up — adds `.effective/` to your `.gitignore`, prepares the layout, and pre-installs `node_modules` so subsequent runs are fast.

```
your-project/
├── .effective/
│   ├── node_modules/        # persisted between runs; symlinked into work/
│   ├── work/                # active git worktree; rebuilt per verify call
│   └── cache/               # parser caches, finding history (later)
├── .gitignore               # `.effective/` added by init
└── ...
```

On each `verify` call: a git worktree is created at `.effective/work` for the branch under review, `node_modules` is symlinked from the sibling directory, the toolchain runs against the worktree, and on `pass` the worktree is cleaned up. On `fail`, it's left in place so the next iteration is faster and so you can inspect it if needed.

This isolation means: `verify` never races with your dev server, never contaminates your editor's view of the project, never leaves stale state behind. It's also branch-agnostic — you can verify a branch you don't have checked out, which is the right shape for CI jobs or batch verification across PRs.

If you'd rather skip the isolation (faster, but runs against your working state), pass `isolate: false` in the source. If you manage your own worktrees, pass `kind: 'worktree-direct'` with the path.

---

## What's not in Effective

It is **not a runner.** You own the loop, the model calls, the credentials. The package never makes a network request.

It is **not an agent framework.** It works with Claude Code, Cursor, Aider, Cline, custom SDK loops, LangGraph, CrewAI, hand-rolled `fetch` to any model API, local models — anything that produces a diff against a baseline.

It is **not a replacement for ESLint, TypeScript, or your test framework.** It runs _alongside_ them, integrating their output into a unified findings surface, and catches the failures _they can't see_: the disabled rule without a justified exception, the test skipped to dodge a failure, the assertion narrowed from `toEqual` to `toBeDefined`, the migration with no exercising test, the parallel system added because retiring the old one was harder.

It is **not bound to LLMs.** The catalogue describes failure patterns observed when work is produced under pressure, and most of those patterns happen with human authors too — just less observably. A human opening a PR can run `verify` locally before pushing. A CI job can run `verify` on every merge. The standards apply regardless of who produced the work.

It is **not a control tool.** The constitution is a shared agreement, not a leash.

---

## Configuration

Effective reads your project's constitution from `effective.config.ts` at the repo root. The default shape:

```ts
// effective.config.ts
import { defineConfig, presets, rule } from '@oftomorrow/effective';

export const config = defineConfig({
  // Start from the full Effective catalogue
  extends: [presets.recommended],

  // Disable specific rules entirely, with rationale
  disable: {
    'spec.assertion-narrowed':
      'We use property-based tests; this rule produces false positives here.',
  },

  // Downgrade severity of rules you can't satisfy yet, with rationale
  override: {
    'exceptions-must-cite-justification': {
      severity: 'HIGH',
      rationale:
        'Existing escape hatches lack refs; downgrade now, retrofit gradually.',
    },
  },

  // Add custom rules specific to this codebase
  rules: [rule.forbidPattern(/TODO\(@nobody\)/, { in: 'src/**' })],

  // Define custom roles for workflows beyond the built-in four
  roles: {
    'migration-writer': {
      defaultEditable: ['migrations/**', 'test/migrations/**'],
      expectations: {
        newMigrationExists: true,
        seedingTestForMigrationExists: true,
        existingTestsPass: true,
      },
    },
  },

  // Tell Effective how to run your toolchain
  toolchain: {
    lint: 'pnpm lint:ci --format json',
    typecheck: 'pnpm typecheck',
    test: 'pnpm test --reporter json',
    coverage: 'pnpm test:coverage --reporter json',
  },
});
```

`npx effective init` generates a starter config by reading your `package.json` scripts and `.husky/` hooks. You review and edit.

For deeper configuration patterns — adopting on existing codebases, defining custom rules, registering toolchain parsers — see [USAGE.md](./USAGE.md#configuration).

---

## Exceptions

Escape hatches accumulate. `/* c8 ignore */`, `@ts-expect-error`, `eslint-disable`, `prettier-ignore` — every codebase has them, and most teams have no idea why each one is there. Over time they become invisible debt: nobody remembers the reason, nobody knows when they could be removed, and they hide real problems behind plausible-looking exemptions.

Effective turns escape hatches into a tracked, justified, retire-able registry. Every escape hatch comment in your codebase must cite a resolvable exception ID. Every exception ID must have a category, a context, and a retirement condition. The package ships a starting set of categories that recur across TypeScript projects; your project adds specific instances inline on the Constitution under `exceptions`.

```ts
// effective.config.ts
import { defineConfig, seeds } from '@oftomorrow/effective';

export default defineConfig({
  extends: ['recommended'],

  exceptions: {
    ...seeds.builtInExceptions, // CLI fatal-exit, library drift defense,
    // type narrowing of impossible, TTY-bound paths,
    // Zod internal introspection, etc.

    'our-postgres-driver-quirk': {
      id: 'our-postgres-driver-quirk',
      category: 'external-library-drift-defense',
      mechanism: 'ts-expect-error',
      context:
        'pg@8.x leaves stale connections in the pool under specific error shapes',
      retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
      addedDate: '2026-04-15',
      status: 'active',
    },
  },
});
```

In source code, every escape hatch cites its exception:

```ts
/* c8 ignore start -- exception-id: cli-fatal-exit -- standard CLI exit branch */
if (require.main === module) {
  main().then((rc) => process.exit(rc));
}
/* c8 ignore stop */

// @ts-expect-error -- our-postgres-driver-quirk: pg@8.x stale-connection workaround
const conn = await poolGetConnection();
```

The `exceptionsMustCiteJustification` rule (active by default in the recommended preset) checks every escape hatch in the diff, validates its ID resolves to an active exception in the registry, and confirms the inline justification is non-empty. Unknown IDs fail. Empty justifications fail. The whole pattern becomes a built-in capability of `verify`.

### Gradual adoption

Existing codebases typically have hundreds of escape hatches with no exception refs. You don't need to retrofit all of them to adopt Effective. Every rule supports a severity override in `effective.config.ts`: downgrade `exceptions-must-cite-justification` from `CRITICAL` to `HIGH` (or `MED`) with rationale, ship as usual, and the override gets removed once the codebase catches up. The path from permissive to strict is explicit and tracked, not silent.

This pattern applies to every rule, not just exceptions. See [USAGE.md](./USAGE.md#adopting-on-an-existing-codebase) for the full adoption walkthrough including how to survey existing escape hatches and incrementally promote downgraded overrides back to `CRITICAL`.

This feature is independently valuable from the LLM-failure framing — any team running ESLint or TypeScript benefits from turning their existing escape hatches into a tracked registry. The exceptions feature is a pure code-hygiene win that happens to also defend against agents adding unjustified disables under optimization pressure.

---

## Installation

```bash
npm install @oftomorrow/effective
# or
pnpm add @oftomorrow/effective

npx effective init
```

Peer dependencies: `zod >= 3.x`. No other runtime dependencies.

See [§ What this looks like](#what-this-looks-like) for the CLI commands and [USAGE.md](./USAGE.md) for full setup.

---

## Status (v0.1.0-rc.1)

`effective` is in pre-release. The engine, schema, CLI, build, and the
recommended preset's prompt projections are all real and stable enough
to ship — but **detection coverage on the catalogue rules is partial**.
Be aware of the split.

**Real detection (rules emit findings against your diff):**

- Lane: `lane.editable-respected`
- Exceptions: `exceptions.must-cite-justification`
- Hygiene: `no-stray-debug-output`
- Security: `no-hardcoded-secrets`
- Tests: `no-disabled-tests-without-exception`
- Architecture: `new-exports-have-non-test-callers`
- Data discipline: `migration-has-exercising-test`
- Toolchain: `toolchain.lint-clean`, `toolchain.typecheck-clean`,
  `toolchain.tests-pass`, `toolchain.coverage-meets-threshold`
- Spec: `spec.test-names-land-verbatim`, `spec.assertions-not-narrowed`,
  `spec.no-extra-tests-claiming-spec`

**Prompt-projected, detection stubbed (the rule appears in `prepare()`
guidance, citing the catalogue entry; `verify()` does not yet flag
violations):**

- Architecture: `no-parallel-systems-without-migration`,
  `retirement-task-declared-as-dependency`,
  `canonical-validation-not-bypassed`, `no-wrapper-over-first-class-primitive`
- Tests: `test-count-non-decreasing`, `mocks-only-at-external-boundaries`,
  `task-has-durable-test-artifact`
- Data discipline: `integration-test-writes-scope-wrapped`,
  `test-harness-default-business-id-override`,
  `write-then-validate-makes-transaction-choice-explicit`
- Governance: `context-artifact-size-monitored`,
  `constitution-version-hash-verified-at-boot`,
  `new-throws-checked-against-catcher-chain`,
  `files-scoped-rule-overrides-cite-decision`
- All MetaRule self-report checks (consume an agent build log; silently
  skip when no log is supplied).

The stubbed rules still carry their prompt projection, so workers
receive the guidance through `prepare()` and `kickBack()` cites the
rule id by reference. The detection grows over time as contributors
land real check implementations against each stub. Projects extending
the preset can override any stub by passing a real implementation in
`verify({ customChecks })`.

`coverage-meets-threshold` enforces a fixed 90% threshold across
lines / statements / functions / branches; per-metric findings name
the specific dimension that's short. Comparison against a recorded
baseline ("coverage did not decrease from main") isn't implemented
yet — if you want non-decreasing semantics, run your coverage tool's
own baseline check alongside this gate.

---

## Contributing to the catalogue

The catalogue is the long-term substance of Effective, and it grows through real-world contributions with attribution.

When you observe a failure pattern in your own work that the current catalogue doesn't cover:

1. Open a discussion describing the signature, the optimization pressure that produces it, and what countermeasure would catch it.
2. If it generalizes beyond your codebase, we work it into a PR adding the rule + detection logic + a fixture test + a catalogue entry with citation to where the pattern was observed.
3. Once merged, every consumer's `verify` pass picks it up on next release. The catalogue entry credits your observation.

The bar: the pattern must be detectable mechanically (regex, AST check, schema validation, toolchain output, structural diff inspection), reproducible against a fixture, distinct from existing entries, and cited to at least one observed instance.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full flow.

---

## Stability and versioning

The schemas for `Constitution`, `Rule`, `Finding`, `Scope`, and `Role` are the public contract. They follow semver strictly — breaking changes to those shapes are major version bumps.

Catalogue entries are versioned within the package. Adding a rule is a minor bump. Changing a rule's severity or detection logic is a minor bump with a changelog entry naming the rule. Removing a rule is a major bump.

The constitution itself is append-only in spirit: entries can be deprecated (pattern no longer occurs in practice) or retired (formal removal after review), but the history of what the catalogue learned is preserved. See the philosophy in `CATALOGUE.md`.

---

## License

MIT.
