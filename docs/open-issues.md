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

## Table of contents

Grouped by status tag. Body order below stays chronological so the
audit trail of when each issue surfaced is preserved.

### Bugs

- [exceptions.must-cite-justification severity override not honored](#bug-exceptionsmust-cite-justification-severity-override-not-honored) — moves to `docs/known-bugs.md` in a follow-up PR

### Precision

- [no-hardcoded-secrets rule scope](#precision-no-hardcoded-secrets-rule-scope)
- [new-exports-have-non-test-callers blind to tsx scripts + Next.js page modules](#precision-new-exports-have-non-test-callers-blind-to-tsx-scripts--nextjs-page-modules)
- [migration-has-exercising-test fires on pure DDL migrations](#precision-migration-has-exercising-test-fires-on-pure-ddl-migrations)
- [verify mode-banner ergonomics](#precision-verify-mode-banner-ergonomics)

### Design

- [Formalizing the agent vs human protected-path workflow](#design-formalizing-the-agent-vs-human-protected-path-workflow)
- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Elevated / governance-PR mode for protected-path edits](#design-elevated--governance-pr-mode-for-protected-path-edits)
- [Block-weakening vs block-every-edit on protected configs](#design-block-weakening-vs-block-every-edit-on-protected-configs)

### Feature

- [Baseline / ratchet for existing-codebase adoption](#feature-baseline--ratchet-for-existing-codebase-adoption)
- [Modular governance-only preset](#feature-modular-governance-only-preset)

### Other items observed but not yet pressing

- [Other items observed but not yet pressing](#other-items-observed-but-not-yet-pressing) — smaller observations, deferred polish, nice-to-haves

---

## [Precision] `no-hardcoded-secrets` rule scope

**The bug.** The rule's pattern (matching AWS access keys, GitHub
tokens, JWT, Stripe keys, Google API keys, Anthropic keys) defaults
to `**/*` as its `in` glob. In `docs/failure-modes.md` we quote AWS's
canonical "example key" string to demonstrate _what the rule
catches_ — which the rule itself then catches, firing CRITICAL on
its own documentation when the file appears in a diff.

Surfaced in rc.4 PR CI when a docs edit touched `failure-modes.md`.
Same shape as the rc.3 escape-hatch scanner bug: pattern rules with
broad globs catch their own illustrations.

**Three paths**:

1. **Narrow the rule's `in` glob to source / config files**
   (`**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,json,yaml,yml}`). Matches the
   pattern already used by `no-stray-debug-output`. Loses coverage of
   accidentally-leaked keys in `README.md` / docs. Adopters wanting
   broader scope override per project.
2. **Redact the doc example** so the demonstration string doesn't
   match the regex (e.g., introduce a hyphen or lowercase letter
   that breaks the `[0-9A-Z]` character class). Keeps the rule
   broad; weakens the doc slightly because the illustration is now
   obviously fake.
3. **Register a doc-illustration exception** in
   `seeds.builtInExceptions`. Categorically the right modeling
   ("we're demonstrating the pattern, not committing a secret") but
   creates a precedent that may invite misuse.

**Open question**: what's the right default philosophy — "scan
everything, narrow when bitten" (current) or "scan source code only,
broaden when needed" (matches the pattern of every other rule in the
preset)?

Worth noting: every adopter who writes a README quoting an API-key
shape will hit this. Detection-before-exception (Todd's stated
principle) argues for #1.

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

---

## [Bug] `exceptions.must-cite-justification` severity override not honored

**The bug.** Reported by an external adopter (Python+JS pilot
running mixed-source effective): the
`exceptions.must-cite-justification` rule continued to report
CRITICAL in `effective audit` output despite a severity override
declared in the adopter's seeds config. Same override worked
correctly on other rules in the same config.

Two failure modes consistent with the symptom:

1. **Custom-check path bypasses resolved severity.**
   `exceptions.must-cite-justification` may be implemented as a
   custom check rather than a pattern rule, and the custom-check
   evaluator may read the rule's declared severity rather than the
   resolved (override-aware) severity. If true, every custom-check
   rule should resolve severity via the same path as pattern rules.
2. **Override resolution skips `audit` mode.** Verify may apply
   overrides correctly while audit reads raw rule severity. Less
   likely given the shared config-loading layer; audit and verify
   diverged in rc.3 and may still share less than they appear to.

**Reproduction needed.** First step is a minimal JS repro that
overrides `exceptions.must-cite-justification` severity to `LOW`
and confirms `audit` honors it. If it does, the bug is
environment-specific (config shape, source-tree layout, or
rule-resolution order); request a config snapshot from the adopter.
If it doesn't, the bug is reproducible in-house and the rule's
evaluator path is the likely culprit.

**Open question**: should severity-override resolution be tested as
a first-class concern across all built-in rules? Today the override
mechanism is generic and assumed to work uniformly; this report
suggests the assumption may not hold for custom-check rules. A
generic CI test that overrides each built-in rule's severity and
asserts the resolved value at evaluation time would catch this class
of bug before adopters do.

Highest-priority item in this batch because it undermines the
override mechanism itself — every other governance affordance
assumes overrides work as declared.

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

- **Coverage non-decreasing semantics not yet implemented.** Renamed
  to `coverage-meets-threshold` in rc.4 to match what the engine
  actually does. The "did coverage drop from main?" check is still a
  real adopter need — would require baseline tracking on disk or
  injected through `verify()`. Worth designing once a real adopter
  asks for it.

- **`prepareWorktree` install-step error path could be smoother.**
  Currently throws with the last 15 stderr lines if `pnpm install
--frozen-lockfile` (etc.) fails. Hasn't been hit yet, but if a
  worktree's install fails mid-creation, the next verify call's
  cleanup might leave artifacts. Worth a smoke test.

- **Worktree install runs every verify** even when the lockfile
  hasn't changed. Workarounds exist (`--keep-worktree=always
--skip-install`), but smarter caching would be a nice DX win —
  e.g., hash the lockfile and skip install when the hash matches.

- **`CHANGELOG.md` not in the npm tarball.** The `files` array in
  `package.json` ships `README.md`, `LICENSE`, `CONTRIBUTING.md`,
  `CONSTITUTION.md`, and `dist/`. Adopters reading the package on
  npmjs.com can't see what changed between releases without
  navigating to GitHub. One-line fix: add `"CHANGELOG.md"` to
  `files`. Land with any next protected-path PR (since touching
  `package.json` already requires the admin-bypass dance for the
  version bump). Cheap, no downsides, just got missed.

These are noted, not assigned, not blocking.

---

## Future additions

New entries go above "Other items observed but not yet pressing."
Format guide at the top under "How to add an entry."

If an item moves from "open issue" to "decided, in flight," remove
the entry from this file and capture the decision in
`docs/decisions.md` plus the changelog under `[Unreleased]`. The
audit trail lives in git history.
