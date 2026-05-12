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
      - `spec.test-names-land-verbatim` in a project not using spec'd
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
