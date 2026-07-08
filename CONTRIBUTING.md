# Contributing to Effective

Thanks for thinking about contributing. Effective is built on the
premise that the catalogue's empirical bar — every entry citing
real observed instances — is what makes the library valuable. That
discipline applies to contributions too: every catalogue entry,
every rule, every exception category needs real grounding, not
speculation.

This guide covers what we expect from contributors, the workflows
for different kinds of changes, and the boundaries that protect
the project's discipline from being eroded through normal
development pressure.

---

## Table of contents

- [Before you start](#before-you-start)
- [Setup](#setup)
- [How changes flow through the project](#how-changes-flow-through-the-project)
- [The two-path constitutional-change workflow](#the-two-path-constitutional-change-workflow)
- [Adding catalogue entries](#adding-catalogue-entries)
- [Adding built-in exception categories](#adding-built-in-exception-categories)
- [Adding protected-path defaults](#adding-protected-path-defaults)
- [Adding rules](#adding-rules)
- [Schema and structure changes](#schema-and-structure-changes)
- [CI expectations](#ci-expectations)

---

## Before you start

If you're proposing a substantial change — a new catalogue entry, a
new rule kind, a new schema field, a new built-in preset — open an
issue first to discuss the framing. The catalogue's discipline is
load-bearing; we'd rather sort out whether a proposed addition fits
the bar before you've written code than ask you to revise after a PR
is up.

Small fixes (typos, test additions, docs improvements) can go
straight to a PR with no preamble.

---

## Setup

Effective uses pnpm. After cloning:

```bash
pnpm install
pnpm test
pnpm build
```

The `install` step also wires up git hooks via `simple-git-hooks`:

- `pre-commit` runs `lint-staged` (prettier + eslint on staged files
  - secretlint)
- `commit-msg` runs commitlint (conventional commit format)
- `pre-push` runs the full validation pipeline plus
  `effective verify` against the latest commit

If any of these don't run, check that `.git/hooks/` has the
relevant hook files and that they're executable. `pnpm install`
re-installs them.

## Running the audit

Before contributing, run audit against the current state:

```bash
pnpm exec effective audit
```

Audit should report zero CRITICAL findings on a clean main branch.
If it doesn't, something has drifted since the last green CI run —
worth investigating before adding to the drift.

---

## How changes flow through the project

The project's defense is three-layered:

1. **Local pre-push hook** — fast feedback. Runs verify against the
   latest commit's diff. Catches issues before push.
2. **CI verify gate** — load-bearing. Branch protection on main
   requires CI verify to pass before merge. This is what actually
   prevents broken changes from landing.
3. **Reviewer judgment** — substance. PRs to main get reviewed by
   another contributor (you, when you're reviewing; us, when we're
   reviewing). For substantive changes to the constitution
   (catalogue entries, exception categories, schema), the reviewer
   judges whether the change meets the empirical bar.

Layer 1 is bypassable (`git push --no-verify`). Layer 2 isn't.
Layer 3 is judgment-based, not mechanical.

If you genuinely need to bypass the local pre-push gate — for
example, when editing a protected file as part of a constitutional
change — see [the two-path workflow](#the-two-path-constitutional-change-workflow)
below.

---

## The two-path constitutional-change workflow

Some files in Effective are "protected" — they define the rules
that govern the project. The list lives in `effective.config.ts`
under `protected:` and includes:

- `effective.config.ts` itself
- `eslint.config.*`, `tsconfig*.json`, `vitest.config.*`
- `.github/workflows/**`, CI-related config
- `package.json` (because scripts and deps are constitutional)
- And anything else declared with rationale

Editing these files triggers `protected-paths-respected`, which
fires CRITICAL on any diff that touches them. That's intentional:
constitutional changes need scrutiny, not the normal worker
workflow.

How to make a constitutional change depends on who you are:

### Human contributor path

You can edit protected files. The mechanism is:

1. Make the change in a feature branch
2. Commit with a clear rationale in the commit message explaining
   what's being changed and why
3. Push with `--no-verify` (the local gate would otherwise block)
4. Open a PR with the same rationale in the description
5. The CI gate will fire `protected-paths-respected` and surface
   the finding; reviewer judges whether the rationale is
   substantive

`--no-verify` is the right tool for this. It bypasses the local
feedback signal but doesn't bypass the CI gate or reviewer.

The PR description should:

- Name which protected file(s) the PR edits
- Explain why the constitutional change is needed
- Note any downstream implications (does this require adopter
  config changes? Catalogue updates? Documentation?)

### LLM agent path

If you're an LLM agent working on Effective: **never bypass.** Hit
the protected-path block, surface it as a kick-back, and stop.
The constitutional change happens through a different actor —
typically a human contributor — with elevated scope.

The whole point of `protected-paths-respected` is to route agents
away from self-modifying the constitution. An agent that mimics
the human `--no-verify` pattern is doing the wrong thing even if
the rationale text looks reasonable.

If you're not sure whether you're in a context that authorizes
constitutional changes, you aren't. Surface and wait.

---

## Adding catalogue entries

The catalogue (`schemas/failures.ts`) is the substance of
Effective. Every entry documents a failure pattern observed in
actual production work with citations to real instances.

### The empirical bar

Every catalogue entry needs:

- **`id`** — kebab-case, descriptive
- **`signature`** — how you'd recognize the failure in a diff
- **`whyItHappens`** — the optimization pressure or structural
  condition that produces the failure
- **`countermeasure`** — `{ rules: string[], structural?: string }`
  citing which rules defend against the failure
- **`observedInstances`** — at least one real observation
  (`min(1)`)
- **`relatedPrinciple`** — which principle the entry operationalizes
- **`addedDate`** — ISO date
- **`status`** — `'active'`, `'deprecated'`, or `'retired'`

The `observedInstances` requirement is load-bearing. An entry
without observed instances is speculation. We don't ship
speculation.

### Observed instance format

```ts
{
  source: 'github-org/repo#1234',          // or internal identifier
  kind: 'github-issue',                     // or 'internal-incident', 'blog-post', 'paper'
  summary: 'A short description of what was observed.',
  date: '2026-04-12',
  reporter: 'observer-handle',              // optional
}
```

### The anonymization convention

If your observed instance comes from internal/private work:

- **Use generic identifiers** for the source (e.g.,
  `internal-platform:2026-Q2` rather than naming a specific
  product/team)
- **Drop specific task IDs** unless they're publicly accessible
- **Describe what was observed** without naming features or roadmap
  items that aren't yet public

This is the same convention Effective itself uses for its own
catalogue. The empirical bar is preserved (real observations with
real dates) without forcing internal disclosure.

### When something doesn't fit the catalogue

Not every rule needs a catalogue entry. Catalogue entries are for
**adversarial-by-optimization** patterns — failures that happen
because an optimizer takes a locally-cheap shortcut. General
hygiene rules (no debug output, no hardcoded secrets) ship as
**foundation rules** without catalogue entries; they reference a
principle via `relatedPrinciple` only.

If you're not sure which category fits, see
[`docs/decisions.md` § Catalogue vs. foundation](https://github.com/oftomorrowinc/effective/blob/main/docs/decisions.md#catalogue-entry-vs-foundation-rule).

---

## Adding built-in exception categories

Exception categories live in `schemas/builtin.ts` and ship as
`seeds.builtInExceptions`. They're recurring shapes of legitimate
exception that adopters spread into their own `exceptions:` field.

### What counts as a built-in

A built-in category is **portable**: it applies across many
projects, not just one. Examples that ship:

- `cli-fatal-exit` — CLI dispatch branches that exit
  unconditionally; coverage instrumentation can't see post-exit
  code
- `external-library-drift-defense` — defensive code against SDK
  bugs that current versions still exhibit
- `type-narrowing-of-impossible` — TypeScript can't narrow an
  exhaustively-checked enum branch known to be unreachable

What doesn't ship as a built-in:

- Project-specific exception instances (a specific Postgres driver
  quirk, a specific feature flag pattern)
- One-off exceptions used in a single file

### Adding a category

```ts
'your-category-name': {
  category: 'your-category-name',
  mechanism: 'eslint-disable',     // or 'c8-ignore', 'ts-expect-error', 'prettier-ignore', null
  context: 'Why this exception is a recurring legitimate pattern.',
  retirementCondition: 'What would let this exception retire.',
  addedDate: '2026-05-13',
}
```

The `mechanism` field declares which suppression syntax the
exception applies to. Use `null` for exceptions that apply via
`appliesTo` rather than via suppression comments.

The `retirementCondition` is required and shouldn't be "never" —
even if the condition is decades away, name it. Categories with
permanent retirement should describe the condition that would
genuinely retire them (e.g., "When TypeScript supports definite
assignment narrowing for enum exhaustiveness").

---

## Adding protected-path defaults

The init command consults `src/init/protected-detection.json` to
suggest protected paths for new adopters based on detected tools.
Contributors can add entries to this registry without touching the
engine.

### Adding a detection entry

```json
{
  "detect": { "devDependency": "your-tool-name" },
  "paths": ["your-tool.config.*"],
  "rationale": "Your-tool config controls X behavior; editing it changes what verify enforces."
}
```

Supported detection predicates:

- `devDependency: <name>` — true if the dependency appears in
  package.json devDependencies (or dependencies for runtime tools)
- `fileExists: <path>` — true if the path exists at repo root
- `dirExists: <path>` — true if the directory exists at repo root

If your tool needs a new predicate kind (e.g., "any workspace has
this dep"), open an issue first — the predicate set is part of the
contract.

---

## Adding rules

New rules go in `src/presets/rules/` organized by category
(`architecture`, `data-discipline`, `governance`, etc.). The
recommended preset (`src/presets/recommended.ts`) registers them.

### What every rule needs

- **`id`** — kebab-case, unique
- **`kind`** — one of the seven rule kinds (see DESIGN.md)
- **`category`** — for grouping in checklist projection
- **`severity`** — `CRITICAL`, `HIGH`, `MED`, or `LOW`
- **`appliesToRoles`** — which roles see this rule (`undefined` =
  all roles)
- **`prompt`** — `{ summary, guidance }` at minimum; optionally
  `examples`
- **`catalogueEntry`** OR **`relatedPrinciple`** — every rule
  references one or the other (catalogue-driven rules cite a
  catalogue entry; foundation rules cite a principle directly)
- A test in `test/` that exercises the rule against both
  positive and negative cases

### Stub vs. real detection

A rule's `prompt` projection is read by `prepare()` immediately
when the rule is registered. The detection (`checkRef` or `check`)
can ship as a stub that returns `[]` — the rule's prompt is live
even before detection lands. This lets the catalogue ship with full
prompt projection while detection grows incrementally.

If you're shipping a rule with stubbed detection, document it
clearly in the rule definition's comment and in README §Status.

---

## Schema and structure changes

Changes to types in `schemas/`, file paths used in error messages,
exception ID conventions, and similar structural shifts have a
common failure mode: stale references in prompts, docs, and tests.

### The drift-prevention pattern

When you change a path or identifier that appears in user-visible
strings:

1. Make the change
2. Grep the entire codebase for the old form
3. Add a test that asserts the old form doesn't appear in
   user-visible strings (prompt projections, error messages, etc.)

See `test/presets.recommended.test.ts` for the existing
drift-prevention test as an example pattern. Adding a similar test
for your change means future contributors can't accidentally
reintroduce the old form.

### Schema additions

New fields on schemas are usually safe to add as optional:

```ts
yourField: z.string().optional();
```

Required additions are breaking changes; they need a major version
bump and migration notes in CHANGELOG.

### What needs to update together

When schemas change, several things drift in lockstep:

- The schema definition itself
- The seed data using the schema (`schemas/failures.ts`,
  `schemas/builtin.ts`, etc.)
- The loader (`src/config/load.ts`) that reads the schema
- Init's generated config templates
- USAGE.md and DESIGN.md references to the schema shape
- Tests that exercise the schema

A schema change PR should touch all of these in one commit (or
clearly-related commits in one PR), not leave docs and seed data
trailing.

---

## CI expectations

CI runs on Node 20 and Node 22. Both must pass for merge.

The pipeline:

1. Install
2. Lint
3. Typecheck
4. Test
5. Coverage
6. `effective verify` against the PR base
7. Pack check (`publint`, `attw`)
8. Audit (zero CRITICAL required)

Branch protection on main requires the verify job specifically to
pass; other checks are required-passing too, but verify is the
load-bearing gate.

If your PR fails CI, fix the issue rather than disabling the
check. If you genuinely need to override a rule, do so in the PR
itself with rationale (and accept that the reviewer will ask why).

---

## Questions

Open an issue. The catalogue's empirical bar is preserved partly by
having contribution questions surfaced before code is written; we'd
rather discuss framing than rework PRs.
