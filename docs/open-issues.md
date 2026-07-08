# Open issues — decisions deferred

Issues we know about but haven't decided how to resolve. Captured here
during release-prep sessions so they don't get lost. Each entry frames
the question and outlines the candidate approaches; the goal is to
make the decision when we have enough signal, not to force one
prematurely.

Items that are _already actionable_ (small fix, clear path) belong in
the changelog under `[Unreleased]` instead. Bugs awaiting reproduction
go in `docs/known-bugs.md` — that doc is parallel to this one but
scoped to things needing engineering rather than design. This doc is
for the cases where the right answer is genuinely unclear.

## How to add an entry

Use this format:

- Title with status tag: `## [Bug | Precision | Design | Feature] <short title>`
- Opener: `**The bug.**` or `**The question.**`
- Context paragraphs explaining what was observed and where
- Numbered candidate paths (`1. ...`, `2. ...`, `3. ...`)
- `**Open question**:` line stating the actual decision to make
- Closing paragraph on the risk of doing nothing

Tag meanings:

- `[Bug]` — rule misfires or evaluator does the wrong thing; needs reproduction + fix
- `[Precision]` — rule fires correctly but too broadly (e.g., scans documentation it shouldn't)
- `[Design]` — a real open question about the constitution's shape; needs decision
- `[Feature]` — a deferred capability with an established adopter need

New entries go above the "Other items observed but not yet pressing"
section near the bottom.

**Entry lifecycle.** When an item moves from "open issue" to "decided,
in flight," remove it from this file and capture the decision in
`docs/decisions.md` plus the changelog under `[Unreleased]`. Bugs
awaiting reproduction belong in `docs/known-bugs.md` instead. The
audit trail of each entry's history lives in git.

## Table of contents

Grouped by status tag. Body order below stays chronological so the
audit trail of when each issue surfaced is preserved.

### Bugs

_No bug entries currently tracked here — bugs awaiting reproduction live in `docs/known-bugs.md`._

### Precision

- [new-exports-have-non-test-callers blind to tsx scripts + Next.js page modules](#precision-new-exports-have-non-test-callers-blind-to-tsx-scripts--nextjs-page-modules)
- [migration-has-exercising-test fires on pure DDL migrations](#precision-migration-has-exercising-test-fires-on-pure-ddl-migrations)
- [verify mode-banner ergonomics](#precision-verify-mode-banner-ergonomics)

### Design

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)
- [Should src/presets/\*\* rule definitions be protected paths?](#design-should-srcpresets-rule-definitions-be-protected-paths)
- [Audit walker built-in skips can hide tracked code](#design-audit-walker-built-in-skips-can-hide-tracked-code-dot-entries-basename-anywhere-ignored-dirs)
- [Content-scanner hardening: file-size caps, regex budget, region-classifier limits](#design-content-scanner-hardening-file-size-caps-regex-budget-region-classifier-limits)
- [verify() ignores scope.relatedRules while prepare() honors it](#design-verify-ignores-scoperelatedrules-while-prepare-honors-it)

### Feature

- [Baseline / ratchet for existing-codebase adoption](#feature-baseline--ratchet-for-existing-codebase-adoption)
- [Modular governance-only preset](#feature-modular-governance-only-preset)
- [Configurable coverage threshold](#feature-configurable-coverage-threshold)

### Other items observed but not yet pressing

- [Other items observed but not yet pressing](#other-items-observed-but-not-yet-pressing) — smaller observations, deferred polish, nice-to-haves

---

## [Design] Formalizing the agent vs human protected-path workflow

**The convention today**: protected-path edits (e.g., `package.json`
version bumps, `tsconfig.json` paths) require `--no-verify` to push
because the pre-push hook fires CRITICAL on the diff. The convention
that's emerged across rc.2 → rc.5:

- **Human path**: edits a protected file, pushes with `--no-verify`
  citing rationale in the commit message. PR review + CI gate +
  reviewer-pass (future) are the load-bearing layers; `--no-verify`
  on the human's local push is ergonomics.
- **Agent path**: never `--no-verify` on a protected-path push. The
  agent flags the constitutional change needed, the human runs the
  push with elevation.

This is captured in three places informally:

- `CONTRIBUTING.md § "The two-path constitutional-change workflow"`
- `docs/reviewer-spec-forward.md § "What the reviewer checks on
protected-path edits"`
- Conversation memory (`feedback_governance_layering.md`)

**The question**: is informal capture sufficient, or should this be a
first-class part of effective's surface? Options:

1. **Leave as-is.** The convention is documented in
   `CONTRIBUTING.md`; agent tooling that reads
   `docs/agent-prompt.md` already gets the right framing. New
   adopters infer it from the docs.
2. **Promote to a rule.** Add a rule like
   `governance.agent-must-not-bypass-protected-paths` that activates
   when an agent identifies itself (e.g., via a CI environment
   variable or a `scope.actor: 'agent'` field) and a protected-path
   diff is present without elevation evidence. Surfaces violations
   mechanically rather than relying on convention.
3. **Bake into the CLI.** A `--actor=agent` flag (or auto-detection
   via env) that, combined with a protected-path diff, refuses to
   proceed with a CRITICAL rather than just flagging. Hard
   guard-rail; harder to misconfigure.

**Open question**: when (if ever) does this transition from
documented-convention to enforced-rule? Probably tied to the
`effective-reviewer` package, since the reviewer is the layer that
checks substance on protected-path PRs. Worth discussing once that
package's shape firms up.

The risk of doing nothing: as more agents adopt effective, the
convention drifts unless something mechanical preserves it. The risk
of doing it too early: prematurely formalizing a workflow that's still
evolving.

**Related governance-thread entries:**

- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)
- [Should src/presets/\*\* rule definitions be protected paths?](#design-should-srcpresets-rule-definitions-be-protected-paths)

---

## [Precision] `new-exports-have-non-test-callers` blind to tsx scripts + Next.js page modules

**The bug.** The rule walks the import graph to decide whether a new
exported symbol has a non-test caller. The walk works for code reached
from compiled entry points but misses two common-in-the-wild patterns:

1. **`tsx`-executed script tasks.** Runners that spawn scripts as child
   processes (`tsx tasks/foo/apply.ts`) leave the `apply.ts` file as
   an entry point that nothing imports. Helpers it consumes appear
   orphaned even though they're called every run.
2. **Next.js page / route / layout modules.** The framework loads these
   by filesystem convention; no code reference exists for the rule to
   trace. `LogEventPage` exported from `app/events/page.tsx` looks
   orphaned to effective even though Next.js renders it on every request.

Surfaced on a pub-platform integration branch where 10 of 10 LOW findings
under this rule were false positives — every flagged export had a real
runtime caller hidden behind one of the two patterns above. Same shape
affects seed scripts, framework-loaded handlers (Astro, Remix, etc.), and
CLI binaries declared via `package.json` `bin`.

**Three paths**:

1. **Project-declared entry-point globs.** A `seeds.entryPointGlobs`
   array that effective treats as transitively-called roots. Pattern:
   `['tasks/scripts/**/apply.ts', 'apps/web/src/app/**/page.tsx', ...]`.
   Explicit, opt-in per adopter; works for any framework convention.
2. **Read `package.json` `bin` / `exports` / Next.js conventions.** Auto-
   discover entry points from the standard places: `bin` entries, `tsx`
   commands in `scripts`, Next.js `app/**/page.{ts,tsx}` and
   `route.{ts,tsx}`. Less config; more magic + framework coupling.
3. **Escape hatch per export.** Current workaround. Adopters add 10+
   escape-hatch entries per branch with hand-written rationale. Scales
   poorly — the boilerplate is identical for every framework-loaded
   export.

**Open question**: is this a rule-config concern (option 1) or a
framework-aware feature (option 2)? Option 1 matches effective's
"behavior-by-convention, escapability-by-config" pattern but pushes work
to every adopter. Option 2 is friendlier but couples the rule to specific
framework conventions that drift.

The detection-before-exception principle argues against #3 as the long-
term answer: ten silent escape hatches in a 60-commit diff is exactly
the noise the principle is trying to avoid. Probably converges on #1
with a small `seeds.entryPointGlobs` palette in the preset that adopters
extend.

---

## [Precision] `migration-has-exercising-test` fires on pure DDL migrations

**The bug.** The rule's stated rationale is "catches defensive no-op
migrations that never fire against the condition they were nominally
defending." That logic applies cleanly to data-transforming migrations
(UPDATE backfills, DELETE cleanups, ALTER TABLE conversions that depend
on existing data shape) — those can ship as no-ops if the seed condition
they're guarding against doesn't exist, and an exercising test catches it.

It does not apply to pure DDL: column adds, partial indexes, enum
extensions, template-row inserts. These either ship the schema change or
fail the deploy. There's no "the migration silently didn't fire" failure
mode to catch — Postgres' DDL is transactional and observable.

Surfaced on a pub-platform branch where the rule flagged 8 migrations:
2 were genuinely data-transforming and got exercising tests; the other
6 were pure DDL (column add × 3, partial index, enum extension, template
insert) and the LOW findings persisted because there's nothing meaningful
for a test to assert. Re-running the migration would no-op or fail, not
exercise hidden logic.

**Three paths**:

1. **Classify migrations by parsing the SQL.** Walk the migration file
   and only require exercising tests when the migration contains
   `UPDATE` / `DELETE` / `INSERT … SELECT` / `ALTER … USING` clauses.
   Pure `CREATE` / `ALTER ADD COLUMN` / `CREATE INDEX` / `CREATE TYPE`
   suppresses the finding. Most precise; requires a small SQL parser.
2. **Comment-marker convention.** `-- @effective:pure-ddl` as the first
   line of a migration suppresses the rule for that file. Lower
   implementation cost; relies on adopter discipline (could be abused
   to suppress real data transforms).
3. **Document as expected behavior + escape hatches.** Leave the rule
   firing on every migration and document that adopters add escape
   hatches with `reason: 'pure DDL — schema migration fires
deterministically'` for the non-data-transforming ones. Status quo;
   scales with diff size.

**Open question**: how strict is the rule's intent? If "any new
migration deserves a test that something can run" is the floor, the
current behavior is correct and (3) is the answer. If "exercising tests
catch defensive no-op migrations" is the load-bearing claim, (1) is
strictly aligned with what the rule says it does.

The doc-vs-behavior alignment principle argues for (1): a rule's
rationale should match its actual firing pattern, or the rationale gets
edited to match observed behavior. Right now they're drifting apart.

---

## [Design] `verify --against main` semantics on long-lived integration branches

**The bug.** The current verify-against-main flow reports findings as a
snapshot of the diff: every protected-file edit, every new export, every
migration in the cumulative range fires its respective rule. That's
correct for short-lived feature branches and pre-push hook diffs.

It breaks down on long-lived integration branches. A 60-commit branch
spanning weeks of legitimate work produces 36 findings, 35 of which
describe state that landed weeks ago — protected-file edits made
deliberately in earlier slices, migrations from earlier slices, exports
from earlier refactors. Only 1 finding (a typecheck error in a recent
commit) reflects work that needs attention from this verify run.

A reviewer running verify against main can't easily distinguish "what
this branch ADDED that needs attention" from "what this branch CONTAINS
that's accumulated and was already reviewed in its own slice". On long-
lived branches the noise dominates the signal.

**Three paths**:

1. **`--since <ref>` mode.** Verify reports only findings on files
   touched between `<ref>` and `HEAD`, where `<ref>` defaults to the
   last verified commit recorded in some local state file. The pre-push
   hook keeps its current semantics; reviewers walking a long branch
   get a focused report. Requires effective to track "last verified
   commit" somewhere (file in `.effective/`, or a tag).
2. **Group findings by introduction commit.** Run verify against main as
   today but git-blame each finding's anchor line to find the commit
   that introduced it. Group the output: "new since last review (1)",
   "carried from earlier slices (35)". No new mode; existing run is
   richer. Cost: a `git blame` per finding.
3. **Document the pattern as a per-merge concern.** Recommend that
   long-lived branches run `verify --against <previous-merge-base>`
   rather than `--against main`, scoping each verify to the work since
   the last merge. Pure-docs answer; relies on adopter discipline; does
   nothing for branches that never merge incrementally.

Adjacent to the existing "Formalizing the agent vs human protected-path
workflow" entry but distinct: that's about WHO can bypass a CRITICAL;
this is about HOW verify expresses risk when the diff range is large.
Probably defer to whatever lands as `effective-reviewer` — the
reviewer is the layer most affected by the signal/noise ratio on long
branches, and reviewer-spec-forward already gestures at how findings
should be presented to a human at scale.

The risk of doing nothing: branch-level verify becomes ritual rather
than diagnostic, and reviewers learn to ignore CRITICALs as "probably
branch noise." That's worse than reviewers learning the system: once
"ignore CRITICALs unless they're recent" becomes the norm, the rule's
weight evaporates.

**Related governance-thread entries:**

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)
- [Should src/presets/\*\* rule definitions be protected paths?](#design-should-srcpresets-rule-definitions-be-protected-paths)

---

## [Feature] Baseline / ratchet for existing-codebase adoption

**The bug.** First-time `effective verify` on a non-trivial existing
codebase emits hundreds-to-thousands of findings: LOW for formatting
/ debug-output / pure-style rules, MEDIUM for hygiene rules,
CRITICAL for any pre-existing escape-hatch usage that was never
registered. An external adopter trying effective on a production
Python+JS repo reported 930 LOW findings on the first run.

No team is going to clear a 930-finding wall before turning effective
on. The current workarounds — disable rules, raise severity
thresholds, silence the pre-push hook entirely — all sacrifice
detection. The right shape is the same pattern other static-analysis
tools use: snapshot existing findings into a baseline file, then fail
only on findings introduced after that snapshot. mypy's `--baseline`,
eslint's `eslint-baseline`, ruff's `--add-noqa`, and rubocop's
`.rubocop_todo.yml` are roughly the same idea expressed differently.
effective needs its own version.

**Three paths**:

1. **`.effective-baseline.yml` snapshot file.** `effective baseline
capture` writes one entry per current finding (rule id +
   anchor-hash + file path); `verify --baseline` ignores findings
   matching the snapshot. New findings fail the run as today.
   Refresh via `effective baseline regenerate` after a cleanup pass.
   Pure-additive surface; existing semantics unchanged when
   `--baseline` isn't passed.
2. **Per-rule severity floors.** A `seeds.adoptionMode: true` config
   flag downgrades LOW → ignore, MEDIUM → LOW, CRITICAL → MEDIUM
   globally until a `seeds.adoptionDeadline` date. Simpler to ship;
   less precise (silences NEW LOW findings too, which defeats the
   ratchet); date-driven escape hatches age badly.
3. **Document staged adoption.** Recommend adopters enable rules one
   at a time, fix the findings each surfaces, then enable the next.
   No code change; relies on adopter discipline; doesn't solve the
   "all the rules on, just don't fail on what's already there" use
   case that every other static-analysis ratchet exists to solve.

**Open question**: should the baseline match strictly on anchor-hash
identity (moving a finding to a new line invalidates it and it gets
re-reported) or fuzzily (finding moves with the file, still
considered "known"). Strict is the safer default; lenient is
friendlier to refactors but obscures whether the finding genuinely
re-emerged. The baseline-refresh story (`effective baseline
regenerate`) should also be guarded — a silent regenerate could mask
new findings landing in the same PR as a cleanup pass.

Adoption-critical. Without it, "try effective on your repo" is a
non-starter for anything older than a few months. The risk of doing
nothing isn't a slow drift — it's that no team adopts.

**Adjacent: coverage non-decreasing as a related ratchet.** The same
"compare current state to a known-good prior state" pattern shows
up for coverage. `toolchain.coverage-meets-threshold` was renamed
in rc.4 to match what the engine actually does (per-metric threshold
check at 90%), but the original "did coverage drop from main?"
semantic is a real adopter need that the rename deferred rather than
solved. The implementation shape is parallel to baseline/ratchet:
snapshot prior coverage (`.effective-coverage-baseline.yml` or
similar), fail only on metrics that dropped from the snapshot. Same
open question about strict-vs-fuzzy matching applies (per-file
coverage hash vs. per-metric totals). Worth designing alongside the
findings ratchet — both expose the same "ratchet against a snapshot"
primitive — even if they ship as separate features. The two could
share an `.effective-baseline/` directory convention so adopters
learn one mental model that applies to both.

---

## [Precision] `verify` mode-banner ergonomics

**The bug.** `effective verify` and `effective verify --staged` do
materially different things — the first checks the committed diff
against main (or another ref), the second checks only the staged
index — but the output doesn't make the active mode obvious. An
external adopter running both as part of pre-push troubleshooting
misreported which one was checking what, and reasonably so: the
findings format is identical, the rule list is identical, only the
diff range differs.

Same shape as any CLI that reuses the same output frame across two
different verbs: users get the mode wrong, then form incorrect
mental models of what the rule actually checks.

**Three paths**:

1. **Mode-banner line at the top of every verify run.** Single line:
   `checking: committed diff vs main (<sha>..<sha>)` or
   `checking: staged index only`. No behavior change; immediately
   disambiguates. Same surface as `git status`'s "On branch / Your
   branch is..." preamble.
2. **Rename the verbs.** `effective verify` → `effective verify-pr`
   (committed diff), `effective verify-staged` (staged index).
   Discoverable from `--help`; breaking change for adopters who
   already have `verify` in their hooks; would require a deprecation
   period. Worth doing eventually; not the first move.
3. **Document the distinction more prominently.** Update README and
   CONTRIBUTING to spell out which mode does what. Necessary but not
   sufficient — doesn't help the adopter already running the command
   and misreading its output.

**Open question**: does the banner line belong on every run, or only
on first-run / `--verbose`? Always-on is the safer default — quiet
output is what lets adopters lose track in the first place.

The risk of doing nothing: adopters write incorrect mental models of
what verify checks, share them, and the rule mechanism gets blamed
for failures the wrong mode produced. A one-line banner is cheap
insurance.

---

## [Design] Elevated / governance-PR mode for protected-path edits

**The bug.** When a PR is intentionally changing the constitution —
adding a new rule, adjusting a threshold, registering a new protected
path, bumping a package's pinned major — the
`protected-paths-respected` rule fires CRITICAL on the very change
that's the PR's purpose. The current escape hatches are blunt:
`--no-verify` on push (silences the gate for unrelated findings in
the same diff) or disable the rule for the run (same blast radius).
Both JS-first adopters and the external Python+JS pilot flagged this
as friction.

Closely related to the earlier "Formalizing the agent vs human
protected-path workflow" entry above — that one is about WHO can
elevate; this one is about HOW the elevation surfaces in verify
output. Both should likely land together as part of the
effective-reviewer scope.

**Three paths**:

1. **`--governance-pr` flag.** Verify with this flag treats
   protected-path findings as INFO instead of CRITICAL, prints them
   on a separate "governance changes" line, and exits 0 if no other
   CRITICALs are present. CI configures the flag based on a PR label
   or commit-message tag. Explicit; testable; couples the CI half to
   the verify half cleanly.
2. **Commit-message tag.** `[governance]` (or `[constitution]`) in
   the PR's commit message auto-flips the rule to informational
   severity for the run. No new flag; requires adopters to discover
   the tag from docs. Tag could be abused — any commit could opt out
   — which inverts the rule's intent.
3. **Allowlist file in the PR.** A `.effective/governance.yml`
   committed in the PR enumerates the intentional protected-path
   touches with rationale per path. Verify suppresses findings on
   those paths only. Most precise; highest ceremony. Closest to the
   "register the exception" pattern effective already uses elsewhere.

**Open question**: does effective track the elevation as a
first-class observable (so the reviewer pass can audit it later) or
is it ephemeral to the verify run? An audit trail of "this PR was
elevated, here's the rationale" is what makes the reviewer-pass
capable of substantively reviewing constitutional changes; without
it, elevation is a silent bypass.

The risk of doing nothing: governance PRs ship via `--no-verify` or
rule-disable, both of which silence findings on OTHER files in the
same diff. A real bug in a non-governance file lands invisibly.

**Related governance-thread entries:**

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)
- [Should src/presets/\*\* rule definitions be protected paths?](#design-should-srcpresets-rule-definitions-be-protected-paths)

---

## [Design] Block-weakening vs block-every-edit on protected configs

**The bug.** Today `protected-paths-respected` treats any edit to a
protected config file (`tsconfig.json`, `package.json`,
`eslint.config.ts`, `.husky/*`) as CRITICAL. Correct for the
strict-by-default case but blunt: it blocks legitimate additive
changes (new dependency, new lint rule, new script entry) with the
same severity as actively-harmful ones (removing `strict: true`,
dropping a husky hook, disabling a lint rule).

External-adopter feedback flagged this on first contact: the rule
fires on every package.json bump and every script addition, which
trains adopters to `--no-verify` reflexively rather than reading the
diff. Over time `--no-verify`-fatigue becomes its own anti-pattern —
operators stop reading what they're bypassing.

The semantic distinction the rule wants is _weakening_ vs
_strengthening or orthogonal_. Implementation requires per-file
understanding of what counts as weakening: removing strictness flags
from `tsconfig.json`, dropping a script in the protected-script set
or downgrading lockfile pinning in `package.json`, disabling rules or
raising severity from `error` to `warn` in `eslint.config.ts`,
touching `.husky/*` at all. Strengthening edits (adding strictness
flags, adding lint rules, tightening pins) and orthogonal edits
(most version bumps, adding scripts, changing `outDir`) shouldn't
trigger CRITICAL.

**Three paths**:

1. **Per-file-type weakening-detector rules.** Each protected config
   gets a dedicated parser + rule (`tsconfig-not-weakened`,
   `package-json-not-weakened`, etc.) that compares the diff's
   before/after structurally and flags only weakening edits. Highest
   precision; substantial implementation surface (one parser per
   config kind).
2. **Severity ladder by edit class.** Same
   `protected-paths-respected` rule but distinguishes "additive"
   (LOW), "modifying" (MEDIUM), and "removing" (CRITICAL) edits via
   diff-line classification. Cheaper than per-file parsing; less
   precise — a script rename looks like "remove + add" to a
   line-level classifier.
3. **Keep block-all; widen the "rationale required" surface.** Status
   quo plus a requirement that every protected-path edit includes an
   inline `// effective: rationale: ...` comment or an entry in a
   per-PR rationale file. Doesn't reduce gate friction; does force
   the operator to articulate why before bypassing. Low
   implementation cost.

**Open question**: do we ship the weakening-detectors as built-in
rules or as opt-in modules? Built-in matches "secure defaults";
opt-in matches the per-adopter-config pattern effective uses
elsewhere. The risk of built-in is false-positive volume if any
parser misclassifies an edit. Probably ship as opt-in modules first;
promote to built-in once the parsers are battle-tested against real
diffs.

The risk of doing nothing: `--no-verify`-fatigue erodes the rule's
weight. Once operators bypass protected-path findings reflexively the
rule becomes ritual rather than signal — same failure mode flagged
in the long-lived integration branches entry above.

**Related governance-thread entries:**

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Should src/presets/\*\* rule definitions be protected paths?](#design-should-srcpresets-rule-definitions-be-protected-paths)

---

## [Feature] Modular governance-only preset

**The question.** External-adopter feedback (Python+JS pilot)
suggested a "polyglot preset" that ships protected-paths + lane
discipline + escape-hatch audit without the JS-toolchain assumptions
(typecheck / lint / coverage / test). Same ask applies to JS-first
adopters in a different framing: small repos that want effective's
_governance_ layer (protected paths, constitutional change workflow,
escape-hatch tracking) without the full verify-lifecycle's toolchain
orchestration.

Reframing as "modular preset" rather than "polyglot" makes the
underlying ask clearer: effective today bundles governance +
verify-lifecycle into one preset; some adopters want only the
governance half.

**Three paths**:

1. **`@effective/governance-only` preset.** A bundle that includes
   protected-paths-respected, exceptions.must-cite-justification,
   no-stray-debug-output, escape-hatch-audit, and similar — but
   omits the toolchain rules (typecheck-clean, lint-clean,
   tests-pass, coverage-meets-threshold). Adopters `extends` either
   this or the full preset; opt-in per repo.
2. **Category tags on rules.** Tag each rule with
   `category: 'governance' | 'toolchain' | ...` and let adopters
   filter: `verify --only governance`. No new preset shape; existing
   preset stays the single source of truth. Less discoverable from
   docs.
3. **Document the manual-override pattern.** Show adopters how to
   start from the full preset and disable the toolchain rules in
   their own seeds.ts. Pure-docs fix; adopters do the assembly.

**Open question**: does pursuing this open a polyglot can of worms
(non-JS adopters expecting first-class Python / Ruby / Go support)
that effective's current scope isn't ready for? Probably yes — but
framing the modular preset around governance-vs-toolchain rather
than language scope contains the expansion: it's a JS-first effective
that ships a smaller preset for smaller adoption stakes, not a
multi-language effective.

Deferred until JS-first verify experience is solid. Filed here so
the adopter's signal isn't lost; not in scope for the next version.

---

## [Design] Should `src/presets/**` rule definitions be protected paths?

**The question.** `src/presets/recommended.ts` is the
constitution-as-code — the source of truth for what rules ship, at
what severity, scoped to what files. Adopters who extend
`recommended` trust that scope changes go through the same
constitutional-change workflow that governs `effective.config.ts`.
Today they don't: `src/presets/**` is not in the protected-paths
list (which currently covers `effective.config.ts`,
`eslint.config.*`, `tsconfig*.json`, `vitest.config.*`, prettier
configs, `.github/workflows/**`, and `package.json`).

Surfaced in PR 2 of the rc.6 → rc.7 open-issues cleanup: that PR
narrowed `no-hardcoded-secrets`'s `in` glob without triggering the
`protected-paths-respected` rule. The change was correct on the
merits and verified by tests, but the same loophole would let a
less careful PR silently weaken a critical rule's scope — convert a
broad CRITICAL rule into a narrow one with no review surface.

The scope of the question isn't just `recommended.ts`. The same
concern applies to anything in `src/presets/**`:
`recommendedExceptions.ts`, `recommendedProtectedPaths.ts`, future
preset modules. They are all "the constitution shipped to adopters."

**Three paths**:

1. **Add `src/presets/**`to the protected-paths list.** Behaves
like the other constitutional files today: edits trigger CRITICAL
on push, human path uses`--no-verify` with rationale, agent path
   defers to human. Simplest move. Friction cost is highest at
   first — every preset evolution becomes a deliberate process,
   which the bluntness of the current protected-paths rule amplifies
   (every edit is the same severity regardless of weakening vs.
   strengthening, the failure mode flagged in the block-weakening
   entry).
2. **Add `src/presets/**`to protected paths AND ship the`--governance-pr`elevation flag as a coordinated landing.**
Preset edits go through the elevation surface, which keeps the
audit trail visible to the reviewer pass without forcing every
edit through the blunt`--no-verify`. Higher upfront engineering
   cost; substantially cleaner steady state.
3. **Document the convention and leave the rule unenforced.** A
   CONTRIBUTING note saying "preset edits go through review with
   severity/scope rationale" without mechanical enforcement.
   Cheapest; least durable — same drift risk as every other
   "convention without enforcement" entry in this thread.

**Open question**: should this land as part of the governance-PR
elevation rollout (path #2), or ship first as a standalone
protection (path #1) with elevation as a follow-up? Probably tied
to the same `effective-reviewer` package readiness that the
elevation entry depends on — landing path #1 first would create
immediate friction without the elevation valve, which is exactly
the failure mode that trains adopters to `--no-verify` reflexively
(flagged in the block-weakening entry).

The risk of doing nothing: preset evolution silently bypasses the
constitutional-change workflow that adopters were told governs the
rules they're being held to. A future PR could narrow a CRITICAL
rule's `in` glob — converting it to silent precision — without any
review surface firing. Three adjacent governance threads (`agent vs
human protected-path workflow`, `elevated governance-PR mode`,
`block-weakening vs block-every-edit`) already point at elevation
as the unlock; adding `src/presets/**` to the protected scope is
the third (now fourth) piece of evidence that the elevation feature
is the load-bearing capability.

**Related governance-thread entries:**

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)

---

## [Design] Audit walker built-in skips can hide tracked code (dot-entries, basename-anywhere ignored dirs)

**The question.** The rc.8 gitignore work established an invariant for
ignore _rules_: a tracked file is always scanned, even when a
`.gitignore` pattern matches it. The walker's two built-in skip
mechanisms predate that invariant and don't honor it:

1. **Dot-entries are skipped wholesale** (`src/walk.ts`:
   `entry.name.startsWith('.')`). A committed `.config.ts`, or source
   under a committed `.server/` directory, is invisible to `audit`
   regardless of gitignore state.
2. **`DEFAULT_IGNORED_DIRS` matches by basename anywhere in the tree.**
   A tracked file under any directory named `build`, `out`, or
   `coverage` (e.g. `src/out/render.ts`) is silently unscanned — and a
   worker optimizing against the gate could park violating code in a
   directory with a blacklisted basename.

Surfaced by the 2026-07-07 security review as the residual evasion
channel after the gitignore fix deliberately left built-in skips
untouched (`.effective/` must stay skipped even under
`respectGitignore: false`).

**Three paths**:

1. **Extend the tracked-wins invariant to built-in skips.** After the
   walk, add back any _tracked_ file that a built-in skip excluded
   (one extra `git ls-files` pass, already computed for the gitignore
   filter). `.git`/`.effective` stay excluded unconditionally. Most
   consistent with the rc.8 invariant; slightly widens the audit set
   for repos that commit build output on purpose.
2. **Anchor built-in skips to the root.** Only skip `dist`/`build`/
   `out`/`coverage` at the repo root (where they're conventionally
   output dirs), not at arbitrary depth. Cheaper; doesn't fix
   dot-entries; root-relative conventions vary across monorepos.
3. **Document as a known boundary.** The gitignore fix covers the
   common case; note in USAGE that tracked code inside dot-dirs or
   output-named dirs is outside the audit's sight. Weakest — there is
   currently no opt-in knob to pull such a directory back in.

**Open question**: does "tracked wins" generalize from ignore rules to
built-in skips (path 1), or are built-in skips a different contract
("we never scan build output, tracked or not")? Path 1 matches the
security framing; the counterargument is repos that commit `dist/` for
GitHub-Pages-style deploys and don't want it audited.

The risk of doing nothing: the gitignore invariant advertises "an
ignore rule can't hide committed code" while a directory rename
(`notes/` → `.notes/`) achieves exactly that hiding, silently.

---

## [Design] Content-scanner hardening: file-size caps, regex budget, region-classifier limits

**The question.** The 2026-07-07 security review traced three
scanner-hardening gaps that share one trust-model root — repo
_content_ is semi-adversarial (the product premise), yet the scanners
assume friendly input:

1. **No per-file size cap.** `audit` reads every walked file fully
   into memory (`src/audit.ts`) and runs every pattern rule and the
   escape-hatch regexes over it; a very large generated file drives
   pathological CPU/memory.
2. **No regex budget.** Constitution-supplied `RegExp` sources run
   verbatim with no timeout (consistent with "config is trusted," now
   documented), but even the built-in escape-hatch patterns
   (`[^*]*` / `[^\n]*` shapes in `src/escape-hatches/scan.ts`) have no
   engine-side time bound against adversarial content.
3. **Region classifier is heuristic.** `src/syntax-regions.ts`
   documents that regex literals classify as `code` and template
   `${…}` interpolations as `string`; a worker can position forbidden
   code inside a template interpolation to evade a code-only pattern
   rule. The toolchain gate (real eslint/tsc) is the authoritative
   layer, but the pattern rules present as load-bearing.

Related: submodule semantics are undefined — the walker descends into
submodule working trees whose files are untracked in the superproject,
so they're scanned (or gitignore-skipped) under superproject rules
rather than their own constitution's.

**Three paths**:

1. **Cap + degrade loudly.** Per-file byte cap (e.g. 2 MiB) above
   which pattern scanning skips the file and emits a LOW
   "file too large to scan" finding; document the regex-trust
   boundary (done in rc.8 docs) and leave rule regexes unbounded.
2. **Full sandbox.** RE2 / worker-thread timeouts for all content
   regexes. Strongest; heavy dependency and semantics drift (RE2
   lacks lookbehind/backrefs) for a threat the toolchain gate already
   bounds.
3. **Status quo + docs.** Trust-model docs note the boundaries;
   revisit when an adopter hits a real pathological case.

**Open question**: is the scan layer a security boundary or a
convenience layer in front of the toolchain gate? If convenience
(current stance), path 1 is proportionate: loud degradation, no new
dependencies. If boundary, path 2 becomes necessary and the region
classifier needs the same treatment.

The risk of doing nothing: a single 200 MB generated artifact in a
walked directory turns `audit` from seconds into minutes-or-OOM, and
the failure presents as a hang rather than a finding.

---

## [Design] `verify()` ignores `scope.relatedRules` while `prepare()` honors it

**The question.** `selectApplicableRules` (src/rules/selection.ts)
narrows the rule set by `scope.relatedRules` and is used by
`prepare()` — the agent's prompt shows only the pinned rules. But
`verify()` iterates every resolved rule and filters only by role, so
a scope pinned via `relatedRules` is verified against the full set.
The direction is safe (verify checks more than it promised), but the
prompt's "the rules above will be checked" contract is broken:
findings can cite rules the prompt never showed. Surfaced by the
2026-07-07 code-quality review; the stale doc comment claiming verify
uses the selection was corrected in the same session, so what remains
is the genuine design question.

**Three paths**:

1. **Make verify honor `relatedRules`.** Symmetric with prepare;
   narrows enforcement, so a mis-authored scope could accidentally
   exempt work from foundation rules — the gate's strength would
   depend on prompt-authoring discipline.
2. **Keep verify-checks-everything; make prepare say so.** One line in
   the prompt footer ("other constitutional rules still apply") plus
   docs. Preserves gate strength; the prompt stops over-promising.
3. **Split the field.** `relatedRules` stays prompt-only emphasis;
   a separate explicit `scope.onlyRules` (opt-in, loud) narrows
   verification for the rare caller who truly wants it.

**Open question**: is `relatedRules` emphasis (2) or scoping (1)?
Current behavior treats it as emphasis; the name suggests emphasis;
the doc drift suggests the original intent was scoping. Leaning (2) —
gate strength should not be prompt-authorable.

The risk of doing nothing: agents optimized against the prompt learn
that unlisted rules still bite, which is the right failure direction —
but human scope authors keep writing `relatedRules` expecting it to
scope verification, and their mental model breaks on the first
surprise finding.

---

## [Feature] Configurable coverage threshold

**The question.** `parseV8` hard-codes `COVERAGE_THRESHOLD = 90`
(src/toolchain/parsers/v8.ts); `ToolchainConfig` offers no knob, and
the recommended preset's guidance ("do not lower the threshold")
assumes 90 for every adopter. A project with a legitimately different
bar (legacy code ratcheting up from 60, or a 100%-or-nothing library)
can only fork the parser or supply synthetic `toolchainResults`.
Surfaced by the 2026-07-07 code-quality review.

**Three paths**:

1. **`toolchain.coverageThreshold: number`** on ToolchainConfig,
   threaded to the parser at `collectToolchainResults` time. One knob,
   schema-validated, default 90 — matches how parsers are already
   resolved per-config. Parser signature grows a config parameter.
2. **Rule-level param.** Put the threshold on the
   `coverage-meets-threshold` rule definition (rules already carry
   per-rule config like `in` globs). More local to the rule that
   consumes it; but the _parser_ produces the findings today, so the
   threshold would have to migrate from parser to rule evaluation.
3. **Leave at 90; document the fork path.** Zero code; pushes every
   differing adopter to customChecks.

**Open question**: whether the threshold check belongs in the parser
(where it lives now, producing findings) or in the rule evaluation
layer (where severity/config normally live). Option 2 is the cleaner
end-state; option 1 is the pragmatic near-term knob. Ratchet-style
"coverage non-decreasing vs. baseline" is tracked separately under
the baseline/ratchet entry above.

The risk of doing nothing: adopters below 90 disable the rule
entirely, losing the gate instead of tuning it.

---

## Other items observed but not yet pressing

Quick log of things that surfaced during rc.3 → rc.5 prep but didn't
need immediate action. None are bugs; each is a "we should think
about this before stable":

- **`npm dist-tag latest` requires manual sync after every rc
  publish.** First publish set `latest = rc.3`; subsequent `pnpm
publish --tag rc` only updates `rc`. Could be scripted (a
  `release` npm script that runs publish + `npm dist-tag add` in
  sequence). Resolves automatically when 0.1.0 stable ships (the
  unstamped publish moves `latest` naturally).

- **`prepareWorktree` install-step error path could be smoother.**
  Currently throws with the last 15 stderr lines if `pnpm install
--frozen-lockfile` (etc.) fails. Hasn't been hit yet, but if a
  worktree's install fails mid-creation, the next verify call's
  cleanup might leave artifacts. Worth a smoke test.

- **Worktree install runs every verify** even when the lockfile
  hasn't changed. Workarounds exist (`--keep-worktree=always
--skip-install`), but smarter caching would be a nice DX win —
  e.g., hash the lockfile and skip install when the hash matches.

- **`lineFor()` / `locate()` rescan from offset 0 per match.**
  Both the escape-hatch scanner's and the pattern rule's
  line-number helpers walk the file from the start for every match,
  which is quadratic on match-dense large files. Fine at current
  scale; becomes visible if the per-file size cap discussion (see
  content-scanner hardening entry) resolves toward scanning bigger
  files. Precompute a line-offset index per file when it matters.

- **zod peer range admits v4 but only v3 is tested.** The peer range
  is `>=3.22.0 <5`, while devDependencies/CI pin zod 3.x. Either CI
  should add a zod-4 matrix leg or the range should narrow until
  someone verifies v4 compatibility (`z.record` signatures and
  error-shape changes are the likely break points).

- **`no-hardcoded-secrets` is a partial overlay, not the real
  secrets net.** The rule's `in` glob (narrowed in rc.7) covers
  source + JSON/YAML, and the audit walker only reads JS/TS
  extensions anyway — `.env`, `.pem`, Dockerfiles, and shell scripts
  are out of scope. The layered defense is secretlint (`pnpm
secrets`, glob `**/*`). Docs should say so wherever the rule is
  pitched, so adopters don't over-trust it.

- **Config discovery walks above the repo root.** `findConfigFile`
  walks from cwd to the filesystem root, and the config is
  jiti-executed — running `effective` inside an untrusted subtree
  can execute an ancestor directory's `effective.config.ts`. Trust
  model now documents it; consider stopping the walk at the
  enclosing git toplevel (first directory containing `.git`) as a
  cheap containment.

These are noted, not assigned, not blocking. (The former
"`CHANGELOG.md` not in the npm tarball" item graduated: `files` now
ships `CHANGELOG.md` and `USAGE.md` as of the 2026-07-07 review
session.)

---

## Future additions

New entries go above "Other items observed but not yet pressing." Format guide and lifecycle (open issue → decided → migrated to `docs/decisions.md` + changelog) are at the top of this file under "How to add an entry."
