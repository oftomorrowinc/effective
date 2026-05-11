# Design

> **Who this is for.** Anyone evaluating the project, considering contributing,
> debugging unexpected behavior, or wondering "why doesn't it work like X?"
> This document captures the reasoning behind every load-bearing decision —
> including the alternatives we considered and rejected.
>
> If you want to know **how** to use the package, see [USAGE.md](./USAGE.md).
> If you want a fast pitch, see [README.md](./README.md).

---

## Table of contents

- [The framing](#the-framing)
  - [What this package is, in one sentence](#what-this-package-is-in-one-sentence)
  - [Leadership, not management](#leadership-not-management)
  - [Strict is standard](#strict-is-standard)
  - [The constitution is the substance](#the-constitution-is-the-substance)
  - [Worker-agnostic by design](#worker-agnostic-by-design)
- [The architecture](#the-architecture)
  - [Three pure functions, not pass-through](#three-pure-functions-not-pass-through)
  - [One rule, two projections](#one-rule-two-projections)
  - [The role-aware scope](#the-role-aware-scope)
  - [Verify owns the worktree](#verify-owns-the-worktree)
- [The schema model](#the-schema-model)
  - [Finding as the lingua franca](#finding-as-the-lingua-franca)
  - [Severity as a four-level enum](#severity-as-a-four-level-enum)
  - [Rule as a discriminated union](#rule-as-a-discriminated-union)
  - [Constitution with disable and override](#constitution-with-disable-and-override)
- [The catalogue](#the-catalogue)
  - [Catalogue entries vs. rules vs. principles](#catalogue-entries-vs-rules-vs-principles)
  - [Attribution as a first-class field](#attribution-as-a-first-class-field)
  - [Append-only with deprecation](#append-only-with-deprecation)
- [The exceptions registry](#the-exceptions-registry)
  - [Categories vs. instances](#categories-vs-instances)
  - [Gradual adoption via severity override](#gradual-adoption-via-severity-override)
- [Rejected alternatives](#rejected-alternatives)
  - [Why not pass-through with credential handling](#why-not-pass-through-with-credential-handling)
  - [Why not a runner](#why-not-a-runner)
  - [Why not bundle the LLM review pass](#why-not-bundle-the-llm-review-pass)
  - [Why not bare-scope `@effective`](#why-not-bare-scope-effective)
  - [Why not LangChain-style orchestration](#why-not-langchain-style-orchestration)
  - [Why not "make agents behave"](#why-not-make-agents-behave)
  - [Why not include workflow shape opinions](#why-not-include-workflow-shape-opinions)
  - [Why not separate packages for lanes/runner/scoping](#why-not-separate-packages-for-lanesrunnerscoping)
  - [Why not auto-detect everything](#why-not-auto-detect-everything)
  - [Why not predicates instead of boolean expectations](#why-not-predicates-instead-of-boolean-expectations)
- [Future directions](#future-directions)

---

## The framing

### What this package is, in one sentence

A shared constitution for collaborative work on a codebase, with mechanical
enforcement that runs against any worker's output — agent, human, or script.

The two halves of that sentence each matter:

- **"Shared constitution for collaborative work"** — the package's substance
  is the constitution itself, not the engine that runs it. The constitution is
  the accumulated knowledge: failure patterns observed in real codebases, the
  rules that detect them, the principles that motivate the rules.
- **"Mechanical enforcement against any worker"** — the engine doesn't care
  who produced the diff. LLM agents, human authors, automated scripts —
  everyone faces the same standards. The output is what gets verified, not
  the producer.

### Leadership, not management

The deepest design choice in this package: it is a leadership tool, not a
management tool.

Most "agent quality" tooling positions itself as infrastructure for the
operator — _use this to control what your agents do._ This package positions
itself as infrastructure for the work — _use this to make sure the work meets
the standard, regardless of who or what produced it._

This isn't a stylistic distinction. It shapes every API choice. Where a
management tool would expose levers for "make the agent do X" and "prevent
the agent from doing Y," this package exposes levers for "what does done look
like" and "did we get there?" The agent is a collaborator who shares the
goals; the constitution is the artifact you both agree to.

Practical consequences:

- The augmented prompt produced by `prepare()` explicitly tells the worker
  it has the time to do the work right and won't be punished for honest
  failure. This is the opposite of optimization pressure.
- Kick-back prompts cite specific rules and evidence, not vague disapproval.
  The worker can see exactly what to fix.
- Findings are structured and rule-referenced, not free-form criticism.
  The relationship is "here's what the standard says, here's where the output
  diverged" — not "you did wrong."

This framing also makes the package durable. If it were positioned narrowly
as "make LLMs behave," it would have a sell-by date — eventually models stop
producing today's specific failures and the tool becomes a curiosity. But
"shared standards for collaborative work, with mechanical enforcement,
regardless of who produced the output" is permanent. The catalogue's contents
shift over time as observed patterns evolve. The idea that work should meet
documented standards verifiable against the output doesn't go away.

### Strict is standard

The recommended preset ships every rule at its full intended severity. We do
not ship a "permissive" or "minimal" variant.

Permissive defaults teach teams the wrong defaults. ESLint shipped permissive
by default and the result was a decade of codebases where lint rules were
never enabled. The package learns from that and inverts the default.

Every rule can be downgraded per-project via the `override` mechanism in
`effective.config.ts` (severity → `HIGH`, `MED`, or `LOW`) or disabled
entirely with rationale via `disable`. But the starting position is full
strictness. Adoption is gradual _toward_ strict, not gradual _away from_ it.

### The constitution is the substance

The package's value isn't the three exported functions. It's the constitution
they enforce.

ESLint's value isn't the AST traversal engine — it's the thousands of rules
contributed over a decade. Same story here. The three functions are a small
amount of code that becomes valuable once it's pointed at a real constitution
with real rules.

This reframe matters for adoption. A package that ships _only the engine_
asks every user to invent their own rules, which most teams won't do because
inventing rules is research, not configuration. A package that ships _a
constitution_ — with rules, principles, exception categories, failure
patterns — gives users immediate value on day one. They install, run init,
and instantly get the accumulated knowledge of dozens of observed failures
applied to their codebase.

The catalogue is the long-term moat. The engine could be reimplemented in
a weekend by someone motivated. The catalogue — with empirical observed
instances, contributed by real teams across years — cannot.

### Worker-agnostic by design

The same `verify()` works for LLM-produced diffs, human-produced PRs, and
script-generated changes. The catalogue describes failure patterns observed
when work is produced under pressure, and most of those patterns happen with
human authors too — just less observably.

Concretely: a human opening a PR can run `verify()` locally before pushing.
A CI job can run `verify()` on every merge regardless of who authored the
change. The same rules apply.

This design choice is what makes the package useful beyond the agent moment.
It also avoids the trap of "agent tooling" — once you build infrastructure
specifically for agents, you've committed to maintaining that infrastructure
as agent patterns shift, which is a moving target. Building for _work output_
is stable.

---

## The architecture

### Three pure functions, not pass-through

The package exports three pure functions:

- `prepare({ scope, config, original })` → augmented prompt
- `verify({ scope, config, source })` → verdict + findings
- `kickBack({ findings, previousPrompt })` → next prompt

The user owns the loop, the model client, the credentials, the iteration
budget. The package is consulted at three points; it never makes a network
request and never sees a model API key.

**The alternative we rejected was pass-through** — a wrapper that takes the
user's prompt, manages the model call, runs verification, and returns "the
final output, it's done" after iterating until clean. That shape was tempting
because it would be ergonomic for the common case. We rejected it for four
reasons that are worth recording (see [Rejected alternatives](#why-not-pass-through-with-credential-handling)
for the full discussion).

The library-not-service shape has a real cost: users have to write the loop
themselves. We mitigate that with a 30-line example in the README that shows
the entire integration. It's small enough that copy-paste works as a starting
point. But the cost is real and we accept it.

### One rule, two projections

The deepest invariant in the package: every rule object produces both
the prompt projection (what the worker reads as guidance) and the check
projection (what the verifier runs against the diff). They come from the same
Zod value.

```ts
rule.noDisabledTestsWithoutException();
```

When `prepare()` reads this rule, it adds to the augmented prompt:

> Do not add `.skip`, `.todo`, `xit`, or `xdescribe` to tests without a
> tracked exception ref in a comment. Disabled tests without a justified
> exception will be detected and kicked back.

When `verify()` reads the same rule, it greps the diff for those patterns
and resolves each against the project's exception registry. Disables without
refs produce a `CRITICAL` severity finding.

There is no path where the prompt says one thing and the checker says another.
Both projections derive from the same source.

This is what makes the discipline durable. When you add a rule, both
projections update. When you change a rule, both update. When you disable a
rule, both go silent. The worker's understanding of "what counts as done"
can never drift from the verifier's understanding, because they share a
source of truth.

**The alternative we rejected** is keeping these separate — instructions live
in prompts, checks live in CI configs, the two layers are maintained
independently. That's how most teams operate today, and it's why instructions
and checks drift. Workers under optimization pressure exploit the drift:
"the prompt didn't mention X, so X must be OK." When prompt and check come
from the same value, that path closes.

### The role-aware scope

The `scope` object passed to `prepare()` and `verify()` carries the role of
the work:

```ts
{
  goal: 'Add a rate limiter to /api/signals',
  role: 'code-writer',
  editable: ['app/api/signals/**', 'lib/rate-limit/**'],
  expectations: { allTestsPass: true, lintClean: true },
}
```

Different roles have different success criteria. A test-writer's expectations
differ from a code-writer's: the test-writer is supposed to produce _failing_
tests for unimplemented behavior (that's the point); a code-writer is
supposed to produce _passing_ tests. Without role-aware expectations, every
step would have to encode its own validation logic, and we'd be back to
hand-coded per-step validation.

The four built-in roles ship with sensible expectation defaults:
`'test-writer'`, `'code-writer'`, `'reviewer'`, `'free-form'`.

Custom roles are first-class extensions, not afterthoughts. Any project
can declare its own roles in `effective.config.ts`:

```ts
roles: {
  'migration-writer': {
    defaultEditable: ['migrations/**', 'test/migrations/**'],
    expectations: { newMigrationExists: true, existingTestsPass: true },
  },
  'docs-writer': {
    defaultEditable: ['docs/**', '**/*.md'],
    expectations: { lintCleanForEditableFiles: true },
  },
},
```

A custom role contributes a name, default editable globs, and a set of
expectations — the same shape as the built-in roles. Scope objects that
reference custom roles get the role's expectations applied the same way
built-in roles do. The package treats the four built-ins as the starting
set, not the only set. Workflows that decompose work differently from
the test-writer / code-writer split (migration-driven, docs-driven,
schema-evolution-driven, security-review-driven) get to express their
roles natively instead of forcing the work into one of the four
built-ins.

**The alternative we rejected** was adding a fourth function — `runTests()`
or `runValidation()` — that each step would call with a role-specific
context. That doubled the API surface for no real benefit. The role context
naturally lives on `scope`; `verify()` is the same function regardless of
role.

Other rejected variants: predicates instead of boolean expectations (see
[Why not predicates instead of boolean expectations](#why-not-predicates-instead-of-boolean-expectations));
implicit roles derived from the editable paths (too magical; explicit is
better).

### Verify owns the worktree

When `verify()` runs, it creates an isolated git worktree at `.effective/work`
(in the project root, added to `.gitignore` by `npx effective init`) and runs
the toolchain there. Node modules are symlinked from a sibling
`.effective/node_modules` directory that persists between runs.

```
your-project/
├── .effective/
│   ├── node_modules/        # persisted; symlinked into work/
│   ├── work/                # active git worktree
│   └── cache/               # future use
```

Three reasons for this:

1. **Branch-agnostic verification.** You can verify a branch you don't have
   checked out, which is the right shape for CI jobs and batch verification.
2. **No contamination.** Verification never races with your dev server,
   never affects your editor's view, never leaves stale state behind.
3. **Speed via cached install.** First run is slow (initial install). Every
   subsequent run skips install entirely as long as `pnpm-lock.yaml` hasn't
   changed.

**Escape hatches** for users who want different behavior:

- `source: { kind: 'git', isolate: false }` — runs against the working tree
  directly. Faster but races with editor state.
- `source: { kind: 'worktree-direct', path }` — verify points at a worktree
  the user manages themselves. For sophisticated users with custom workflow
  infrastructure.

**Rejected alternatives:**

- _Verify against the user's working tree directly (no worktree)_: simple but
  contaminates the editor view and races with dev servers.
- _Verify branches without a worktree (via `git show`)_: works for file
  contents but the toolchain (lint, tests) needs a real filesystem with
  resolved `node_modules`. Branch-only verification would be capability-degraded.

---

## The schema model

### Finding as the lingua franca

Every rule emits `Finding[]`. Every toolchain parser emits `Finding[]`. The
LLM review pass (when present) emits `Finding[]`. The verdict from
`verify()` is computed from a flat `Finding[]`.

This uniformity is load-bearing. The `kickBack()` function consumes findings
without caring where they came from. Aggregating CI reports across runs
consumes findings without caring. Dashboards consume findings without caring.

```ts
interface Finding {
  ruleId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MED' | 'LOW';
  category: string;
  location?: { file: string; line?: number; endLine?: number; column?: number };
  evidence: string;
  message: string;
  source: { kind: 'rule' | 'toolchain' | 'llm-review'; ... };
}
```

The `source` field distinguishes findings that came from the package's own
rules vs. toolchain parser output vs. LLM review. This lets dashboards and
filters distinguish "issues the package detected directly" from "issues
ESLint detected and we wrapped." But the rest of the pipeline treats them
identically.

**Why not separate types per source?** Because the consumer doesn't care.
A `kickBack()` doesn't need to handle ESLint findings differently from
constitution findings. A "find all CRITICAL findings in this run" query is the
same regardless of source. Separating types would force translation code at
every boundary for no real benefit.

### Severity as a four-level enum

`CRITICAL | HIGH | MED | LOW`. Four discrete levels, not a numeric scale.

Numeric scales invite fiddling ("is this an 8 or a 9?"). Discrete levels
force clear classification. Each level has a specific operational meaning:

- **CRITICAL** — fails the verdict; work cannot ship until resolved
- **HIGH** — gets filed as a signal for follow-up; doesn't fail this verdict
- **MED** — accumulates for pattern detection (e.g., "we see this rule
  triggering across many tasks; maybe it's miscalibrated")
- **LOW** — style/preference; informational only

The four-level structure mirrors what your reviewer patterns evolved to in
production. CRITICAL is the only severity that fails the verdict, which keeps
the verdict computation trivial: `any CRITICAL in findings → fail`.

**Rejected alternatives:**

- _Two-level (critical/warn)_: too coarse. MED and LOW have legitimately
  different operational handling (pattern detection vs. style preference).
- _Numeric severity 1-10_: invites endless calibration debate; doesn't map
  cleanly to "should this fail the verdict?"
- _Severity per rule kind_: would let "lane rules are always CRITICAL, style
  rules are always LOW" emerge naturally, but loses the ability to downgrade
  a specific rule per project. The current `override` mechanism is more
  flexible.

### Rule as a discriminated union

The `Rule` type is a discriminated union of seven kinds:

```ts
type Rule =
  | SchemaRule // Zod schema validation against a structured artifact
  | PatternRule // regex/glob check against source files
  | LaneRule // file-boundary enforcement from scope.editable
  | SpecRule // test-name presence, assertion shape, spec conformance
  | ToolchainRule // wraps external tool output; translates to findings
  | MetaRule // reflexive check against agent self-report
  | CustomRule; // escape hatch; arbitrary user-provided check function
```

Each kind has a fixed shape with kind-specific fields plus a shared `RuleBase`
(id, category, severity, description, prompt projection). Adding a new rule
kind is a major API change; adding new rules within existing kinds is
additive.

**Why seven kinds and not more (or fewer)?**

Six of the seven survived after collapsing the rules in the seed catalogue
into their structural shapes. Earlier drafts had a separate `ExceptionRule`
kind for the escape-hatch-must-cite-justification rule; we collapsed it into
`PatternRule` because the structural check is the same (grep for the pattern,
resolve each match against the exception registry). The exception-resolution
logic lives in the engine, not in the type.

The seventh kind — `MetaRule` — is genuinely different in shape. Most rules
take a diff and produce findings: `(diff) => Finding[]`. Meta-rules take a
diff _and_ the agent's self-report, and produce findings by comparing the
two: `(diff, agentReport) => Finding[]`. They cover reflexive checks like
"the status line matches what actually shipped" and "claims in the build log
are corroborated by the commit state" — checks where the failure mode is the
agent's _description_ of its work diverging from the work itself, not the
work being wrong.

We could have extended the other rule kinds to accept an optional
`agentReport` argument that meta-rules read. We chose not to because:

1. Most rules don't need access to the agent report. Threading it through
   every check function adds API surface for no benefit.
2. Meta-rules have a distinct mental model. A pattern rule grepping the diff
   for `.skip` is a different _kind of thing_ than a meta-rule comparing the
   build log's claims to the diff's actual content. Giving them separate
   kinds makes that distinction explicit.
3. There are only a handful of meta-rules (roughly 5-7 in the seed
   constitution). A small new kind for a small set of rules is cleaner than
   extending every existing kind to handle them.

The `CustomRule` kind is the escape hatch. When a project has a check that
genuinely doesn't fit any of the other six kinds, it provides a function
reference in `effective.config.ts`. We didn't make `CustomRule` more
elaborate (no required input/output schemas beyond `Finding[]`) because
constraining the escape hatch defeats its purpose.

**The trade-off:** `SchemaRule` carries `z.unknown()` for the actual schema
because Zod can't carry a parameterized schema type through itself. The
engine accesses `rule.schema` directly, not via parse. This loses a little
type safety at the constitution-author site but no other practical option
exists. A wrapper type with a phantom parameter doesn't help when the schema
is read by a generic engine.

### Constitution with disable and override

The `Constitution` type lets a project customize what they inherited from a
preset:

```ts
defineConfig({
  extends: [presets.recommended],

  disable: {
    'spec.assertion-narrowed':
      'We use property-based tests; false positives here.',
  },

  override: {
    'exceptions-must-cite-justification': {
      severity: 'HIGH',
      rationale:
        'Existing escape hatches lack refs; downgrade now, retrofit gradually.',
    },
  },
});
```

`disable` turns a rule off entirely (no findings emitted). `override` keeps
the rule active but changes its severity. Both require rationale strings —
the same discipline as exception registrations.

**Why both?** Because they serve different use cases:

- `disable` is for rules that _don't fit the project at all_. Property-based
  tests really do produce different patterns than spec-named tests; disabling
  the rule is the correct response, not downgrading it.
- `override` is for rules that _fit the project but can't be satisfied yet_.
  An existing codebase with hundreds of unjustified escape hatches can't
  retrofit them overnight; downgrading the rule to `HIGH` or `MED` lets the
  team see what would have failed without blocking shipping.

Both require rationale strings because deviations from the standard must be
justified. This is the same discipline that makes the exceptions registry
valuable — escape hatches with justifications are tracked debt; escape hatches
without justifications are invisible debt.

---

## The catalogue

### Catalogue entries vs. rules vs. principles

Three layers, each with a distinct role:

**Principles** are load-bearing beliefs that motivate rules. They're the
philosophical layer: "Mechanical enforcement, not instruction-requested,"
"Unverified work is Failed not Success," "Strict is standard." Principles
are stable across the package's lifetime. New principles are rare.

**Catalogue entries** describe failure classes observed in real codebases.
Each entry has a signature (how you'd recognize the failure), why-it-happens
(the optimization pressure or structural condition that produces it),
countermeasure (typically a rule reference), and observed instances (the
provenance — citations to real-world occurrences).

**Rules** are the executable countermeasures. Each rule typically corresponds
to one catalogue entry (the structural countermeasure for that failure
class), though some catalogue entries may have multiple rules and some rules
may apply to multiple catalogue entries.

The relationship: principles motivate catalogue entries motivate rules.
You can navigate any direction: from a finding back to the rule that
produced it, then to the catalogue entry that documents the failure, then
to the principle that explains the philosophy.

**Why three layers and not two (or one)?** Because they're populated by
different processes:

- Rules are written by engineers in the package source.
- Catalogue entries are contributed by anyone who observes a failure
  pattern, with citations.
- Principles emerge from observed patterns when several catalogue entries
  point at the same underlying belief.

Two layers (rules + catalogue) would conflate "what we believe" with "what
we've observed." Three layers (rules + catalogue + principles) keeps the
belief / evidence / mechanism distinction clean. ESLint has a similar
implicit structure (style philosophy → "this kind of bug should be caught"
→ specific rules), but the layers are blurred. We make them explicit.

### Attribution as a first-class field

Every catalogue entry has `observedInstances: ObservedInstance[]` with
`min(1)` — at least one observation is required. An entry without a real
observation is speculative; we don't ship speculative entries.

```ts
{
  source: 'https://github.com/some-org/some-repo/issues/1234',
  kind: 'github-issue',
  summary: '35 disabled tests discovered at once during audit',
  date: '2026-04-12',
  reporter: 'observed-by-handle',
}
```

Two things this buys:

**Empirical credibility.** Every catalogue entry has provenance. Anyone
reading "tests get skipped under pressure" can click through to the actual
codebase where this happened. The catalogue isn't a list of things we
_think_ go wrong; it's a registry of things that _have_ gone wrong, with
receipts.

**Reciprocal contribution.** When someone observes a failure pattern in their
own work and contributes it back, their post or issue gets cited as the
source. Their diagnostic insight is credited. The contributor relationship
isn't "submit free labor to a project"; it's "the catalogue gets sharper
because of what you saw, and your name is in the receipt."

**Rejected alternative:** Cataloguing failures without attribution would be
faster but lose the credibility argument. A finding that cites
"according to common knowledge" or "we've heard of this pattern" is much
weaker than one that cites "this specific issue, observed on this date, by
this team." Attribution is the difference between a research catalogue and
a corporate blog post.

### Append-only with deprecation

Catalogue entries (and principles, and exceptions) are append-only in spirit.
Entries can be marked `deprecated` (pattern no longer occurring in practice)
or `retired` (formally removed), but the record of what the catalogue
learned is preserved.

The catalogue is a historical artifact, not a current-state snapshot.
Removing entries without trace would mean losing institutional memory of
patterns that mattered at some point. Even when a pattern stops occurring,
the _fact_ that it once occurred is informative — future contributors might
hit the same pattern and benefit from seeing it was observed before.

The `status` field has three values: `active`, `deprecated`, `retired`.
Retired entries are filtered out of the default-active set used by `verify`
but remain in the package source.

---

## The exceptions registry

### Categories vs. instances

The package ships _categories_ of exception (cli-fatal-exit,
external-library-drift-defense, type-narrowing-of-impossible, tty-bound,
zod-internal-introspection, etc.) — recurring shapes of legitimate exception
across TypeScript projects.

Projects compose these with their own _instances_ — specific exception IDs
that fall into the built-in categories or define new ones. Stored in
`.effective/exceptions.ts`.

```ts
// .effective/exceptions.ts
import { defineExceptions, builtin } from 'effective';

export default defineExceptions({
  ...builtin.exceptions,

  'our-postgres-driver-quirk': {
    category: 'external-library-drift-defense',
    context: 'pg@8.x leaves stale connections under specific error shapes',
    retirementCondition: 'Resolved when we migrate to pg@9 or postgres.js',
    addedDate: '2026-04-15',
  },
});
```

**Why categories AND instances?** Because exceptions have two scales of
recurrence:

- The _shape_ of an exception (defensive narrowing against SDK drift) recurs
  across many projects. Shape-level exceptions ship in the package.
- The _instance_ of an exception (pg@8.x specifically) is project-local.
  Instance-level exceptions live in the project.

Bundling our specific instances would force every adopter to inherit Core of
Tomorrow's specific 55 sites of library-drift defense, which isn't
generalizable. Bundling only the categories — the portable shapes —
gives adopters a meaningful starting set without forcing project-specific
context on them.

**Why ship 15 built-in categories at all?** A new adopter without any
built-in categories would have to invent exception categories from scratch
on day one. That's a research task, not a configuration task. Built-in
categories let them adopt with zero invention. They get the obvious
exception shapes covered immediately and define project-specific instances
as they encounter them.

### Gradual adoption via severity override

The `exceptionsMustCiteJustification` rule is `CRITICAL` severity in the
recommended preset. Existing codebases typically have hundreds of escape
hatches with no exception refs. We don't ask teams to retrofit all of them
before adoption.

The path is:

1. Adopt the package with the recommended preset.
2. Run `verify()`; see the wave of `CRITICAL` findings.
3. Add an `override` for `exceptions-must-cite-justification` to `HIGH` or
   `MED`, with rationale: "Existing escape hatches lack refs; downgrade now,
   retrofit gradually."
4. Continue shipping. Existing escape hatches are visible (as `HIGH`/`MED`
   findings) but don't block. New escape hatches added in a diff also
   surface as non-blocking signals.
5. As the team catches up, remove the override. The rule returns to
   `CRITICAL`. From that point forward, every new escape hatch needs an
   exception ref.

This pattern generalizes. Any rule that's hard to satisfy on day one of
adoption can be overridden to a lower severity with rationale, with the
override removed once the codebase catches up. The constitution stays whole;
your project's relationship to it grows over time.

**Why not just disable the rule?** Because disabling silences it; overriding
to a non-blocking severity keeps the findings visible. The team can see what
would have failed; they can prioritize which existing hatches to add refs
to first; they can decide whether new hatches added in a diff are
acceptable. Disable loses all of that signal.

---

## Rejected alternatives

This section captures the major design alternatives we considered and
rejected, with the reasoning. When future contributors propose "should we
just do X?" — and X is one of these — they get the original reasoning
intact rather than reconstructing it from scratch.

### Why not pass-through with credential handling

**The alternative:** the user hands their model API key to the package; the
package runs the entire agent loop internally (prompt → model call →
verification → kick-back → repeat) and returns the final output when verified.

**Why we rejected it:**

1. **Credential overreach.** Asking users to hand API keys to a package
   makes it a security review item. Every team has to verify what the
   package does with the keys, what it logs, where requests go. That's a
   massive adoption tax for what should be a library people drop in.

2. **Inherits every problem of the model client.** Streaming, retries, rate
   limits, model-specific quirks, new model releases, deprecation cycles,
   prompt caching, tool use protocols, structured output APIs, multimodal
   inputs. Anthropic ships a new feature on Tuesday; the package can't
   expose it until Wednesday. The Core of Tomorrow team's three-week delay
   when Anthropic changed output shape is the canonical example — a
   pass-through wrapper would have cost _every consumer_ those weeks.

3. **Couples to a specific agent loop shape.** Pass-through means the
   package runs the loop. But agent loops vary enormously: single-shot
   completion, multi-turn, ReAct, plan-then-execute, tool-use, fan-out,
   human-in-the-loop. The moment we own the loop, we have to support all
   of them.

4. **Hides the value being provided.** When the package returns "here's the
   final output, it's done" — the user doesn't see the discipline working.
   They don't see findings, kick-backs, rules that fired. The value is
   invisible. When the package is _consulted_ by the user's loop, every
   decision is observable.

The three-function shape (`prepare`, `verify`, `kickBack`) gives users
everything they'd get from pass-through but keeps the loop, the credentials,
and the model client on the user side.

### Why not a runner

**The alternative:** the package includes a runner that orchestrates
multi-step workflows (test-writer → code-writer → reviewer, with kick-back
routing between steps).

**Why we rejected it:**

Workflow orchestration is a different problem from quality verification.
The Core of Tomorrow platform built a sophisticated runner because the
platform needed one — fan-out/recombine semantics, lifecycle events,
per-step model selection, kick-back routing, tool-scoping per step. That
runner is right for that platform.

But not every consumer of this package needs (or wants) that runner. Many
teams already have orchestration via Claude Code, Cursor, Aider,
LangGraph, custom scripts, or just one big function in their codebase. If
we shipped a runner, we'd force adopters to either swap out their existing
orchestration or fight an opinionated layer they didn't ask for.

The clean separation: this package validates _a piece of work_ against a
constitution. A separate package (still TBD; potentially `@effective/scopes`)
could handle multi-piece work decomposition with role assignments. That's
a future package, not part of v1.

### Why not bundle the LLM review pass

**The alternative:** the package ships an `LLM review` pass that takes the
same constitution and uses a model to catch failures the deterministic
rules can't (e.g., "this function is poorly named," "this test doesn't
actually test the behavior the spec describes").

**Why we rejected it (for v1):**

The LLM review pass was in earlier drafts of the design. It was a clean
extension — same constitution, different consumer; same finding shape. The
reason we pulled it from v1:

1. **It distracts from the core 3-function story.** The README has to land
   the "three pure functions, you own the loop" pitch fast. Adding a
   fourth function (even one that's optional and tree-shakable) muddies
   that pitch.

2. **It's a credential-handling boundary even if minimized.** The review
   pass would take a `callModel` callback from the user, but the existence
   of the callback signals "this package interacts with models" — which
   conflicts with the "we never make a network request" framing.

3. **It deserves its own package.** If we ever ship LLM review, it earns
   its own scoped package (something like `@effective/review`) and its own
   design moment. Mixing it into the core package now would commit us to
   maintaining it forever in the same release cadence as the deterministic
   engine.

This is a deferral, not a rejection. LLM review pass is genuinely useful
for failure classes that deterministic rules can't catch. We'd revisit it
once the core package has adopters and we have evidence of where the
deterministic ceiling is.

### Why `effective` (unscoped) and not `@effective/core` or `@rigorous/core`

**The alternatives considered:**

- `@effective` — bare scope, no package name. Cleanest possible import
  (`from '@effective'`), but bare scopes aren't valid npm identifiers.
  Every npm package requires a name, even within a scope. Rejected on
  registry constraints.
- `@effective/core` or `@rigorous/core` — scope plus `core` entry,
  following the Babel / Vercel / AWS SDK v3 / Anthropic SDK pattern.
  Workable, but the scope adds friction at import sites and reserves a
  branding decision the project doesn't need yet.
- `rigorous` (unscoped) — the bare name is taken by an abandoned 2018-2019
  package. Reclaiming via npm's dispute process is months of effort with
  no guaranteed outcome. Not worth the wait.

**What we chose:** `effective`, unscoped. Imports read `from 'effective'`,
the CLI is `npx effective`, and the config file is `effective.config.ts`.
The name reads cleanly in prose, conveys the purpose, and avoids the
scope friction. Future sibling packages (`@effective/review`,
`@effective/scopes` if we ever publish them) can adopt a scope at that
time without retroactively scoping the main package.

### Why not LangChain-style orchestration

**The alternative:** model the package after LangChain / LangGraph / CrewAI
— chains of operations, agent frameworks, declarative orchestration of
multi-step workflows.

**Why we rejected it:**

Those frameworks solve a different problem. They're about _how to compose
agent calls into useful workflows_. This package is about _how to verify
the output of any work against shared standards_. They're complementary,
not competitive.

We deliberately don't compete with the orchestration frameworks. The
package's three functions are designed to plug into whatever orchestration
the user has — including the agent frameworks above. A LangGraph user can
add `verify` as a node in their graph. A custom-script user can add it to
their loop. The package doesn't care.

Building orchestration into the package would force every user through our
orchestration, which is the opposite of what we want.

### Why not "make agents behave"

**The alternative:** position the package as a control/guardrails tool —
"prevent your agents from doing X," "force compliance with Y," "lock down
agent capabilities."

**Why we rejected it:**

This framing is everywhere in the agent tooling landscape, and it's the
wrong frame. It treats agents as adversaries to be constrained rather than
collaborators sharing the goal. It also positions the package narrowly: as
soon as models stop producing today's specific failures, control-framed
tools become curiosities.

The leadership-not-management framing positions the package as
infrastructure for the work, not infrastructure against the worker. This
is durable (the standards persist regardless of who's doing the work) and
inviting (workers — LLM or human — get a clearer picture of what done
means, not a tighter cage).

There's also a philosophical alignment: this framing treats agents as
something more than tools to be controlled. The relationship between human
and agent is collaborative. The constitution is a shared agreement, not a
leash. Tools that reinforce the "agents are adversaries" frame at the API
level make that collaborative relationship harder; tools that reinforce
the "we share goals and standards" frame make it easier.

### Why not include workflow shape opinions

**The alternative:** the package ships an opinionated 5-step or 6-step
workflow (test-writer → code-writer → reviewer + kick-back routing) the
way the Core of Tomorrow platform implements.

**Why we rejected it:**

The 5/6-step workflow is one valid shape. It's not the only valid shape.
Other teams will choose differently: single-agent loops, plan-then-execute,
parallel implementations with consensus voting, dialogue-based refinement.
The package shouldn't have an opinion on workflow shape; it should be
useful in whatever shape the user picks.

What the package does ship is _role-aware scope_. The four built-in roles
(test-writer, code-writer, reviewer, free-form) cover the most common role
decomposition, and custom roles let teams declare their own. That's the
right level of opinion: name the concept of role-aware verification, but
don't force a specific workflow that uses those roles.

### Why not separate packages for lanes/runner/scoping

**The alternative:** decompose into `@effective/lanes`, `@effective/runner`,
`@effective/scoping`, etc. — each focused on one concern, composable.

**Why we rejected it (for v1):**

The shared types — `Finding`, `Severity`, `Rule`, `Scope`, `Constitution` —
are load-bearing across what would be every package. Splitting now would
force coordinated releases for every type change, which is a real tax.

The case for splitting weakens further when you look at adoption: most
users want all of it. A user adopting `@effective/lanes` will want
`@effective/exceptions` within weeks; a user adopting `@effective/runner`
will want `@effective/verify`. Forcing them through three install commands
and three sets of breaking-change windows is friction without proportional
value.

The right time to split is when a package develops its own peer
dependency surface — when the LLM review pass needs a model SDK that
deterministic users shouldn't pay for, when an optional integration with
some external service needs to be opt-in. Those are real signals. "We
have multiple concerns" alone isn't.

For v1: one package, push until it splits itself.

### Why not auto-detect everything

**The alternative:** `npx effective init` auto-detects every aspect of the
project (toolchain, package manager, monorepo structure, custom CI scripts,
test framework variants, etc.) and generates a fully-configured
`effective.config.ts` with no human review needed.

**Why we rejected it:**

This is the trap that `create-*-app` tools fall into when they try to be
too smart. The autodetection generates a config nobody understands. When
the autodetection is wrong, fixing it requires understanding what the
detection logic was trying to do, which is harder than reading a simple
config file.

The discipline for the setup command: detect what you can detect with
high confidence (package.json scripts, .husky hooks, presence of
TypeScript), generate a small readable config that's obvious how to extend,
and let the human review. Don't try to handle every case.

Examples of things we explicitly _don't_ try to auto-detect:

- Whether the user wants the recommended preset or a minimal subset
- Whether the user wants strict or warn-mode for the exceptions rule
- Custom roles specific to the project's workflow
- Toolchain commands beyond the obvious four (lint, typecheck, test, coverage)

For all of those, the generated config has commented-out examples and the
user fills them in.

### Why not predicates instead of boolean expectations

**The alternative:** the `Expectations` type would have predicate functions
("number of failing tests > 0" instead of `newTestsFail: true`), giving
maximum flexibility for projects to express custom success criteria.

**Why we rejected it:**

Booleans force clear yes/no semantics. Predicates invite the same fiddling
problem as numeric severity scales — "did the test fail RIGHT?" becomes a
debate, with each project encoding subtly different predicate logic that's
impossible to reason about uniformly.

Booleans also let the engine optimize: it can skip checks whose
expectations are unset, can short-circuit when a single check fails, can
parallelize independent checks. Predicates would force the engine to
evaluate every predicate against every diff regardless.

The cost: if a project needs a check that doesn't fit any boolean
expectation, they have to add a `CustomRule` to their constitution. That's
a deliberate friction — the boolean expectations cover the 95% case, and
the 5% gets handled via the escape hatch (which exists for exactly this).

---

## Future directions

Things we've considered but not committed to. Worth keeping on the radar:

**LLM review pass.** An optional `@effective/review` package (or subpath
export, depending on shape) that takes the same constitution and uses a
model callback to catch failures the deterministic rules can't — "this
function is poorly named," "this test doesn't actually exercise the
behavior the spec describes," "this PR description doesn't match what the
diff actually changes." Same `Finding` shape as deterministic rules; same
rule IDs where the rule applies to both paths; tree-shakable. The user
provides the model client via a callback; the package never touches
credentials.

The reason this is interesting and not just a hosted-version idea: the
constitution is already a single source of truth for prompt projection
and check projection. Adding LLM review extends that to a _third_
projection — review prompt — from the same source. The discipline stays
durable across all three. A future version of the package that ships LLM
review would compile the same Zod values into a review prompt the user's
model evaluates, parse the response, and emit findings indistinguishable
from deterministic ones.

What's blocking it from v1: the deterministic engine needs to exist first
and prove itself before we add a path that depends on a model. Once
there's evidence of where the deterministic ceiling is — which rules
genuinely can't be expressed as patterns/schemas/checks — that informs
which rules LLM review should target.

**Scoping package.** A separate `@effective/scopes` package (or similar)
that handles multi-piece work decomposition — given a job, produce N
scoped sub-jobs each with their own editable paths and role assignments.
This is what the Core of Tomorrow platform does in its workflow engine;
extracting it as a sibling package is the natural follow-on. Would
significantly simplify the platform runner that motivated this work.

**Catalogue discovery.** A workflow (not necessarily a service) that
periodically scans public sources — GitHub issues, blog posts, Reddit
threads, papers — for descriptions of LLM-shaped failure patterns,
surfaces them as catalogue entry candidates for human review, and
incorporates accepted candidates into the catalogue with attribution to
the original observer. Could run as a community-maintained workflow or as
a contributor-driven backlog. Speculative for now; the catalogue grows
through direct contribution in v1.

**Cross-language support.** TypeScript is the v1 target. Python is the
obvious second language. The schemas would translate (Pydantic instead of
Zod); the catalogue would expand to cover Python-shaped failures (which
have meaningfully different patterns — type confusion, magic methods,
import-time side effects, fixture sharing in pytest). Multi-year roadmap,
not v1.

**Editor integrations.** Real-time `verify` feedback in VS Code or Cursor
as you write, showing findings inline before you commit. Plausible v1.1
or v1.2 work once the package is stable.

**Catalogue rendering.** A simple static site (or just a web page in the
package docs) that renders the catalogue with filtering and search.
Useful once the catalogue has 50+ entries.
