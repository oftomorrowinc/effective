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
- `**Stamp:**` line — see below
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

## Stamps

Every entry in this file carries a stamp. The stamp is the difference
between deferred-by-decision and deferred-by-drift — a 1.0 can ship
the first and cannot honestly ship the second. Introduced in the
1.0.0 triage (2026-09-03), when every entry then open was stamped.

- **`post-1.0 — <milestone>`** — deliberately deferred to a named
  milestone. The stamp says WHY it is safe to defer: the workaround
  that exists, the reason the gate stays sound without it, or the
  evidence the decision is waiting on. "We didn't get to it" is not
  a reason; if that is the true one, the entry wants a different
  stamp.
- **`decide-now`** — the answer ships in or before the named release.
  A decide-now entry is transient: it leaves this file as soon as the
  decision is written down.
- **`closed — <reason>`** — won't do, or overtaken by events. The
  entry leaves the file; the reason lands in the commit and, if it is
  a decision anyone will need to re-read, in `docs/decisions.md`.

An entry with no stamp is a bug in this file.

**Entry lifecycle.** When an item moves from "open issue" to "decided,
in flight," remove it from this file and capture the decision in
`docs/decisions.md` plus the changelog under `[Unreleased]`. Bugs
awaiting reproduction belong in `docs/known-bugs.md` instead. The
audit trail of each entry's history lives in git.

## Table of contents

Grouped by status tag. Body order below stays chronological so the
audit trail of when each issue surfaced is preserved. Every entry
below is stamped `post-1.0`; the entries decided during the 1.0.0
triage left this file for `docs/decisions.md` (see "Decided in the
1.0.0 triage" at the bottom).

### Bugs

_No bug entries currently tracked here — bugs awaiting reproduction live in `docs/known-bugs.md`._

### Precision

- [new-exports-have-non-test-callers blind to tsx scripts + Next.js page modules](#precision-new-exports-have-non-test-callers-blind-to-tsx-scripts--nextjs-page-modules)
- [migration-has-exercising-test fires on pure DDL migrations](#precision-migration-has-exercising-test-fires-on-pure-ddl-migrations)
- [verify mode-banner ergonomics](#precision-verify-mode-banner-ergonomics)

### Design

- [verify --against main semantics on long-lived integration branches](#design-verify---against-main-semantics-on-long-lived-integration-branches)
- [Audit walker built-in skips can hide tracked code](#design-audit-walker-built-in-skips-can-hide-tracked-code-dot-entries-basename-anywhere-ignored-dirs)
- [Content-scanner hardening: file-size caps, regex budget, region-classifier limits](#design-content-scanner-hardening-file-size-caps-regex-budget-region-classifier-limits)

### Feature

- [Modular governance-only preset](#feature-modular-governance-only-preset)
- [Configurable coverage threshold](#feature-configurable-coverage-threshold)

### Other items observed but not yet pressing

- [Other items observed but not yet pressing](#other-items-observed-but-not-yet-pressing) — smaller observations, deferred polish, nice-to-haves

---

## [Precision] `new-exports-have-non-test-callers` blind to tsx scripts + Next.js page modules

**Stamp:** post-1.0 — 1.1. False-positive precision, not a
missed detection: the rule over-reports uncalled exports rather than
under-reporting them, so the gate stays sound while the fix waits.
The walk needs a per-convention extension (tsx entry scripts, Next.js
page modules), which wants real adopter repos to shape it rather than
guesses. Adopters hitting it today `disable` or `override` the rule
with the retirement condition in the rationale.

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

**Stamp:** post-1.0 — 1.1. Same class as the entry above: a false
positive on a real pattern (pure DDL migrations), with `disable` /
`override` as the documented interim. Fixing it means teaching the
rule to read migration content, which is a detection-precision
project rather than a release blocker.

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

**Stamp:** post-1.0 — 1.x. Long-lived integration branches are a
workflow effective does not yet have adopters running at scale; the
semantics should be settled against a real one rather than in the
abstract. `--against` already accepts an explicit ref, so the
workaround is complete if unergonomic.

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

**Related governance-thread entries:** the other four entries this one
sat alongside were all decided in the 1.0.0 triage and now live in
`docs/decisions.md` — "Who may elevate a protected-path edit", "Block
every protected-path edit, or only weakening ones?", and "Are the
shipped presets protected paths?". This entry is what remains open in
that thread.

---

## [Precision] `verify` mode-banner ergonomics

**Stamp:** post-1.0 — 1.1. Presentation only — the banner reports
the right mode, it just reports it noisily. No behavior depends on
it, and no adopter is blocked.

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

## [Feature] Modular governance-only preset

**Stamp:** post-1.0 — 1.1. A new preset is purely additive
(`extends: ['governance']` alongside the existing names), so shipping
it in a 1.x costs nothing that shipping it in 1.0.0 would buy. What
it needs first is the polyglot adopter evidence to say which rules
belong in it — a preset assembled from guesses is the thing this
project's catalogue bar exists to prevent.

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

## [Design] Audit walker built-in skips can hide tracked code (dot-entries, basename-anywhere ignored dirs)

**Stamp:** post-1.0 — 1.1. Kept visible deliberately: this is the
residual evasion channel the rc.8 gitignore work left, and it is a
real one. It is not a release blocker because the invariant it
violates (`tracked wins`) is documented as applying to ignore rules
specifically, not to built-in skips — so 1.0.0 ships a boundary that
is stated rather than a promise that is broken. Closing it means
deciding whether `tracked wins` generalizes, which is the open
question in the entry.

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

**Stamp:** post-1.0 — 1.1. Turns on the unresolved question in the
entry: whether the scan layer is a security boundary or a convenience
layer in front of the toolchain gate. 1.0.0 ships the current stance
(convenience; the toolchain gate is authoritative) documented in the
trust model, which is what makes deferring the hardening honest
rather than silent.

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

## [Feature] Configurable coverage threshold

**Stamp:** post-1.0 — 1.1. Additive config knob, semver-clean to
add in a 1.x. The entry's own open question — parser-level vs
rule-level threshold — should be settled alongside the coverage
ratchet described in the baseline entry (now decided in
`docs/decisions.md`), since both move coverage policy out of the
parser.

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
about this before stable".

**Stamp (whole section):** post-1.0 — 1.1, except the two marked
below. Each item here is a known, bounded shortcoming with the
behavior documented where an adopter would meet it; none changes what
`verify` accepts or rejects, so none gates a stable release. They are
noted, not assigned.

- **`npm dist-tag latest` requires manual sync after every rc
  publish.** First publish set `latest = rc.3`; subsequent `pnpm
publish --tag rc` only updates `rc`. Could be scripted (a
  `release` npm script that runs publish + `npm dist-tag add` in
  sequence). Resolves automatically when 0.1.0 stable ships (the
  unstamped publish moves `latest` naturally). **Stamp: closed at
  1.0.0** — the stable publish moves `latest` with no manual sync, and
  `docs/RELEASING.md` no longer carries the dist-tag step. This item
  ends here.

- **`git.ts` gitlink dead-defense arms look unreachable.** The
  `content === undefined` skip arms in `loadGitDiff`/`loadStagedDiff`
  (`src/source/git.ts`) require `readBlobAt`'s "`git show` failed but
  `cat-file -t` says commit" path. Empirically (2026-07-08): `git
show` SUCCEEDS on a gitlink whose commit exists in the repo (prints
  the commit object), and when the sha is absent BOTH commands fail,
  which takes the throw path instead. So the undefined-return path may
  be dead on modern git. Candidate simplification; verify against
  older git versions before removing — the throw-not-silently-skip
  property is load-bearing.

- **Override-resolution regression net across all built-in checks.**
  The `exceptions.must-cite-justification` severity-override bug
  (fixed 2026-07-08) was one custom check dropping
  `rule.defaultSeverity` while its siblings threaded it. A
  parametrized test that runs EVERY built-in rule through a config
  `override` and asserts the finding severity would catch the next
  drift of this class mechanically instead of via adopter report.
  Needs a per-check triggering fixture, which is why it didn't ship
  with the fix.

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
  error-shape changes are the likely break points). **Stamp:
  post-1.0 — 1.1, flagged as the one item here with a stability
  consequence:** a declared peer range is an API promise, and this one
  promises more than CI proves. It does not block 1.0.0 because the
  range is unchanged from the rc series that adopters already run
  against, but either the matrix leg or the narrowed range should land
  early in 1.x rather than drift.

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

## Decided in the 1.0.0 triage (2026-09-03)

Six entries left this file when the 1.0.0 triage decided them. Each is
written up in `docs/decisions.md`, which is where the reasoning lives
now; git history holds the entries as they stood:

- **Formalizing the agent vs human protected-path workflow** →
  § "Who may elevate a protected-path edit". The actor split stays a
  convention; effective does not enforce self-declared identity.
- **Elevated / governance-PR mode for protected-path edits** → same
  section. Path 1 shipped in rc.8 as `--governance-pr`; the residual
  persisted-audit-trail question is the one part still open, and it is
  tracked under the long-lived-branches entry's governance thread.
- **Block-weakening vs block-every-edit on protected configs** →
  § "Block every protected-path edit, or only weakening ones?".
  Block-every-edit stays; elevation is the answer to the friction.
- **Baseline / ratchet for existing-codebase adoption** →
  § "Adopting effective on an existing codebase". 1.0.0 ships no
  baseline; the shape is settled and the build is post-1.0.
- **`verify()` ignores `scope.relatedRules` while `prepare()` honors
  it** → § "`scope.relatedRules`: emphasis, not scoping". Verify keeps
  checking everything; the prompt stops over-promising.
- **Should `src/presets/**`rule definitions be protected paths?** →
§ "Are the shipped presets protected paths?". Yes — added to`protected`in 1.0.0, now that`--governance-pr` exists to pair with
  it.

---

## Future additions

New entries go above "Other items observed but not yet pressing." Format guide and lifecycle (open issue → decided → migrated to `docs/decisions.md` + changelog) are at the top of this file under "How to add an entry."
