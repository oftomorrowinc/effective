# Changelog

All notable changes to `effective` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **Severity overrides now reach `exceptions.must-cite-justification`
  findings.** The built-in escape-hatch check was the only custom
  check that dropped the resolved rule severity on the floor, so a
  config `override` on this rule never affected its findings — they
  reported at hardcoded CRITICAL (missing/unknown/retired/
  wrong-mechanism citations) and HIGH (deprecated citations)
  regardless. The check now derives every finding class's severity
  from the resolved rule: the four hard classes report at the rule's
  (override-aware) severity, and deprecated citations keep their
  deliberate one-notch-lower placement relative to it (CRITICAL→HIGH,
  HIGH→MED, MED→LOW, LOW floors at LOW). With no override declared,
  behavior is unchanged. Affected both `verify` and `audit`; reported
  by the external Python+JS pilot during the rc.5→rc.6 cycle and
  tracked in `docs/known-bugs.md` until now.

## [0.1.0-rc.8] — 2026-07-07

### Added

- **`verify --governance-pr` — the elevation surface for intentional
  constitutional changes.** When a PR's purpose IS the protected-path
  edit (version bump, rule addition, workflow change), the flag moves
  protected-path findings out of the gating set: the verdict and exit
  code are computed from everything else, while the elevated findings
  are still printed in a dedicated `Governance changes` section (JSON
  reporter: `governanceFindings`) so the elevation stays auditable.
  All other findings gate exactly as before — a real bug in the same
  diff still fails the run. Rules are matched by their wiring to the
  built-in `protectedPathsRespected` check, not by id, so renamed
  rules in adopter configs are still covered. This repo's CI passes
  the flag when a PR carries the `governance` label, replacing the
  previous convention of merging governance PRs over a red check.

### Fixed

- **Count-based toolchain gates no longer treat unparseable output as
  clean.** Parsers now omit `count` (instead of reporting 0) when the
  output lacks the structure they understand — wrong reporter format,
  crash before reporting, an accepted-but-unimplemented parser hint
  (`biome`, `oxlint`, `custom`), or a coverage JSON without a `total`
  row. `count-non-zero` / `count-increased` rules fall back to the
  command's exit code when `count` is absent, with a finding message
  saying the output couldn't be parsed. Previously a lint run with 37
  real errors under an unsupported hint produced a PASS verdict —
  "couldn't measure" and "measured zero" are now distinct everywhere.
- **`verify --staged` reads content from the index, not the working
  tree.** `loadStagedDiff` now reads via `git show :0:<path>`, so a
  fix that exists only on disk can't make a pre-commit verify pass and
  unstaged noise can't fail it. Index reads resolve root-relative,
  which also fixes running `verify --staged` from a repo subdirectory
  (previously every staged file silently verified as EMPTY content —
  the ENOENT was swallowed).
- **Filenames git would C-quote can no longer dodge verification.**
  `git diff --name-status` is parsed in `-z` (NUL-delimited) form, so
  paths with spaces, quotes, or non-ASCII bytes arrive verbatim.
  Previously the quoted path failed to read and the file was verified
  as empty — a rule-evasion channel via filename. An unreadable
  non-deleted file is now a hard error, never empty content; submodule
  gitlink entries are skipped explicitly.
- **Spec'd test names containing quotes no longer false-flag.** The
  `test-names-land-verbatim` extractor now excludes only the opening
  delimiter from the name, so `it("keeps the user's name")` matches.
- **Preset `extends` cycles fail with the chain** (`a → b → a`)
  instead of a raw stack overflow, and a duplicate rule id within one
  constitution's own `rules` array throws instead of silently
  last-winning (factory-generated ids can collide; cross-layer
  last-wins merging is unchanged).
- **`init` escapes package.json-derived values.** Name, version,
  script-derived commands, and protected paths are emitted as
  JSON-escaped literals in the generated config — a crafted
  `package.json` field can no longer inject executable content into
  the (jiti-executed) `effective.config.ts`.

### Changed

- **Repository-derived git invocations no longer touch a shell.** New
  `runProcess` (argv array, `shell: false`) carries diff listing, blob
  reads, commit metadata, worktree add/remove, and the gitignore
  filter; the POSIX-only single-quote escaping helpers are gone. This
  closes a Windows command-injection vector (cmd.exe ignores
  single-quotes) via crafted filenames or refs. `runCommand`'s shell
  form remains for config-authored toolchain command strings, which
  are trusted code — that boundary is now documented in DESIGN.md's
  trust model.

### Added

- **`runProcess` in the public API** (`ProcessInput` type): the safe
  argv-based sibling of `runCommand` for callers shelling out with
  repository-derived values.
- **Previously-internal load-bearing types are exported:**
  `CustomCheck`, `VerifyContext`, `ChangedFile`, `ChangedFileStatus`,
  `ToolchainResult`, `CommitMetadata`, `InlineSource`, plus
  `resolveConstitution` / `resolveScope` and their
  `ResolveOptions` / `ResolvedConstitution` / `ResolvedScope` types —
  a consumer can now write `const check: CustomCheck = ...` without
  `Parameters<>` gymnastics.
- **`audit` config block on the Constitution** (`AuditConfig` schema):
  `respectGitignore?: boolean` (default `true`) and
  `exclude?: string[]` — picomatch globs carving tracked,
  non-gitignored paths out of the audit walk for the rare on-disk
  directories the constitution shouldn't govern.
- **`runCommand` accepts `stdin`.** Data is written to the child's
  stdin and the stream closed; used to feed `git check-ignore --stdin
-z` NUL-separated paths so filenames never touch a shell.

### Changed

- **`audit` (and `audit-escapes`) now honor `.gitignore` by default.**
  The whole-repo walk previously scanned every source file on disk,
  so a gitignored-but-present directory (a local tool, a scratch
  workspace) produced findings on a workstation that CI — where those
  files never exist — could not reproduce: the gate could false-block
  locally and false-pass in CI at the same time. The walk now skips
  files **git itself would ignore** (untracked _and_ matched by an
  ignore rule, via `git check-ignore`; nested `.gitignore` files,
  `.git/info/exclude`, and global excludes all apply). Tracked files
  are **always** scanned even when an ignore pattern matches them —
  adding a `.gitignore` entry after the fact can never hide committed
  code from the audit; the tracked set (`git ls-files`, which includes
  staged-but-uncommitted files) is checked explicitly rather than
  trusting `check-ignore`'s index handling alone. Outside a git work
  tree the walk is unfiltered, as before. Opt out with
  `audit: { respectGitignore: false }`. `walkSourceFiles` gains a
  `respectGitignore` option (default `true`), and the
  `new-exports-have-non-test-callers` repo walk follows the same
  policy, so a "caller" in a gitignored file no longer counts as
  wiring.
- **`audit-escapes` shares the audit's file walker and `audit`
  config.** It previously had its own near-duplicate walk with a
  divergent skip list (it scanned `out/` and dot-prefixed source
  files; audit didn't), so the two commands could disagree about the
  file set. Both now walk identically and honor
  `audit.respectGitignore` / `audit.exclude`. It loads the project
  config when one is discoverable (still runs with defaults when
  none exists); a config that exists but fails to load is now an
  error rather than being silently ignored.

## [0.1.0-rc.7] — 2026-05-28

### Changed

- **Narrowed `no-hardcoded-secrets` `in` glob to source + config
  files.** The rule previously defaulted to `**/*`, which caught
  Markdown files quoting illustrative token shapes — most notably
  `docs/failure-modes.md` quoting AWS's canonical
  `AKIAIOSFODNN7EXAMPLE` string to demonstrate what the rule
  catches, then firing CRITICAL on its own documentation. The
  rule now scopes to
  `**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,json,yaml,yml}` — TypeScript
  / JavaScript source plus JSON and YAML config (where real secrets
  actually live: credentials files, CI workflows, k8s manifests).
  Adopters wanting broader coverage (e.g., scanning Markdown for
  accidentally-pasted keys) can override `in` per project. Rationale
  captured in `docs/decisions.md` under "Pattern-rule scope:
  source/config by default."

## [0.1.0-rc.6] — 2026-05-14

### Changed (BREAKING)

- **`prepare()` now returns `PreparedAgent` (was `string`).** The new
  shape is `{ prompt, scope, config, mode }`. Callers update one line:

  ```ts
  // before:
  const prompt = prepare({ scope, config, original });

  // after:
  const { prompt } = prepare({ scope, config, original });

  // or, preferred — spread the bundle into verify so the type system
  // enforces that scope+config are the same on both sides:
  const prepared = prepare({ scope, config, original });
  const result = await verify({ ...prepared, source });
  ```

  Motivation surfaced by Core 2.0's runner integration: `prepare()`
  and `verify()` were called in different modules; nothing forced
  the scope and config flowing into both to agree. The bundle fixes
  that at compile time. The 30-second migration cost is worth the
  drift guarantee in 0.x prerelease.

### Added

- **`prepare({ ..., mode: 'concise' })`.** New projection mode for
  high-frequency dispatch in long-running agent runners. Emits role
  identity + editable paths + expectations + one-line summary of
  each applicable rule + brief verification footer. No `guidance`,
  no `examples`, no checklist. Against the recommended preset,
  output drops from ~28 KB (full mode) to ~6 KB — a 4–5× reduction.
  The verify + kickBack loop is the safety net: when an agent
  trips a rule, kickBack already re-emits that rule's full
  guidance, so concise mode at dispatch + full guidance on retry
  avoids front-loading the whole catalogue every step. Default
  remains `'full'`. Requested by Core 2.0's runner — token bill at
  production scale matters. Walked example in
  `docs/examples/agent-loop-integration.md`.

- **`skipCategories` and `skipRules` options on `verify()`; new
  `SkippedRule` shape; `result.skipped` lists what didn't run.**
  Inline-source callers (long-running runners doing per-step gate
  checks) previously had to either spawn toolchain commands at every
  step (slow, wrong-by-design at intermediate commits) or supply
  synthetic passing `toolchainResults` to keep the engine quiet.
  Neither was honest. The new options let a caller declare "this
  invocation doesn't include the toolchain category" and the engine
  skips matching rules cleanly, recording each skip in
  `result.skipped` with reason `'category-excluded'` or
  `'rule-excluded'`. The CLI's `verify --against` path still runs
  everything by default — this is purely the programmatic-API
  affordance to mirror `audit`'s existing `--include-toolchain`
  opt-in but in reverse.

  Existing `AuditSkipReason` type is now an alias for the shared
  `SkippedRule` (both audit and verify return the same shape under
  `result.skipped`); the old name remains exported for
  back-compat. Audit's reasons (`diff-only`, `lane-no-scope`,
  `meta-no-report`, `toolchain-not-included`) are unchanged.

  Requested by Core 2.0's runner (see Core's
  `packages/runner-core/src/gates/effective-verify.ts` Slice 16c —
  workaround was synthetic-passing-results, now replaceable with
  `skipCategories: ['toolchain']`).

## [0.1.0-rc.5] — 2026-05-13

### Fixed

- **JSON-parsing parsers tolerate trailing pnpm/npm noise.** When
  effective spawns a JSON-emitting tool through `pnpm` / `npm` and the
  tool exits non-zero, the wrapping package manager appends an
  ` ELIFECYCLE  Command failed with exit code N` line after the JSON
  output. `parseTrailingJson` previously sliced from the first `{`/`[`
  to end-of-buffer and handed that to `JSON.parse`, which is strict
  about trailing chars and threw — the failure was swallowed and the
  parser returned no findings, so the toolchain rule's
  `count-non-zero` check saw count=0 and effective reported PASS on a
  run with real issues. The shared utility now bracket-counts (respecting
  string literals) to the JSON value's end and parses only that slice.
  Fixes affect every JSON-emitting parser: eslint, vitest, jest, v8/c8
  coverage. Discovered by Core's dogfooding session — verify reported
  "0 issues" on 35 real lint errors.

- **Aggregate toolchain finding omits raw-output tail when parser
  already produced per-issue findings.** A failing `eslint --format
json` emits a single ~50KB JSON line. The rc.4 stderr-tail feature
  helpfully included that in the aggregate finding's message, which
  drowned the actual per-issue findings under screens of unformatted
  JSON. Now: when the parser produced structured findings, the
  aggregate's message is short (`lint reported 35 issue(s). Fix the
underlying issue.`) and the per-issue findings render normally
  below. The raw tail still appears when no parsed findings exist —
  that's the silent-failure diagnostic path. Also: each tail line is
  capped at 500 chars with a `(N chars truncated)` marker so a single
  super-long line can never dominate the output.

- **tsc parser strips `pnpm -r` workspace prefix and prepends the
  workspace dir to the finding's file path.** `pnpm -r typecheck` in a
  monorepo prefixes every line with `<package-dir> <script-name>: `.
  The previous regex captured `packages/foo typecheck: src/bar.ts` as
  the file path — confusing for humans, broken for any tooling
  resolving the path. The parser now detects the prefix (requires a
  `/` in the dir portion to avoid false matches on `word:` patterns
  inside error messages), strips it, and prepends the workspace dir
  so `location.file` reads `packages/foo/src/bar.ts` — correctly
  editor-clickable and grep-able from the monorepo root. Plain
  single-package `tsc --noEmit` invocations are unaffected.

## [0.1.0-rc.4] — 2026-05-13

### Added

- **`prepareWorktree` runs the project's frozen install in the
  worktree by default.** Detects a `pnpm-lock.yaml` / `yarn.lock` /
  `package-lock.json` and runs `pnpm install --frozen-lockfile` /
  `yarn install --immutable` / `npm ci` respectively inside
  `.effective/work` after `git worktree add`. This is the only way
  per-package `node_modules` directories — which workspace projects
  rely on for `tsc` / `vitest` / etc. invoked from inside a workspace
  package — end up in the worktree, since those directories aren't
  tracked by git and a shared-root symlink can't fabricate them.
  Cost on a warm machine: ~1–3s for pnpm (hard-links from the global
  store), similar for yarn-berry, ~5–10s for npm depending on dep
  count. Adopters can opt out via `--skip-install` (CLI) or
  `skipInstall: true` (programmatic) when iterating with a
  pre-populated worktree (combine with `--keep-worktree=always`) or
  when they've staged `node_modules` some other way. Projects with
  no lockfile fall back to the previous shared-symlink behavior.

- **Toolchain findings now include a tail of the failing command's
  output.** When a toolchain rule fires (lint / typecheck / tests /
  coverage / custom), the aggregate finding's `message` now contains
  up to the last 20 lines of stderr (or stdout if stderr is empty),
  framed by the existing "exited with code N" line on top and the
  rule's prompt guidance below. Previously the message was just
  "exited with code 1" — adopters had to crawl into `.effective/work`
  to see the actual error. Now the immediate finding shows
  "typecheck exited with code 1\n<the actual TS errors>" and the
  worktree is only needed for the long tail. JSON output carries
  the same expanded message; `evidence` stays as the short
  "exited with code N" form for scriptable filtering.

- **`keepWorktree` option on `verify()` / `--keep-worktree` CLI
  flag.** Controls cleanup of the `.effective/work` worktree after
  a verify run. Three modes: `'on-pass'` (default) keeps the
  worktree if the run produced any CRITICAL finding so the adopter
  can `cd .effective/work && pnpm typecheck` and see the real
  error in context; `'always'` keeps regardless of verdict; `'never'`
  matches the previous behavior (always remove — appropriate for
  ephemeral CI runners). CLI surface: `--keep-worktree`,
  `--keep-worktree=<mode>`, `--no-keep-worktree`. Inline and staged
  sources don't create a worktree, so the option is a no-op for them.

- **New `Rules:` summary row; `escapeHatchCount` and new
  `disabledRulesCount` consolidated there.** The pretty output now
  splits violations and suppression metadata onto separate rows:

  ```
  Findings: 0 total — 0 CRITICAL, 0 HIGH, 0 MED, 0 LOW
  Rules:    4 disabled, 11 skipped, 21 escape hatches
  ```

  The Findings row no longer carries the escape-hatch count. The
  Rules row groups the three "rule enforcement is suppressed or
  inapplicable here" signals:
  - _disabled_ — rules the project's `effective.config.ts` turned
    off via the `disable` map. Previously invisible; now surfaced
    as a drift signal. `disabledRulesCount` added to `VerifyResult`
    and `AuditResult`.
  - _skipped_ — rules the engine couldn't apply in this context
    (audit-only; verify never skips). The existing per-reason
    detail section continues to list which rules and why.
  - _escape hatches_ — third-party-tool suppressions
    (`@ts-expect-error`, `eslint-disable`, `c8 ignore`,
    `prettier-ignore`). Total across the scanned files; for `verify`
    the diff's changed files, for `audit` the full scan.

  The Rules row is omitted in verify when neither count is computable
  (inline-source callers that don't pass a config). Audit always
  renders it. JSON output exposes both fields as top-level result
  properties.

### Changed

- **`toolchain.coverage-non-decreasing` renamed to
  `toolchain.coverage-meets-threshold`; `failOn` corrected from
  `any-output` to `count-non-zero`.** The previous id promised baseline
  comparison the engine doesn't implement, and the `any-output` mode
  fired on every run (coverage tooling always writes a summary,
  regardless of whether thresholds are met). The new rule fires only
  when one or more per-metric thresholds (lines / statements /
  functions / branches < 90%) are actually below floor — surfaced
  through the per-metric findings the v8/c8/istanbul parser already
  emits. Breaking for users with `disable: { 'toolchain.coverage-
non-decreasing': ... }` or override entries — update the key to the
  new id. The "non-decreasing" semantic remains unimplemented; run
  your coverage tool's own baseline check alongside this gate if you
  need it.

- **`runCommand` strips nested-package-manager env pollutants before
  spawning.** When effective itself is invoked via `pnpm exec
effective verify` (or `npx effective ...`, etc.), the outer package
  manager sets `npm_*` / `NPM_*` / `PNPM_*` / `INIT_CWD` vars
  describing its own workspace context. effective's toolchain step
  then spawned the project's own `pnpm typecheck` / `pnpm test` / etc.
  with those vars still attached, and the inner pnpm resolved
  workspace roots from the wrong base — symptoms ranged from
  "TS2307: Cannot find module 'effective'" to test runners exiting
  non-zero with no visible error and coverage producing inconsistent
  output. The fix scrubs the inherited prefixes; caller-supplied
  env (via `runCommand({ env })`) is unaffected. Affects any toolchain
  command effective spawns under any package manager.

## [0.1.0-rc.3] — 2026-05-12

### Added

- **`CONSTITUTION.md` — generated reference of the recommended preset.**
  Human-readable projection of every shipped rule (severity, category,
  role applicability, related principle or catalogue entry, prompt
  summary + guidance + examples), grouped by purpose (foundation,
  catalogue-driven, toolchain wrappers, meta) and sorted by id within
  each group so section anchors are stable. Regenerated via
  `pnpm docs:constitution`; `test/constitution-drift.test.ts` fails CI
  if the committed file falls out of sync. Generator
  (`scripts/generate-constitution.ts`) is deterministic — no date or
  git SHA in the output, so freshness comes from
  `git log CONSTITUTION.md`, not from the file itself. Shipped in the
  npm tarball (added to `package.json` `files`).

### Changed

- **Package renamed to `@oftomorrow/effective`.** The unscoped `effective`
  name on npm was taken by an abandoned 2017 package; scoping under
  `@oftomorrow` aligns with the namespace where future packages
  (`@oftomorrow/effective-reviewer`, etc.) will live. The CLI command
  (`npx effective`) and config file (`effective.config.ts`) are
  unchanged — only the install path and `import` specifier move to the
  scoped form (`pnpm add @oftomorrow/effective`,
  `import { ... } from '@oftomorrow/effective'`).

## [0.1.0-rc.2] — 2026-05-12

### Added

- **`protected-paths-respected` foundation rule.** New CRITICAL rule
  that flags any diff touching files declared under the new
  `Constitution.protected` field. Distinct from the lane rule: lane
  authorizes which files a scope can touch; protected asserts which
  files NO scope touches without elevation. Both can fire on the
  same file. Marked `diffOnly: true` so `audit` skips it cleanly.
- **`Constitution.protected` schema field.** Array of `{ path,
rationale }` entries; the rationale is required (non-empty) so
  adding a protected path forces articulating why it's
  constitutional. Resolved across `extends` so presets can ship
  defaults a project augments. Surfaced through
  `VerifyContext.protectedPaths` and
  `ResolvedConstitution.protectedPaths`; `ProtectedPath` type
  exported from `@oftomorrow/effective`.
- **`src/init/protected-detection.json`** registry. JSON-only
  contribution point for default protected-path candidates. Init
  evaluates per-entry detection predicates (`devDependency`,
  `fileExists`, `dirExists`) against the project shape and emits
  matching entries into the generated config's `protected` field.
  Adding a new candidate (e.g., "if Biome is detected, protect
  `biome.json`") is a JSON-only PR — no engine code change.
- **`docs/reviewer-spec-forward.md`.** Forward spec for the
  separate `effective-reviewer` package — captures the
  citation-substance checks the deterministic engine can't make
  (context match, inline-rationale drift, fix-vs-suppress judgment)
  so they're available when the reviewer is designed.
- **Drift-prevention test** in `test/presets.recommended.test.ts`
  asserting no rule's prompt projection references the obsolete
  `.effective/exceptions.ts` path. Catches stale refs without
  requiring a manual sweep on every schema change.
- **`effective audit` command + programmatic `audit()` function.**
  Walks the repository for source files and runs every applicable
  rule against current state (no diff). Designed for baseline
  establishment at adoption time — surfaces invisible debt that
  diff-based `verify` would otherwise never catch. Skips diff-only
  rules (with reasons reported), lane rules (no scope), meta rules
  (no agent report), and toolchain rules by default
  (`--include-toolchain` opts in). `--rule <id>` filters to one
  rule; `--json` emits machine-readable output. Exits 0 regardless
  of findings — audit is informational, not a gate.
- **`Constitution.diffOnly?: boolean` field on RuleBase.** Lets
  rules declare that they only run meaningfully against a diff.
  `verify()` ignores the field (runs all rules); `audit()` skips
  rules with `diffOnly: true` and reports them as skipped. Two
  existing rules opt in: `migration-has-exercising-test` and
  `new-exports-have-non-test-callers`.
- **`walkSourceFiles()` utility** in `src/walk.ts`, exported via
  the public surface. Recursively walks a tree, returns absolute
  paths to source files, skips conventional ignored directories.
  Replaces three near-duplicate walker implementations across
  `audit`, `audit-escapes`, and the `new-exports` check.
- **LLM-onboarding documentation suite** under `docs/`:
  `agent-prompt.md` (distilled context for an LLM helping a user
  adopt the package), `decisions.md` (decision trees for the
  recurring "which option here?" choices), `failure-modes.md`
  (error → cause → fix mapping), and `examples/typescript-vitest-eslint.md`
  (the canonical project shape with full working config). The agent
  prompt was iterated through two cold-eval passes — a fresh
  subagent attempted onboarding using only the docs, the gaps it
  surfaced drove the revisions. The onboarding sequence now has a
  dedicated "Establish baseline with `audit`" step between init
  and first verify.

### Changed

- **Existing `runAuditCommand` renamed to `runAuditEscapesCommand`.**
  The old `audit` command name now refers to the broader audit; the
  narrow escape-hatch survey lives at `effective audit-escapes`.
  Programmatic imports must update: `runAuditCommand` →
  `runAuditEscapesCommand` from `src/cli/audit-escapes.ts`.
  `AuditCliResult` similarly renamed to `AuditEscapesCliResult`.
- **`dedupeBySignature` exported from `src/verify.ts`.** Was
  private; audit reuses it.

### Fixed

- `effective audit-escapes` stdout referenced the obsolete
  `.effective/exceptions.ts` path; now points at the inline
  `exceptions` field on the Constitution.

## [0.1.0-rc.1] — 2026-05-12

First public pre-release. The engine, schema, CLI, build, and the
recommended preset's prompt projections are all real and stable enough
to publish. Detection coverage on the catalogue rules is intentionally
partial — see [Status in the README](./README.md#status-v010-rc8) for
the per-rule split.

### Added

- **Three pure functions over a Zod-typed Constitution.** `prepare()`,
  `verify()`, and `kickBack()` operate on the same catalogue substrate;
  every rule's prompt projection and check come from a single source.
- **Six rule kinds + a meta kind.** `pattern`, `lane`, `schema`, `spec`,
  `toolchain`, `custom`, and `meta` (reflexive checks that read an
  agent self-report alongside the diff). The `MetaRule` kind's
  presence makes it tractable for verifiers to ask whether claims in a
  build log are corroborated by the actual diff, separate from whether
  the diff itself violates a rule.
- **Recommended preset (`extends: ['recommended']`).** Foundation
  rules — lane, escape-hatch citation, four toolchain wrappers, three
  spec-discipline rules, the two hygiene/security pattern rules — plus
  21 catalogue-driven rules with full prompt projections. Several of
  the catalogue rules have real detection (see Status table); the rest
  ship as registered stubs that return no findings until a real check
  lands, so the prompt projection is still active.
- **Foundation rules with real detection.**
  `lane.editable-respected`, `exceptions.must-cite-justification`,
  `no-stray-debug-output` (hygiene, CRITICAL), `no-hardcoded-secrets`
  (security, CRITICAL), `toolchain.{lint-clean,typecheck-clean,
tests-pass,coverage-non-decreasing}`, `spec.test-names-land-verbatim`,
  `spec.assertions-not-narrowed`, `spec.no-extra-tests-claiming-spec`.
- **Catalogue rules with real detection (Tier 1.1).**
  `no-disabled-tests-without-exception` (CustomRule respecting
  `exception-id:` annotations on adjacent lines),
  `migration-has-exercising-test` (CRITICAL — new migration files
  whose stem isn't mentioned by any test in the diff),
  `new-exports-have-non-test-callers` (HIGH — walks the repo to
  confirm at least one non-test caller for each new export).
- **`commitMetadata` on `VerifyContext`.** Git sources auto-populate
  subject / SHA / author / ISO date from `git log -1`; callers can
  override or add an `attempt` counter via `VerifyInput.commitMetadata`.
- **CLI:** `effective init`, `effective verify`, `effective audit-escapes`,
  `effective rules`. Init detects package manager from lockfile,
  TypeScript from `tsconfig.json`, and test/lint framework from
  `devDependencies` (with ambiguity flagged as `// EDIT:` comments
  in the generated config). Generates a single
  `effective.config.{ts,js}` with the recommended preset extended,
  the toolchain populated, and the exceptions registry inline.
- **Worktree isolation.** `verify()` against a git source materializes
  `.effective/work` as an isolated worktree and runs the toolchain
  there. `.effective/node_modules` persists between runs for speed;
  the first verify is slow (1–5 minutes for install), subsequent runs
  are fast.
- **Self-CI.** This repo's own GitHub Actions pipeline runs
  `effective verify` against PRs (vs. the base ref) and main pushes
  (vs. `HEAD^`).

### Changed

- **Severity vocabulary:** `CRITICAL | HIGH | MED | LOW`. The earlier
  `BLOCK | NIT` names were collapsed before any non-schema code shipped.
- **Exceptions live inline on the Constitution.** The previous two-file
  model (`.effective/exceptions.ts` separate from `effective.config.ts`)
  was collapsed: the Constitution now carries an optional
  `exceptions: ExceptionRegistry` field, and `init` generates a single
  config with `...seeds.builtInExceptions` spread inside. The
  `defineExceptions()` helper remains exported for users who prefer to
  factor exceptions into a separate file and spread back in.
- **Built-in `recommended` preset auto-wired at config load.**
  `loadConfig` and `loadConfigFromPath` now register the recommended
  preset on the resolve options. Configs that say `extends:
['recommended']` no longer need their callers to pass
  `presetRegistry` explicitly.

### Known limitations

- **Catalogue-rule detection is partial.** The README Status section
  enumerates which rules have real detection vs. registered stubs.
  Roughly: foundation rules + four catalogue rules have real checks;
  the remaining ~17 catalogue rules + MetaRule self-report checks
  ship as stubs with active prompt projections. They will gain
  detection incrementally in 0.1.x.
- **`toolchain.coverage-non-decreasing` fails on `any-output`, not
  against a recorded baseline.** Baseline tracking is its own design
  problem; the rule currently triggers on any coverage command output.
  Projects that want diff-bound coverage gates should disable this rule
  and run coverage separately in CI, as this repo does.
- **`new-exports-have-non-test-callers` skips modified files.**
  Distinguishing newly added exports from pre-existing ones in
  modified files needs git baseline diff parsing; for now only files
  added in the diff are scanned.
- **Worktree dependency install is per-project, not orchestrated.** The
  first `effective verify` on a project will run the detected package
  manager's install command into `.effective/node_modules`. Private
  registries, monorepo hoisting, and peerDep conflicts surface as
  install failures at first verify rather than at init.

### Migration notes

- If you adopted an earlier (pre-tag) version with `.effective/exceptions.ts`:
  delete the separate file and move its `defineExceptions({ ... })`
  body into the `exceptions: { ... }` field of `effective.config.ts`.
  The schema accepts the same shape.
