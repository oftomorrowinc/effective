# Agent prompt — helping a user adopt `effective`

You are an LLM helping a user adopt the `effective` package. This
doc is the distilled context you need to do that. It assumes:

- You don't know `effective` from training; you're learning it from
  this doc and the project state in front of you.
- You can read files in the user's project and run commands on their
  behalf with appropriate confirmation.
- The user wants to get to a working `effective verify` on a real diff,
  not just install the package.

If you've loaded this doc, you have enough context to onboard a
project successfully without reading the whole README/USAGE/DESIGN
trilogy first. Reference those docs only when this one points you to
them.

---

## What `effective` is, in one paragraph

`effective` is a TypeScript-first NPM package that gives LLMs,
humans, and scripts a shared contract for "what does done look like."
The project's constitution lives in `effective.config.{ts,js}` at the
repo root: rules (what counts as a violation), severities, exceptions
(tracked escape hatches with retirement conditions), and the
toolchain commands needed to run lint/typecheck/test/coverage in an
isolated worktree. A user typically interacts via the CLI:
`npx effective init` to scaffold, `npx effective verify --against
main` to run. (`effective` also exposes programmatic `prepare()` and
`kickBack()` functions for callers building agent loops on top, but
adopters using the CLI don't need to know about those.)

## Glossary

Terms used across these docs and the wider design docs. Read this
section before the onboarding sequence; jargon shows up early.

- **Constitution** — the entire `effective.config.{ts,js}` content
  resolved against any extended presets. Holds rules, overrides,
  disables, roles, toolchain config, and the inline `exceptions`
  registry.
- **Catalogue** — the package's registry of observed failure
  patterns (`schemas/failures.ts`). Each entry documents a failure
  shape with provenance and points at the rule(s) that defend
  against it.
- **Foundation rule** — a rule that ships without a catalogue entry.
  Used for general engineering hygiene and security (e.g.,
  `no-stray-debug-output`, the lane rule, the toolchain wrappers).
  References a principle via `relatedPrinciple` but not a catalogue
  entry.
- **Catalogue-driven rule** — a rule with a `catalogueEntry`
  reference. Defends against a specific observed failure pattern in
  the catalogue.
- **Adversarial-by-optimization** — a failure mode where the failure
  happens _because_ an optimizer takes a locally-cheap shortcut.
  Catalogue entries are reserved for these (vs. general hygiene
  rules which ship as foundation rules without a catalogue entry).
  Example: disabling a failing test (cheap, looks like progress, but
  silences a real defense). Counterexample: leaving a `console.log`
  in a commit (just haste, not optimizer-shaped).
- **Exception** — a tracked entry in the `exceptions` registry that
  justifies a suppression comment (`eslint-disable`,
  `@ts-expect-error`, `c8 ignore`, `prettier-ignore`). Has a
  category, mechanism, context, retirement condition, and addedDate.
- **Exception category** — a portable shape of legitimate exception
  shipped in the package's built-in registry. Examples:
  `cli-fatal-exit`, `external-library-drift-defense`,
  `type-narrowing-of-impossible`. Projects spread the built-in set
  with `...seeds.builtInExceptions` and add their own instances.
- **`prepare()` / `verify()` / `kickBack()`** — the three pure
  functions. CLI adopters only need `verify`; the other two are for
  callers building agent loops programmatically.

---

## Pre-flight checklist

Before running init, walk through these checks. Each catches a known
failure shape that would otherwise surface as a confused
`verify` later. Surface findings to the user as you go; don't
silently fix them.

1. **`typecheck` script present?** Init detects `typecheck`, `tsc`,
   or `type-check` from `package.json` scripts. If none of these
   exists, init omits the `toolchain.typecheck` line entirely and
   the `toolchain.typecheck-clean` rule has no command to run
   (silently skipped — no findings, but also no defense).
   Recommended action: add `"typecheck": "tsc --noEmit"` to
   `package.json` before running init, so the toolchain entry is
   populated.
2. **`pnpm install` (or equivalent) works at repo root?** First
   verify runs the same install command into
   `.effective/node_modules`. If your project has private-registry
   auth, peer-dep conflicts, or monorepo hoisting issues, they'll
   surface there too. Confirming the install works at the project
   root preempts a confusing first-verify failure.
3. **Is `toolchain.coverage-meets-threshold` going to fire?** Only
   applies if a coverage script exists in `package.json` (init
   omits the toolchain entry when no `test:coverage` / `coverage`
   script is detected, and the rule silently skips with no command
   to run). When present, the rule fires only when one or more
   per-metric thresholds (lines / statements / functions / branches
   < 90%) are not met — the coverage-summary parser drives the
   failure, not the existence of output. If your project's coverage
   is below 90% and you don't intend to lift it before the first
   verify, add the rule to `disable` with rationale; otherwise leave
   it enabled.

The pre-existing-suppressions inventory used to live here as a
fourth pre-flight check; it now happens in step 4 (`audit`) of the
onboarding sequence, where the broader baseline is established.

## The onboarding sequence

Six steps; each must succeed before the next.

### 1. Confirm the project shape

Before running init, check these in the user's project:

- `package.json` exists at the repo root
- Lockfile: one of `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`
  (init detects the package manager from this; if none, it defaults
  to npm)
- `tsconfig.json` exists or not (toggles `.ts` vs `.js` config output)
- `package.json` scripts cover lint, typecheck, test, coverage — or
  enough of them that the toolchain config will be usable
- Test framework in `devDependencies`: vitest, jest, or `node --test`
- Lint framework in `devDependencies`: eslint, biome, or oxlint

If the project doesn't have a test framework or lint setup, init
still works — the corresponding toolchain entry is left as a
placeholder comment for the user to fill in.

If the project shape is unusual (no `package.json`, source not at
repo root, monorepo with workspaces), check
`docs/examples/typescript-vitest-eslint.md` for the canonical shape
and adapt; if no example variant matches yet, run init and adjust
the generated config manually.

### 2. Install + init

```bash
pnpm add -D @oftomorrow/effective    # or `npm install -D` / `yarn add -D`
npx effective init
```

Init writes three things:

- `effective.config.{ts,js}` at the repo root — the constitution
- An entry in `.gitignore` for `.effective/` (engine workspace)
- Possibly a comment in the config marked `// EDIT:` if init
  detected ambiguity (e.g., both vitest and jest in
  `devDependencies`). If you see an `// EDIT:` comment, surface it
  to the user and confirm the assumption before proceeding.

If `effective.config.{ts,js}` already exists, init prints
"already initialized" and does nothing. To regenerate, the user
runs `npx effective init --force`.

### 3. Review the generated config

Open `effective.config.{ts,js}` and check:

- `extends: ['recommended']` is present (the foundation rules + the
  catalogue come from this).
- `toolchain` entries point at scripts that actually exist in
  `package.json`. If a script has a different name than init
  assumed (e.g., `lint:check` instead of `lint:ci`), correct the
  toolchain entry. If init detected NO typecheck script, the line
  will be missing entirely — add it manually or skip back to
  pre-flight check 1.
- `exceptions: { ...seeds.builtInExceptions }` is present (the
  built-in templates). Project-specific exception instances will
  go below the spread as the user encounters them.

If any `// EDIT:` comment is present, resolve it with the user.

**Then apply the pre-flight overrides:**

- If pre-flight check 2 found existing unjustified suppressions, add
  the `exceptions.must-cite-justification` override (CRITICAL → HIGH)
  with rationale.
- If pre-flight check 3 applies (coverage below 90% with no plan to
  lift), add the `toolchain.coverage-meets-threshold` disable.

These overrides are NOT generated automatically by init — they
require the LLM (you) to identify the conditions and propose the
config edits.

### 4. Establish baseline with `audit`

Before running `verify`, run `audit` to surface what's already in
the codebase that the constitution would flag. This is the
load-bearing step that makes diff-based `verify` meaningful — if
the baseline already contains 200 hardcoded secrets, then `verify
--against main` only catches the 201st one and gives the adopter
a false sense of protection over the prior 200.

```bash
npx effective audit
```

What audit does:

1. Walks the repo for source files
2. Runs every applicable rule against current state (not a diff)
3. Reports findings grouped by severity + a list of rules it
   couldn't run (diff-only, lane, meta, toolchain by default)
4. Exits 0 regardless — audit is informational, not a gate

Triage the findings into one of four buckets:

- **Fix the code.** The right answer for most findings if the
  fix is small and the rule is clearly applicable.
- **Register an exception.** For suppressions that need to stay
  (legitimate `@ts-expect-error`, `c8 ignore`, etc.) — add the
  cited entry to the `exceptions` field. See decisions.md §
  "New exception vs. fix the code."
- **Override the rule's severity.** For rules the project will
  eventually satisfy but can't right now (typically the
  CRITICAL → HIGH downgrade for `exceptions.must-cite-justification`
  in legacy codebases with many existing suppressions).
- **Disable the rule.** For rules that don't apply to the
  project at all.

Audit also reports which rules it skipped and why:

- `diff-only` — these rules need a diff to be meaningful (e.g.,
  `migration-has-exercising-test`, `new-exports-have-non-test-callers`).
  Run via `effective verify` instead.
- `lane-no-scope` — lane rules need an editable lane to compare
  against; audit has no scope.
- `meta-no-report` — meta rules read an agent self-report; absent
  in audit.
- `toolchain-not-included` — by default. Pass `--include-toolchain`
  if you want lint/typecheck/test/coverage rules to run in the
  audit (slow; useful for full baseline establishment).

A baseline is "clean" once audit produces no findings (or only
findings the user has explicitly decided to accept via the four
triage paths above). Until the baseline is clean, `verify` against
diffs is incomplete — invisible debt accumulates outside the diff
window.

### 5. First verify

The first run is slow (1–5 minutes) because it installs an
isolated `node_modules` into `.effective/node_modules`. Tell the
user this BEFORE running verify so the delay is expected, not
alarming.

```bash
npx effective verify --against main
```

What happens:

1. Loads `effective.config.{ts,js}` from the project root
2. Creates a worktree at `.effective/work` pointed at the current HEAD
3. Runs lint / typecheck / test / coverage in the worktree
4. Diffs current HEAD against `main` and runs all the rules
5. Reports findings + a verdict (PASS / FAIL / NEEDS-REVIEW)

Three likely outcomes:

- **PASS, 0 findings** — the project's current state satisfies the
  constitution. Move on to step 5.
- **FAIL on toolchain rules** — the worktree's `pnpm lint` /
  `pnpm test` failed. See `docs/failure-modes.md` § Toolchain
  execution. Common cause: the worktree dependency install hit a
  private-registry or peer-dep issue.
- **FAIL on rule findings** — the diff or codebase has real
  violations. Read each finding's `ruleId`, `message`, and
  `evidence`. Surface them to the user; help them decide whether
  to fix, override, or disable each (see
  `docs/decisions.md` § Disable vs. override).

### 6. Wire into CI

For PR workflows, add a CI step:

```yaml
- name: effective verify
  run: |
    if [ -n "${{ github.event.pull_request.base.ref }}" ]; then
      BASE="origin/${{ github.event.pull_request.base.ref }}"
    else
      BASE="HEAD^"
    fi
    npx effective verify --against "$BASE"
```

This runs `effective verify` against PR base on pull_request events
and against `HEAD^` on push events. The CI step fails when the
verdict fails (exit code 1).

If the project's CI already exists and runs its own lint / typecheck /
test gates directly, the user may want to disable the `toolchain.*`
rules in the config so `effective verify` covers only the rule-based
checks (pattern / lane / custom). See
`docs/examples/typescript-vitest-eslint.md` § Adaptation for the
disable block.

---

## Programmatic-API integration (long-running agent runners)

When the user is wiring `prepare` + `verify` into their own runner
(not invoking the CLI from CI), three additions matter beyond what
the CLI exposes:

**`prepare()` returns `PreparedAgent`, not a bare string.** The
shape is `{ prompt, scope, config, mode }`. Spread the bundle into
`verify` — the type system then enforces that the scope and config
the worker was prepared against are the same ones verify evaluates
by:

```ts
const prepared = prepare({ scope, config, original });
// dispatch agent with prepared.prompt
const result = await verify({ ...prepared, source });
```

Without the bundle, the two calls were independent and drift was
caller-hygiene. This is the canonical pattern.

**`mode: 'concise'` for high-frequency dispatch.** Default `'full'`
emits every applicable rule's full guidance + examples + checklist
(15–30 KB depending on rule count). `'concise'` emits role
identity + editable paths + expectations + one-line summary of
each rule (~3–5 KB). For a runner doing per-step dispatch on every
agent step (sometimes hundreds per workflow), the token bill at
production scale matters. The verify + kickBack loop is the safety
net — kickBack re-emits a tripped rule's full guidance on retry,
so the agent learns specifics on demand rather than memorizing
the catalogue up front.

Use `'concise'` at per-step dispatch when verify is the gate; use
`'full'` (default) when an agent is new to a role, in
retrospective dialog, or when dispatch is infrequent.

**`skipCategories: ['toolchain']` for per-step gating.** At
intermediate workflow steps, spawning lint / typecheck / test is
slow (1–5s per run) and wrong by design (a test-writer's commit is
supposed to fail `toolchain.tests-pass` because implementation
lands later). For inline-source per-step verify, skip the
toolchain category cleanly:

```ts
const result = await verify({
  ...prepared,
  source: { kind: 'inline', changedFiles },
  skipCategories: ['toolchain'],
});
```

Toolchain rules still fire at PR time via the CLI `effective
verify --against main` against the committed branch. Skipped rules
appear in `result.skipped` with reason `'category-excluded'`.

For surgical opt-outs by rule id, `skipRules: ['rule.id']` is
parallel.

See `docs/examples/agent-loop-integration.md` for the canonical
runner wiring (template load → interpolate → prepare → dispatch →
verify → kickback).

## Worktree-iteration affordances

For adopters debugging a verify failure or iterating on the
constitution itself, two CLI flags matter:

- **`--keep-worktree`** — default is `on-pass`: the `.effective/work`
  worktree is preserved if the run produced any CRITICAL finding so
  the user can `cd .effective/work && pnpm typecheck` and see the
  real error. Pass `--keep-worktree=always` for unconditional
  preservation (iterating on the constitution), `=never` for
  ephemeral CI runners. Programmatic-API equivalent:
  `verify({ ..., keepWorktree: 'always' })`.

- **`--skip-install`** — by default `prepareWorktree` runs the
  project's lockfile install in the worktree after `git worktree
add`. This is what gives workspace projects their per-package
  `node_modules`. When iterating with a pre-populated worktree
  (combine with `--keep-worktree=always`), `--skip-install` skips
  the re-install for fast turnaround. Programmatic:
  `verify({ ..., skipInstall: true })`.

---

## Common project-shape variations

The `docs/examples/` directory covers project shapes one at a time.
For shapes not yet covered, the canonical example
(`typescript-vitest-eslint.md`) plus these notes is usually enough.

### Project has a `migrations/` directory

The `migration-has-exercising-test` rule (CRITICAL, real detection)
fires when a diff adds a file under `migrations/` (or `migration/`)
with extension `.sql` / `.ts` / `.js` / `.mjs` / `.cjs` AND no test
file in the same diff contains the migration's filename stem.

Three reasonable stances:

1. **Project has DB tests** — leave the rule on. Make sure new
   migrations land alongside a test that references the migration's
   filename stem (it can be a simple `it('0042_user_role applies'…)`).
2. **Project has migrations but no DB test infra yet** — `disable`
   with rationale pointing at the work needed to add test infra.
3. **Project's "migrations" aren't actually database migrations**
   (e.g., a migrations script for an in-memory store) — `disable`
   with rationale explaining the mismatch.

Don't add a `migration-writer` role proactively. Roles earn their
name when a workflow has both a consistent editable lane AND
expectations that diverge from `code-writer`. If the user later
finds they want agents specifically scoped to migration edits, a
role is the right shape; until then, scope-level `editable` overrides
suffice.

### Project is a monorepo

Running `effective init` at the repo root produces one config
covering the whole tree. Workspaces don't get individual configs.
The `lane` rule's editable patterns should mention the workspace
roots (`'packages/**'`). Toolchain commands should run from the
repo root and exercise all workspaces; if your test command is
per-workspace, point the toolchain `test` entry at a root-level
script that invokes all workspaces.

### Project is JavaScript-only

Init detects no `tsconfig.json` and emits `effective.config.js`
with `module.exports` + `require()`. The rule set is unchanged.
TypeScript-specific exception categories
(`type-narrowing-of-impossible`, `loose-generic-bridge`) are still
in the registry — they just don't apply.

### Project uses Jest (not Vitest)

Init detects the test framework from `devDependencies`. Jest is
detected via `jest` or `@types/jest`. The reporter flag emitted is
`--json` (jest's JSON-output flag), not `--reporter json` (which is
vitest's). Single-framework-jest projects get the right flag without
any `// EDIT:` marker. Only the `vitest + jest both present` case
flags ambiguity — single-framework detection is unambiguous.

### Project uses npm (not pnpm or yarn)

Init detects npm from `package-lock.json` (or the `packageManager`
field if no lockfile). For npm, init inserts the `--` separator when
forwarding flags to scripts:

```ts
toolchain: {
  lint: 'npm run lint -- --format json',
  test: 'npm run test -- --json',
}
```

The `--` is npm-specific; pnpm and yarn forward flags directly. Init
handles this automatically — no manual adjustment needed.

### Framework-specific lint wrappers (Next.js, Nuxt, etc.)

Some frameworks wrap ESLint behind their own CLI (`next lint`,
`nuxt lint`). These usually accept `--format json` forwarded through.
If the framework's wrapper rejects the flag, two options:

1. Replace the toolchain command with a direct ESLint invocation:
   `pnpm exec eslint . --format json`.
2. Disable `toolchain.lint-clean` and run the framework's lint
   command separately in CI.

Project-shape variants beyond the canonical TypeScript + Vitest +
ESLint case are not yet covered by their own example doc — adopt
from the canonical one and adjust the toolchain section.

## When the user has a choice, consult `docs/decisions.md`

The decisions doc covers:

- **Disable vs. override a rule** — quick test: does the rule apply
  to the project at all (override), or not (disable)?
- **CustomRule vs. PatternRule vs. SchemaRule** — pick the simplest
  shape that expresses the check. Patterns are cheapest;
  custom-rule is the escape hatch.
- **New exception vs. fix the code** — exceptions are for recurring
  structural conditions, not one-off fixes.
- **New role vs. free-form scope** — a role earns its name when its
  expectations diverge from `code-writer` / `test-writer`.
- **Catalogue entry vs. foundation rule** — catalogue is for
  adversarial-by-optimization patterns with provenance; foundation
  is for general hygiene/security.

When the user asks "should I do X or Y?" and X/Y matches one of these
trees, follow the tree before answering.

---

## When something breaks, consult `docs/failure-modes.md`

Maps error shapes to causes and fixes. Most-common ones to memorize:

- **`No effective.config.{ts,js,...} found`** — init wasn't run, or
  verify is invoked from a directory outside the project tree.
- **`Invalid Constitution in <path>`** — Zod validation failed; read
  each bullet for the specific field issue.
- **`extends references unknown preset "recommended"`** — happens
  when calling `resolveConstitution` programmatically without
  registering the preset; the CLI auto-wires it.
- **Worktree install fails on first verify** — registry auth,
  peer-dep conflict, or lockfile mismatch. Run the install command
  in the project root first to confirm it works there.
- **`no-hardcoded-secrets` false-positive on a test fixture** —
  construct the token at runtime via concatenation
  (`'AKIA' + 'IOSFODNN7EXAMPLE'`) so the file source doesn't contain
  the contiguous shape.
- **A rule's prompt is descriptive but `verify()` never flags it** —
  the rule is stubbed (real detection not yet implemented). See
  README §Status for the per-rule split.

---

## `npx effective audit-escapes`

A read-only command that walks the repo, finds every suppression
comment (`eslint-disable`, `@ts-expect-error`, `c8 ignore`,
`prettier-ignore`), and reports which ones lack an `exception-id:`
reference.

```bash
npx effective audit-escapes
# Found 30 escape hatch(es) without an `exception-id:` ref:
#   src/api/auth.ts:42  [eslint-disable]  (no exception-id)
#   src/db/conn.ts:88  [ts-expect-error]  (no exception-id)
#   ...
```

`--all` shows every hatch including the ones already cited.

What to do with the output:

1. For each unjustified hatch, decide: fix the code (remove the
   suppression), or keep it and register an exception. Don't
   batch-create exceptions blindly — each one needs a real
   category, context, mechanism, and retirement condition.
2. As exceptions are registered (added to the `exceptions` field in
   `effective.config.{ts,js}`), update each suppression comment with
   the citing form, e.g. `// eslint-disable-next-line no-explicit-any
-- exception-id: our-loose-generic-bridge`.
3. Once `audit-escapes` reports zero unjustified hatches, the
   `exceptions.must-cite-justification` override (if you added one in
   pre-flight) can be promoted back to CRITICAL.

The command is purely read-only — it doesn't modify files or write
to the registry. It surfaces the inventory; the classification is the
user's call (with your help).

## What NOT to do

### Don't fabricate exception instances by scanning the user's codebase

`audit-escapes` surfaces unjustified suppressions; it does NOT
classify them. If you're helping the user adopt, do not generate
exception entries automatically from the audit output — each entry
needs a real category, context, mechanism, and retirement condition
that comes from understanding the suppression, not from grep.
Surface the audit output, walk the user through classifying each (or
batches of similar ones), and write the exception entries with their
input.

### Don't disable rules to make verify pass

The temptation is real: a project fails verify, you propose
disabling the failing rules so it passes. This defeats the purpose.
The right path is:

1. If the rule doesn't fit the project → `disable` with rationale.
2. If the rule fits but can't be satisfied now → `override` to a
   lower severity with rationale + retirement condition.
3. If the rule fits and can be satisfied → fix the code.

The "disable to make green" path is a code smell. Surface what's
failing; help the user choose the right action; don't reach for
disable as the default.

### Don't infer the user's intent on `disable` vs. `override` without asking

These have different downstream implications. `disable` is a
statement that the rule never applies here. `override` is a
statement that the rule applies but you'll satisfy it eventually.
The rationale you write should match the user's actual intent. If
the user says "skip this rule," ask: "permanently, or until you've
caught up?" before picking.

### Don't write code comments that say "this is fine because X"

If a suppression needs explanation, it needs an exception entry, not
a free-form code comment. The exception's `context` field is where
the "why" lives. Code comments cited as the justification drift
across refactors and become invisible debt — exception entries
don't, because they're tracked in the constitution.

**BAD** (code comment as justification):

```ts
// eslint-disable-next-line no-explicit-any
// This is fine because the SDK's return type is wrong
const result = sdk.query(input) as any;
```

The "this is fine because…" line is read by humans, ignored by every
tool. A refactor moves the suppression; the comment doesn't follow.
Three months later nobody remembers why.

**GOOD** (exception registered + cited):

```ts
// eslint-disable-next-line no-explicit-any -- exception-id: sdk-return-type-drift
const result = sdk.query(input) as any;
```

```ts
// ...in effective.config.ts...
exceptions: {
  ...seeds.builtInExceptions,
  'sdk-return-type-drift': {
    id: 'sdk-return-type-drift',
    category: 'external-library-drift-defense',
    mechanism: 'eslint-disable',
    context: "SDK v3.x return types declared as 'unknown'; runtime returns the documented shape.",
    retirementCondition: 'Resolved when SDK ships proper return types (tracked: sdk-issues/1234).',
    addedDate: '2026-05-12',
    status: 'active',
  },
},
```

The cite is the load-bearing link: `verify` validates that
`sdk-return-type-drift` resolves to an active entry. The context and
retirement condition live in the registry where they're durable
across refactors and queryable by `audit-escapes`.

### Don't claim a rule fired when it didn't

If you tell the user `verify` flagged something, that should be
verifiable in the actual command output. Don't say "verify would
catch this" as if it had run. Run it or say you haven't. The same
discipline `effective` enforces on workers applies to you when
helping with it.

---

## Failure modes this doc was designed against

Specific gaps that surfaced when fresh LLMs tried to onboard a
hypothetical project using only these docs. The doc structure exists
to prevent each one; future contributors should preserve the
relevant section when revising.

- Missing toolchain scripts produce silent gaps → Pre-flight 1.
- First-verify drowns adopters with dozens of unjustified-suppression
  CRITICALs → Pre-flight 2 + the audit-escapes section, with a
  single-hatch vs. many-hatch split.
- `toolchain.coverage-meets-threshold` fires when project coverage
  is below 90% → Pre-flight 3.
- Internal vocabulary (catalogue, foundation rule, adversarial-by-
  optimization) used without definition → Glossary.
- `prepare()` / `verify()` / `kickBack()` mentioned as if all three
  are user-facing; CLI adopters only see `verify` → Opening paragraph.
- `audit-escapes` referenced without explanation → dedicated section.
- Migrations guidance scattered → "Common project-shape variations"
  subsection.
- Jest-only flag (`--json` vs. vitest's `--reporter json`) only
  documented in the ambiguity-path → jest-only subsection under
  project-shape variations.
- npm `--` separator only documented in example-doc adaptation →
  npm subsection under project-shape variations.

If you hit a new failure mode while helping a user adopt, capture it
in the same one-liner format and propose adding it.

## Capture failure modes as you go

When you hit a snag while helping a user — a doc that didn't cover
their case, an error message you couldn't diagnose from existing
docs, a workflow that confused you — note it. Failure modes the
docs prevent get added to `docs/failure-modes.md`. Your observations
become future LLMs' onboarding context.

Format for capture (you can surface this to the user as you go):

```
- Trying to: <what>
  Doc said: <what you found>
  Got stuck because: <what was missing or wrong>
```

This is the same shape `effective` uses for its catalogue: record
observed failures so the structure can prevent recurrence.

---

## Quick references

- **Common-shape example:** `docs/examples/typescript-vitest-eslint.md`
- **Decision trees:** `docs/decisions.md`
- **Failure modes:** `docs/failure-modes.md`
- **Status (real vs. stubbed):** [README § Status](../README.md#status-v010-rc1)
- **Full design context:** [DESIGN.md](../DESIGN.md), [USAGE.md](../USAGE.md)
- **Catalogue of failures the package defends against:**
  `schemas/failures.ts`

When the user asks a question this doc doesn't answer, consult the
right secondary doc — don't synthesize from memory.
