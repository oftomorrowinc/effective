# Decision trees

When adopting `effective` or extending its constitution, several
choices have non-obvious right answers. This doc collects the recurring
ones as decision trees so an LLM helping a user — or a user picking
their own way — can pick the right path with rationale.

Each tree is question → answer → next step, with examples per leaf.

---

## Disable vs. override a rule

A rule is producing findings you don't want to act on. Three options:
disable it, downgrade its severity via override, or fix the code.

```
Q1: Is this rule fundamentally inapplicable to your project?
    Examples of YES:
      - `mocks-only-at-external-boundaries` in a project with no mocks
      - `migration-has-exercising-test` in a project with no DB layer
      - `specd-test-names-land-verbatim` in a project not using spec'd
        test names
    Examples of NO:
      - "We have suppressions without exception refs" (rule applies;
        you just haven't caught up yet)
      - "Our coverage dipped" (rule applies; you can fix it)

    YES → use `disable` with rationale describing why the rule doesn't
          fit. Done.
    NO  → Q2.

Q2: Can your project satisfy the rule today, with reasonable effort?
    YES → don't disable or don't override. Fix the code; let the
          finding stay until the fix lands.
    NO  → Q3.

Q3: Will you fix the underlying issue eventually, or is this permanent?
    EVENTUALLY → use `override` to downgrade severity (typically
                 CRITICAL → HIGH). Include the retirement condition in
                 the rationale: "Promote back to CRITICAL once <X>."
    PERMANENT  → use `disable` with rationale explaining why the
                 condition won't change.
```

### Rule of thumb

`override` is reversible — you'll come back to it. `disable` is a
statement that the rule doesn't apply here, ever. The rationale matters
in both cases: future-you (and your reviewers) need to know why the
rule was silenced.

### Examples

**Override** — pre-existing escape hatches in a legacy codebase:

```ts
override: {
  'exceptions.must-cite-justification': {
    severity: 'HIGH',
    rationale:
      'Pre-existing suppressions lack refs. Promote back to CRITICAL once `audit-escapes` shows zero unjustified hatches.',
  },
},
```

**Disable** — rule doesn't apply at all:

```ts
disable: {
  'migration-has-exercising-test':
    'No database layer; project is a static site generator.',
},
```

---

## CustomRule vs. PatternRule vs. SchemaRule

You want to add a project-specific rule. The factory you pick determines
the shape.

```
Q1: Is the check a regex or substring search over file content?
    Examples of YES:
      - "no `console.log` in src/"
      - "every test file must import 'vitest'"
      - "no `as any` in production code"

    YES → use `rule.forbidPattern()` or `rule.requirePattern()`.
    NO  → Q2.

Q2: Is the check a structural validation against a typed artifact?
    The artifact is something with a definable shape — frontmatter,
    PR description, task envelope.
    Examples of YES:
      - "every spec markdown file's frontmatter has a `tested-by` field"
      - "the PR description includes a `## Test plan` section"
      - "every migration has a `description` comment with required keys"

    YES → use `rule.schema()` with a Zod schema for the artifact shape.
    NO  → Q3.

Q3: Does the check involve file-boundary enforcement (which files were
    touched relative to a declared editable lane)?
    YES → use `rule.lane()`. Most projects need only the default lane
          rule from the recommended preset; custom lane rules are rare.
    NO  → Q4.

Q4: Does the check wrap an external tool's output?
    Examples of YES:
      - "lint is clean" — wraps ESLint
      - "tests pass" — wraps Vitest/Jest
      - "build succeeds" — wraps a build command

    YES → use `rule.toolchain()` with `tool: 'lint' | 'typecheck' |
          'test' | 'coverage' | 'custom'`. Provide a name + parser
          if `tool: 'custom'`.
    NO  → Q5.

Q5: Does the check need to compare a worker's self-report (build log,
    attempt log) against the actual diff?
    Examples of YES:
      - "build log claims tests passed; commit count matches reality"
      - "exit bar lists 'coverage non-decreasing'; coverage actually
        reflects this"

    YES → use `metaRule()`. The check has access to `ctx.agentReport`
          alongside the diff.
    NO  → Q6.

Q6: Anything else — diff-based check with logic that doesn't fit the
    other kinds.
    Examples:
      - "every new export has a non-test caller" (custom diff + repo scan)
      - "test count non-decreasing" (custom diff comparison)
      - "every new throw is caught by an existing catcher chain"
        (AST analysis)

    → use `rule.custom()` with `checkRef: 'yourCheckId'` and register
      the implementation in `customChecks` passed to `verify()`.
```

### Rule of thumb

If you can express the check as a regex, do that — pattern rules are
the cheapest to author and the most predictable. If the check needs
structural validation, use a schema rule. If it needs logic, use a
custom rule. Resist the urge to start with `custom` for everything —
the schema and pattern kinds force decomposition that pays off in
maintainability.

---

## New exception vs. fix the code

A suppression comment (`eslint-disable`, `@ts-expect-error`, `c8
ignore`, `prettier-ignore`) needs a reason. Two paths: register an
exception, or remove the suppression by fixing the code.

```
Q1: Does the suppression represent a structural condition you
    expect to recur in this codebase or others like it?
    Examples of YES:
      - "TypeScript can't narrow an impossible enum branch we know
        is unreachable" → category: type-narrowing-of-impossible
      - "An SDK version's stale-connection bug means a defensive
        retry never executes in tests" → category:
        external-library-drift-defense
      - "The CLI's `main` block exits unconditionally; coverage
        instrumentation can't see the post-exit code" → category:
        cli-fatal-exit

    YES → register an exception. Pick a category from the built-in
          set or add a new one if no fit. Specify `mechanism`
          (which suppression syntax this exception applies to),
          `context` (why the suppression is needed),
          `retirementCondition` (what would let this exception go
          away), and `addedDate`.
    NO  → Q2.

Q2: Is the suppression covering a one-off case that could be fixed
    by restructuring the code?
    Examples:
      - A bare `@ts-expect-error` that goes away if the type is
        widened by one field
      - A `c8 ignore` over a function whose tests just haven't been
        written yet
      - An `eslint-disable` for a rule you actually want to follow,
        but rewriting takes 5 minutes

    YES → don't add an exception. Fix the code; remove the
          suppression.
    NO  → reconsider Q1. If the case truly is recurring but doesn't
          fit any existing category, that's a signal to add a new
          category (and consider whether the failure mode it
          documents belongs in the catalogue).
```

### Anti-patterns

- **`exception-id: tbd` or `exception-id: temp`**. Either commit to
  the structural framing (and register the exception) or fix the
  code. "Temporary" exception ids drift permanent.
- **One exception per occurrence**. Exceptions are categories, not
  individual sites. If you have 47 occurrences of the same
  structural pattern, you have one exception, cited 47 times.
- **No retirement condition**. An exception without a retirement
  condition is permanent debt. If the condition genuinely doesn't
  exist (e.g., the language semantics aren't changing), say so:
  `retirementCondition: 'When TypeScript supports definite-assignment
narrowing for enum exhaustiveness checks; until then, permanent.'`

---

## New role vs. free-form scope

A workflow doesn't fit any of the built-in roles (`test-writer`,
`code-writer`, `reviewer`, `free-form`). Add a role or use `free-form`?

```
Q1: Does this workflow have a consistent editable lane?
    Examples of YES:
      - 'migration-writer' always edits `migrations/**` and
        `test/migrations/**`
      - 'docs-writer' always edits `*.md` and `docs/**`
    Examples of NO:
      - "occasional refactors that touch wherever needed"

    YES → Q2.
    NO  → use `free-form`. The constitution applies in full; the
          editable lane is set per-invocation via `scope.editable`.

Q2: Does this workflow have a consistent set of expectations
    different from `code-writer` / `test-writer`?
    Examples of YES:
      - 'migration-writer' expects `newMigrationExists: true` and
        `existingTestsPass: true` but doesn't expect new code
        outside migrations
      - 'docs-writer' expects no toolchain gates (lint/test/coverage
        don't apply to prose)
    Examples of NO:
      - "same expectations as code-writer, just a different
        editable lane" — use `code-writer` with a per-scope
        `editable` override

    YES → add a role under `config.roles`. Define `defaultEditable`
          and `expectations`.
    NO  → use the closest built-in role with `scope.editable`
          overridden per invocation.
```

### Rule of thumb

A role earns its name when its expectations diverge from the built-ins.
A workflow that's just "code-writer but in a specific subtree" is a
scope, not a role.

---

## Catalogue entry vs. foundation rule

A new rule needs to be added. Should it have a catalogue entry, or
ship as a foundation rule with `relatedPrinciple` only?

**Adversarial-by-optimization** (used in Q1 below) means a failure
mode that happens _because_ an optimizer takes a locally-cheap
shortcut — disabling a failing test, writing a defensive no-op
migration, claiming verification ran when it didn't. Catalogue
entries are reserved for these patterns; general hygiene/security
failures (which happen from haste, not optimizer pressure) ship as
foundation rules. See `agent-prompt.md` § Glossary for the longer
treatment.

```
Q1: Does this rule defend against an observed adversarial-by-
    optimization pattern? (i.e., a failure where the failure mode
    happens because an optimizer takes a locally-cheap shortcut)
    Examples of YES:
      - 'no-disabled-tests-without-exception' — silencing a failing
        test is locally cheap; disabling tests is the optimizer-
        shaped failure
      - 'defensive-no-op-migration' — a migration against clean data
        feels productive; never fires against the condition it was
        nominally defending
      - 'fabricated-verification-detected' — claiming a test ran is
        cheaper than running it
    Examples of NO:
      - 'no-stray-debug-output' — console.logs ship because they're
        what you use during development, not because an optimizer
        games a constraint
      - 'no-hardcoded-secrets' — secrets ship because of haste, not
        because of optimizer pressure

    YES → catalogue entry + rule. Required: signature,
          whyItHappens, countermeasure (rules + structural prose),
          ≥1 real observedInstance with provenance, addedDate.
    NO  → foundation rule. No catalogue entry; reference a
          principle via `relatedPrinciple`.
```

### Why the bar matters

The catalogue's value is its empirical bar: every entry documents
a pattern actually observed in adversarial-by-optimization
conditions. Adding general hygiene rules with fabricated or generic
observedInstances dilutes that bar. The foundation tier exists
specifically so good general-hygiene rules can ship without
weakening the catalogue's substance.

If a specifically LLM-shaped sub-pattern emerges later (e.g.,
"agents consistently add `console.log(JSON.stringify(x))` when
implementing JSON-handling and forget to remove them"), that's a
candidate for a new catalogue entry with the rule already in place
as countermeasure. The plain rule ships first.

---

## Pattern-rule scope: source/config by default

When you ship a pattern rule (`rule.forbidPattern` /
`rule.requirePattern`), what should its `in` glob default to?

The factory defaults to `**/*` (everything). That's the wrong
default for almost every rule shipped in the preset, and the lesson
keeps recurring:

- **rc.3 escape-hatch scanner.** The scanner ran across every file
  including Markdown, and caught code-fence examples in `README.md`
  / `USAGE.md` that demonstrate suppression syntax. Fix: scope to
  TS/JS source.
- **rc.7 `no-hardcoded-secrets`.** The rule's regex matched AWS's
  canonical `AKIAIOSFODNN7EXAMPLE` string quoted in
  `docs/failure-modes.md` to illustrate what the rule catches. The
  rule fired CRITICAL on its own documentation. Fix: scope to
  source/config files.

The pattern is consistent: pattern rules with broad globs catch
their own illustrations. The recurring failure mode is "the rule
fires on the docs that describe it." The fix is consistent too:
narrow `in` to the file types where the failure mode actually
exists (source code, config files), and let adopters override per
project if they want broader coverage.

```
Q1: Is your rule looking for a code-level concern (debug output,
    hardcoded secrets, forbidden imports, etc.)?
    YES → set `in: '**/*.{ts,tsx,js,jsx,mjs,cjs}'`
          (add `mts,cts,json,yaml,yml` if secrets-shaped values can
          appear in config files too).
    NO  → Q2.

Q2: Is your rule looking for a documentation-level concern (broken
    links, missing sections, prose patterns)?
    YES → set `in: '**/*.{md,mdx}'`.
    NO  → Q3.

Q3: Does your rule need to scan every file regardless of type
    (e.g., looking for credentials in build outputs, or scanning
    the full tree for cross-cutting concerns)?
    YES → leave `in` unset (defaults to `**/*`). Document why in a
          comment; this is the exceptional case.
    NO  → narrow to the smallest set of file types where the
          concern actually applies, and let adopters override.
```

### Rule of thumb

The default for a new pattern rule is "narrow `in` to the file
types where the failure mode applies." `**/*` is reserved for the
exceptional cases where the rule genuinely needs to see every
file. Detection-before-exception (rules should fire precisely
before adopters resort to escape hatches) argues for narrow defaults
— a rule that catches its own documentation trains adopters to
reach for `disable` or escape hatches reflexively.

The pattern documented here is the convergence reached after
shipping the same recurring failure mode twice across rc.3 and
rc.7. New pattern rules in the preset should adopt the narrow
default; the discussion that was tracked in `docs/open-issues.md`
under "no-hardcoded-secrets rule scope" closes here.

---

## Who may elevate a protected-path edit

`protected-paths-respected` fires CRITICAL on any diff touching a
protected file. Someone has to be allowed to change those files
anyway — otherwise the constitution could never evolve. Who?

The convention that emerged across rc.2 → rc.8, and that
`CONTRIBUTING.md` documents as the two-path workflow:

- **Human path** — edit the protected file, push with `--no-verify`
  citing rationale, open a PR labelled `governance`. The local hook
  bypass is ergonomics; the CI gate and the reviewer are what hold.
- **Agent path** — never `--no-verify`. Surface the block as a
  kick-back and stop; a human with elevated scope makes the change.

The recurring question was whether to make that split mechanical: a
`governance.agent-must-not-bypass-protected-paths` rule, or a
`--actor=agent` flag that refuses to proceed.

**The decision (1.0.0): no. The actor split stays a convention, and
effective does not attempt to verify it.**

Actor identity is self-declared. An agent that would bypass the
protected-path block is an agent that would also pass
`--actor=human`, so a flag or a rule keyed on actor identity buys
no guarantee — it buys the appearance of one, which is worse. Actor
identity is not a trust boundary, and effective should not present
it as one.

What effective _can_ guarantee, and does, is that no protected-path
edit is invisible:

```
Q1: Did the diff touch a protected path?
    YES → `protected-paths-respected` fires. Always. No actor, flag,
          environment — or edit to the constitution inside the same
          diff — suppresses it. See "what 'always' had to earn" below.
    NO  → nothing to elevate.

Q2: Is the protected-path edit the PR's actual purpose?
    YES → label the PR `governance`. CI runs verify with
          `--governance-pr`: the finding moves out of the gating set
          and into a printed `Governance changes` section. Visible,
          attributable to a person who applied the label, and still
          reviewed.
    NO  → the finding gates. Fix the diff — the protected-path edit
          does not belong in this PR.
```

### What "always" had to earn

That word was false when it was first written here, and the correction
is worth keeping rather than quietly editing away.

`verify` resolved its constitution from the working tree — the WORK
side of the comparison. So one commit could set `protected: []` and
edit a protected file, and the run passed with zero findings: the diff
deleted the rule that would have caught it. The pre-publish review
proved it against the 1.0.0 tag, in local verify and in CI's own
self-application step. A guarantee with a one-commit bypass is not a
guarantee, and the sentence above was advertising one.

Two changes make it true:

1. **The protections are the baseline's.** A git-source run resolves
   the config as of the baseline ref as well, and holds the diff to the
   UNION of what was protected before and what the diff protects now.
   Adding protection takes effect immediately; removing it takes effect
   on the next diff, after a reviewer has seen the removal. If the
   baseline config exists but cannot be resolved, the run fails closed
   with a CRITICAL rather than falling back to the work side — that
   fallback is the same bypass wearing a different hat.
2. **The constitution protects itself, structurally.** The entry for
   the config file does not come from the `protected` list, so emptying
   that list cannot remove it. The attempt to disarm is itself always a
   finding.

The general principle, which is worth more than the specific fix: **a
rule that reads its own configuration from the thing it is judging is
not a rule.** Anywhere else that pattern appears, the same bypass is
available.

### Rule of thumb

The mechanical layer answers "was a protected file changed, and did
a person deliberately mark that change as intentional?" — both
checkable. It does not answer "who typed it," which is not. Keep the
enforcement on the checkable question.

This closes the `docs/open-issues.md` entries "Formalizing the agent
vs human protected-path workflow" and "Elevated / governance-PR mode
for protected-path edits"; the latter's chosen path (`--governance-pr`)
shipped in rc.8. The residual question it raised — whether elevation
should leave a _persisted_ audit trail a future reviewer pass can
consume, beyond the run output — is deferred post-1.0 and stays
tracked there.

---

## Block every protected-path edit, or only weakening ones?

`protected-paths-respected` treats every edit to a protected config
as CRITICAL — a new script entry the same as deleting `strict: true`.
The obvious refinement is to classify: flag _weakening_ edits, wave
through _strengthening_ and _orthogonal_ ones. Adopters asked for it
directly; the rule fires on every version bump.

**The decision (1.0.0): keep block-every-edit. The answer to the
friction is elevation, not classification.**

The friction the request describes is real, but it was friction
against a missing valve, not against the rule's bluntness. rc.8
shipped the valve: `--governance-pr`, driven by a PR label. The
adopter who was reaching for `--no-verify` on every package.json bump
now labels the PR instead, and the finding stays visible in the
report rather than being silenced.

Classification would trade that for a parser per config kind —
`tsconfig`, `package.json`, `eslint.config`, and one for every format
an adopter protects — each of which can misjudge an edit. A
misclassification here fails _open_: a weakening edit waved through
as "additive" is precisely the change the rule exists to catch. A
blunt rule with a visible, marked override fails closed.

```
Q1: Is the protected-path edit the point of this PR?
    YES → label it `governance`. That is the supported path, and it
          leaves a public marker.
    NO  → the edit is incidental. Split it out.

Q2: Is labelling every such PR too much ceremony for your project?
    YES → the paths in `protected` are too broad for how you work.
          Narrow the list — protection you route around constantly
          is protection you have already lost.
    NO  → you are on the supported path.
```

### Rule of thumb

Prefer a blunt rule with a loud, marked override to a clever rule
that can be wrong quietly. Weakening-detectors remain a good idea
and are tracked post-1.0 — as opt-in modules first, promoted to
built-in only once their parsers have been tried against real
diffs.

This closes the `docs/open-issues.md` entry "Block-weakening vs
block-every-edit on protected configs."

---

## Adopting effective on an existing codebase

First `verify` on a codebase of any age emits a wall of findings —
an external pilot reported 930 LOW on run one. No team clears that
before switching a gate on, and every workaround that fits in a day
(disable the rules, raise the thresholds, silence the hook)
sacrifices the detection that was the point.

The standard answer is a baseline: snapshot today's findings, fail
only on what appears after. mypy, eslint, ruff and rubocop all ship
a version of it.

**The decision (1.0.0): effective ships without a baseline. The
shape of the eventual one is settled; the build is post-1.0.**

Deferring costs nothing in stability terms, which is what made this
decidable now: a baseline arrives as `verify --baseline` plus a
capture command — purely additive, so it lands in a 1.x without
touching the API 1.0.0 declares stable. Shipping it _rushed_ into
1.0.0 would be the expensive mistake, because the hard part is not
the snapshot, it is the match semantics (does a finding that moved
three lines count as known?) and the refresh guard (a silent
regenerate hides new findings inside a cleanup PR). Those want real
adopter diffs to settle against.

Until then, adoption is staged, using config that already exists:

```
Q1: How many findings does the first `effective audit` produce?
    A HANDFUL → fix them. You do not need a staged rollout.
    A WALL    → Q2.

Q2: Which rules produce most of the wall?
    → Start there. For each, decide with the "Disable vs. override a
      rule" tree at the top of this document:
        - inapplicable to this project → `disable` with rationale;
        - applicable but not satisfiable yet → `override` to a lower
          severity, with the promotion condition in the rationale
          ("back to CRITICAL once audit-escapes is clean").

Q3: How do you make progress rather than freeze the exceptions?
    → Every `override` rationale names its retirement condition, and
      you promote rules back as the debt clears. An override with no
      stated condition is a disable wearing a costume.
```

### Rule of thumb

`override` with a written promotion condition is the 1.0 ratchet: it
is manual where a baseline would be mechanical, but it fails in the
right direction — a stalled adoption is visible in the config as a
list of conditions nobody met, rather than invisible in a snapshot
file nobody regenerated.

This closes the `docs/open-issues.md` entry "Baseline / ratchet for
existing-codebase adoption." The chosen shape — a `.effective-baseline`
snapshot with `verify --baseline`, sharing a directory convention with
the coverage-non-decreasing ratchet described in the same entry — is
recorded here as the decision; implementation is tracked post-1.0.

---

## `scope.relatedRules`: emphasis, not scoping

`prepare()` narrows the prompt to the rules named in
`scope.relatedRules`. `verify()` does not narrow — it checks every
resolved rule. So a finding can cite a rule the prompt never showed,
against a prompt that said "the rules above will be checked."

**The decision (1.0.0): `relatedRules` is prompt emphasis. `verify()`
continues to check everything, and `prepare()` stops over-promising.**

The alternative — making verify honor `relatedRules` — puts the
gate's strength in the hands of whoever authored the scope. A
mis-typed or optimistically-narrow `relatedRules` would quietly
exempt work from foundation rules, and the failure would be silent
in exactly the direction that matters. Gate strength must not be
prompt-authorable.

So the fix is in the prompt, not the gate: `prepare()` now states
that the constitution's other rules still apply. A caller who
genuinely wants to narrow _verification_ has no supported way to do
it in 1.0, and that is deliberate; if the need turns out to be real,
it arrives as an explicit, loud `scope.onlyRules` rather than as a
side effect of an emphasis field.

### Rule of thumb

Fields that shape what an agent is _told_ and fields that shape what
it is _held to_ are different fields. When one name is doing both
jobs, the prompt-side reading is the safe one to keep.

This closes the `docs/open-issues.md` entry "`verify()` ignores
`scope.relatedRules` while `prepare()` honors it."

---

## Are the shipped presets protected paths?

`effective.config.ts` is protected: workers must not edit the rules
they are held to. But `src/presets/**` — `recommended.ts` and its
companions — is the constitution _adopters_ extend, and it was not
protected. The gap surfaced concretely during the rc.6 → rc.7 cleanup,
when a PR narrowed `no-hardcoded-secrets`'s `in` glob without
`protected-paths-respected` firing once. That change was right on the
merits; the point is that a wrong one would have looked identical to
the gate.

The entry that tracked this deferred on a stated precondition: adding
the protection before an elevation valve existed would force every
preset edit through `--no-verify`, which is the habit the whole
governance thread is trying to break. That precondition is now met —
`--governance-pr` shipped in rc.8.

**The decision (1.0.0): yes. `src/presets/**` joins the protected
paths.\*\*

A preset edit changes what every downstream adopter is held to, at
what severity, over which files. That is the definition of a
constitutional change, and it should meet the same surface as editing
`effective.config.ts`. The asymmetry — governing the config that
selects the rules while leaving the rules themselves unguarded — was
the loophole, and it is a poor thing for a project whose credibility
rests on enforcing its own constitution to ship into a 1.0.

```
Q1: Does your change alter a rule's severity, scope (`in` glob),
    or whether it ships in a preset at all?
    YES → constitutional. Label the PR `governance`, state the
          rationale, and expect the reviewer to weigh the change on
          its merits rather than its diff size.
    NO  → Q2.

Q2: Is it a refactor with no behavioral change to any shipped rule
    (renaming an internal helper, splitting a file)?
    YES → still protected, still labelled — the gate reads paths, not
          intent. Keep such refactors in their own PR so the label
          means what it says.
    NO  → you are changing rule behavior. See Q1.
```

### Rule of thumb

Protect the rules, not just the file that selects them. The friction
this adds is the friction that was missing: a preset change now costs
a label and a sentence of rationale, which is roughly what it should
cost.

This closes the `docs/open-issues.md` entry "Should `src/presets/**`
rule definitions be protected paths?" — resolved along the entry's own
path 2 (protection plus elevation), once elevation existed to pair it
with.
